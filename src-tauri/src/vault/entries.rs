use serde_json::{json, Value};
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::vault_layout;

use super::config::now_string;
use super::metadata::{read_json_or, write_json};
use super::types::VaultDescriptor;

type R<T> = Result<T, String>;
const MARKDOWN_PREVIEW_LIMIT: usize = 64 * 1024;

pub fn normalize_relative_path(path: &str) -> String {
  path.replace('\\', "/")
    .split('/')
    .filter(|part| !part.is_empty() && *part != "." && *part != "..")
    .collect::<Vec<_>>()
    .join("/")
}

pub fn inside(vault_root: &str, relative_path: &str) -> PathBuf {
  let relative_path = normalize_relative_path(relative_path);
  if relative_path.is_empty() { PathBuf::from(vault_root) } else { PathBuf::from(vault_root).join(relative_path) }
}

fn canonical_root(root: &str) -> R<PathBuf> {
  let root = PathBuf::from(root);
  fs::create_dir_all(&root).map_err(|e| e.to_string())?;
  fs::canonicalize(root).map_err(|e| e.to_string())
}

fn existing_path_inside_vault(vault_root: &str, relative_path: &str) -> R<PathBuf> {
  let root = canonical_root(vault_root)?;
  let path = fs::canonicalize(inside(vault_root, relative_path)).map_err(|e| e.to_string())?;
  if !path.starts_with(&root) {
    return Err(format!("Refusing to access a path outside the active vault: {}", path.to_string_lossy()));
  }
  Ok(path)
}

fn writable_dir_inside_vault(vault_root: &str, relative_path: &str) -> R<PathBuf> {
  let root = canonical_root(vault_root)?;
  let directory = inside(vault_root, relative_path);
  fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
  let directory = fs::canonicalize(directory).map_err(|e| e.to_string())?;
  if !directory.starts_with(&root) {
    return Err(format!("Refusing to write outside the active vault: {}", directory.to_string_lossy()));
  }
  Ok(directory)
}

fn sanitize_leaf_name(value: Option<String>, fallback: &str, force_markdown: bool) -> R<String> {
  let mut name = value.filter(|value| !value.trim().is_empty()).unwrap_or_else(|| fallback.to_string());
  name = name.trim().replace('\\', "/");
  if name.contains('/') || name == "." || name == ".." || name.contains('\0') {
    return Err(format!("Invalid entry file name: {name}"));
  }
  if name.starts_with('.') || name.ends_with('~') || name.ends_with(".tmp") {
    return Err(format!("Refusing unsafe entry file name: {name}"));
  }
  if force_markdown && !name.to_ascii_lowercase().ends_with(".md") {
    name.push_str(".md");
  }
  Ok(name)
}

fn metadata_updated_at(metadata: &fs::Metadata) -> String {
  metadata
    .modified()
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_secs().to_string())
    .unwrap_or_else(now_string)
}

pub fn is_ignored_entry(name: &str) -> bool {
  name == vault_layout::HIDDEN_ROOT
    || name == ".git"
    || name == "node_modules"
    || name.starts_with('.')
    || name.ends_with('~')
    || name.ends_with(".tmp")
}

fn read_text_prefix(path: &Path, max_bytes: usize) -> R<String> {
  let file = fs::File::open(path).map_err(|e| e.to_string())?;
  let mut limited = file.take(max_bytes as u64);
  let mut buffer = Vec::with_capacity(max_bytes.min(8 * 1024));
  limited.read_to_end(&mut buffer).map_err(|e| e.to_string())?;
  Ok(String::from_utf8_lossy(&buffer).to_string())
}

fn markdown_title(markdown: &str, fallback: &str) -> String {
  for line in markdown.lines() {
    if let Some(title) = line.strip_prefix("title:") {
      return title.trim().trim_matches('"').to_string();
    }
  }
  markdown
    .lines()
    .find_map(|line| line.strip_prefix("# ").map(|value| value.trim().to_string()))
    .unwrap_or_else(|| fallback.trim_end_matches(".md").to_string())
}

fn strip_frontmatter(markdown: &str) -> String {
  let raw = markdown.trim_start();
  if !raw.starts_with("---") {
    return raw.to_string();
  }

  let lines = raw.lines().collect::<Vec<_>>();
  if lines.first().map(|line| line.trim()) == Some("---") {
    if let Some(close_index) = lines
      .iter()
      .enumerate()
      .skip(1)
      .find_map(|(index, line)| (line.trim() == "---").then_some(index))
    {
      return lines
        .iter()
        .skip(close_index + 1)
        .copied()
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string();
    }
  }

  if let Some(first_line) = lines.first().and_then(|line| line.strip_prefix("---")) {
    if let Some(close_index) = first_line.find("---") {
      let mut body = first_line[close_index + 3..].trim_start().to_string();
      let remaining = lines.iter().skip(1).copied().collect::<Vec<_>>().join("\n");
      if !remaining.trim().is_empty() {
        if !body.is_empty() {
          body.push('\n');
        }
        body.push_str(&remaining);
      }
      return body.trim().to_string();
    }
  }

  raw.to_string()
}

fn markdown_excerpt(markdown: &str) -> String {
  let body = strip_frontmatter(markdown);
  let mut excerpt_lines = Vec::new();
  let mut can_skip_leading_title = true;

  for line in body.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed == "---" {
      continue;
    }
    if can_skip_leading_title && trimmed.starts_with("# ") {
      can_skip_leading_title = false;
      continue;
    }
    can_skip_leading_title = false;
    excerpt_lines.push(trimmed.to_string());
    if excerpt_lines.len() >= 3 {
      break;
    }
  }

  excerpt_lines.join(" ")
}

fn direct_markdown_note_count(path: &Path) -> usize {
  fs::read_dir(path)
    .ok()
    .map(|children| {
      children
        .filter_map(Result::ok)
        .filter(|child| {
          let name = child.file_name().to_string_lossy().to_string();
          !is_ignored_entry(&name) && name.to_ascii_lowercase().ends_with(".md")
        })
        .count()
    })
    .unwrap_or(0)
}

pub fn list_directory(vault: &VaultDescriptor, relative_path: &str) -> R<Vec<Value>> {
  let mut entries = Vec::new();
  let directory = existing_path_inside_vault(&vault.path, relative_path)?;

  for item in fs::read_dir(directory).map_err(|e| e.to_string())? {
    let item = item.map_err(|e| e.to_string())?;
    let name = item.file_name().to_string_lossy().to_string();
    if is_ignored_entry(&name) {
      continue;
    }

    let path = item.path();
    let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
      continue;
    }
    let child_relative = normalize_relative_path(&format!("{}/{}", relative_path, name));

    if metadata.is_dir() {
      entries.push(json!({
        "kind": "folder",
        "title": name,
        "path": child_relative,
        "noteCount": direct_markdown_note_count(&path),
        "updatedAt": metadata_updated_at(&metadata),
        "type": "folder",
        "tags": [],
        "createdAt": "",
        "excerpt": "",
        "coverImage": ""
      }));
    } else if metadata.is_file() && name.to_ascii_lowercase().ends_with(".md") {
      let preview = read_text_prefix(&path, MARKDOWN_PREVIEW_LIMIT).unwrap_or_default();
      let title = markdown_title(&preview, &name);
      let excerpt = markdown_excerpt(&preview);
      entries.push(json!({
        "kind": "note",
        "title": title,
        "path": child_relative,
        "filename": name,
        "updatedAt": metadata_updated_at(&metadata),
        "type": "note",
        "tags": [],
        "createdAt": "",
        "excerpt": excerpt,
        "coverImage": ""
      }));
    }
  }

  Ok(entries)
}

fn next_available_name(directory: &Path, base: &str) -> String {
  if !directory.join(base).exists() {
    return base.to_string();
  }

  let stem = base.trim_end_matches(".md");
  let ext = if base.ends_with(".md") { ".md" } else { "" };
  let mut i = 2;
  loop {
    let candidate = format!("{} {}{}", stem, i, ext);
    if !directory.join(&candidate).exists() {
      return candidate;
    }
    i += 1;
  }
}

pub fn create_note(vault: &VaultDescriptor, relative_path: Option<String>, filename: Option<String>, title: Option<String>) -> R<Value> {
  let relative_path = normalize_relative_path(&relative_path.unwrap_or_default());
  let directory = writable_dir_inside_vault(&vault.path, &relative_path)?;

  let filename = sanitize_leaf_name(filename, "Untitled.md", true)?;
  let filename = next_available_name(&directory, &filename);
  let full_path = directory.join(&filename);
  let title = title.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| filename.trim_end_matches(".md").to_string());

  if !full_path.exists() {
    let stamp = now_string();
    fs::write(
      &full_path,
      format!("---\ntitle: \"{}\"\ntype: \"note\"\ntags: []\ncreatedAt: \"{}\"\nupdatedAt: \"{}\"\n---\n\n# {}\n", title.replace('"', "\\\""), stamp, stamp, title),
    ).map_err(|e| e.to_string())?;
  }

  Ok(json!({
    "note": { "path": normalize_relative_path(&format!("{}/{}", relative_path, filename)), "fullPath": full_path.to_string_lossy(), "title": title },
    "entries": list_directory(vault, &relative_path)?
  }))
}

pub fn create_folder(vault: &VaultDescriptor, relative_path: Option<String>) -> R<Value> {
  let relative_path = normalize_relative_path(&relative_path.unwrap_or_default());
  let directory = writable_dir_inside_vault(&vault.path, &relative_path)?;
  let folder = next_available_name(&directory, "New Folder");
  let full_path = directory.join(&folder);
  fs::create_dir_all(&full_path).map_err(|e| e.to_string())?;

  Ok(json!({
    "folder": { "path": normalize_relative_path(&format!("{}/{}", relative_path, folder)), "fullPath": full_path.to_string_lossy() },
    "entries": list_directory(vault, &relative_path)?
  }))
}

pub fn attach_sidebar_entry(vault: &VaultDescriptor, relative_path: String, title: Option<String>, entry_type: Option<String>) -> R<Value> {
  let mut workspace = read_json_or(vault_layout::config_file(&vault.path, vault_layout::WORKSPACE_FILE), json!({ "sidebar": [] }));
  let normalized = normalize_relative_path(&relative_path);
  let mut sidebar = workspace.get("sidebar").and_then(Value::as_array).cloned().unwrap_or_default();
  sidebar.retain(|entry| entry.get("path").and_then(Value::as_str) != Some(normalized.as_str()));
  sidebar.push(json!({
    "id": normalized.replace('/', "-"),
    "title": title.unwrap_or_else(|| Path::new(&normalized).file_name().and_then(|name| name.to_str()).unwrap_or("Entry").trim_end_matches(".md").to_string()),
    "type": entry_type.unwrap_or_else(|| if normalized.ends_with(".md") { "note".to_string() } else { "folder".to_string() }),
    "path": normalized,
    "collapsed": false
  }));
  workspace["sidebar"] = json!(sidebar);
  write_json(vault_layout::config_file(&vault.path, vault_layout::WORKSPACE_FILE), &workspace)?;
  Ok(json!({ "workspace": workspace, "entries": list_directory(vault, "")? }))
}

pub fn detach_sidebar_entry(vault: &VaultDescriptor, relative_path: String) -> R<Value> {
  let mut workspace = read_json_or(vault_layout::config_file(&vault.path, vault_layout::WORKSPACE_FILE), json!({ "sidebar": [] }));
  let normalized = normalize_relative_path(&relative_path);
  let mut sidebar = workspace.get("sidebar").and_then(Value::as_array).cloned().unwrap_or_default();
  sidebar.retain(|entry| entry.get("path").and_then(Value::as_str) != Some(normalized.as_str()));
  workspace["sidebar"] = json!(sidebar);
  write_json(vault_layout::config_file(&vault.path, vault_layout::WORKSPACE_FILE), &workspace)?;
  Ok(json!({ "workspace": workspace, "entries": list_directory(vault, "")? }))
}

pub fn rename_entry(vault: &VaultDescriptor, relative_path: String, title: String) -> R<()> {
  let source = existing_path_inside_vault(&vault.path, &relative_path)?;
  let parent = source.parent().ok_or_else(|| "Cannot rename vault root.".to_string())?;
  let safe = sanitize_leaf_name(Some(title), "Untitled", source.extension().and_then(|e| e.to_str()) == Some("md"))?;
  let destination = parent.join(safe);
  if destination.exists() {
    return Err("Cannot rename entry because the target already exists.".to_string());
  }
  fs::rename(&source, destination).map_err(|e| e.to_string())
}

pub fn move_entry(vault: &VaultDescriptor, relative_path: String, target_directory_path: Option<String>) -> R<()> {
  let source = existing_path_inside_vault(&vault.path, &relative_path)?;
  let target_dir = writable_dir_inside_vault(&vault.path, target_directory_path.as_deref().unwrap_or(""))?;
  if target_dir.starts_with(&source) {
    return Err("Cannot move a folder into itself.".to_string());
  }
  let name = source.file_name().ok_or_else(|| "Invalid source path.".to_string())?;
  let destination = target_dir.join(name);
  if destination.exists() {
    return Err("Cannot move entry because the target already exists.".to_string());
  }
  fs::rename(&source, destination).map_err(|e| e.to_string())
}

pub fn delete_entry(_vault: &VaultDescriptor, _relative_path: String) -> R<Value> {
  Err("Deletion is intentionally disabled until trash support is implemented.".to_string())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn normalizes_relative_paths() {
    assert_eq!(normalize_relative_path("a//b/./c.md"), "a/b/c.md");
    assert_eq!(normalize_relative_path("../secret.md"), "secret.md");
  }

  #[test]
  fn ignores_hidden_entries() {
    assert!(is_ignored_entry(".elephantnote"));
    assert!(is_ignored_entry(".git"));
    assert!(!is_ignored_entry("Projects"));
  }

  #[test]
  fn rejects_path_like_note_filenames() {
    assert!(sanitize_leaf_name(Some("../secret.md".to_string()), "Untitled.md", true).is_err());
    assert!(sanitize_leaf_name(Some("nested/file.md".to_string()), "Untitled.md", true).is_err());
    assert_eq!(sanitize_leaf_name(Some("Note".to_string()), "Untitled.md", true).unwrap(), "Note.md");
  }

  #[test]
  fn preview_reads_are_bounded() {
    let dir = std::env::temp_dir().join(format!("elephant-entry-preview-{}", now_string()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("large.md");
    fs::write(&path, format!("---\ntitle: \"Fast\"\n---\n\n{}", "x".repeat(MARKDOWN_PREVIEW_LIMIT * 2))).unwrap();

    let preview = read_text_prefix(&path, 128).unwrap();
    assert!(preview.len() <= 128);
    assert!(preview.contains("title"));

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn extracts_excerpt_after_yaml_frontmatter_and_title() {
    let markdown = "---\ntitle: \"Noteh\"\ntype: \"note\"\ntags: []\n---\n\n# Noteh\n\nFirst useful line.\nSecond useful line.";
    assert_eq!(markdown_excerpt(markdown), "First useful line. Second useful line.");
  }

  #[test]
  fn extracts_excerpt_after_inline_frontmatter() {
    let markdown = "--- title: \"Noteh\" type: \"note\" --- Real content starts here.\nSecond line.";
    assert_eq!(markdown_excerpt(markdown), "Real content starts here. Second line.");
  }

  #[test]
  fn keeps_scaffold_note_excerpt_empty() {
    let markdown = "---\ntitle: \"Empty\"\ntype: \"note\"\ntags: []\n---\n\n# Empty\n";
    assert_eq!(markdown_excerpt(markdown), "");
  }

  #[test]
  fn list_directory_uses_clean_note_excerpts() {
    let unique = std::time::SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    let root = std::env::temp_dir().join(format!("elephantnote-preview-test-{unique}"));
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("Noteh.md"), "---\ntitle: \"Noteh\"\ntype: \"note\"\n---\n\n# Noteh\n\nVisible preview.").unwrap();

    let vault = VaultDescriptor {
      id: "test".to_string(),
      name: "Test".to_string(),
      path: root.to_string_lossy().to_string(),
      icon: String::new(),
      last_opened_at: "0".to_string(),
    };

    let entries = list_directory(&vault, "").unwrap();
    fs::remove_dir_all(&root).ok();

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].get("excerpt").and_then(Value::as_str), Some("Visible preview."));
    assert_eq!(entries[0].get("title").and_then(Value::as_str), Some("Noteh"));
  }
}

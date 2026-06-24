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
const MARKDOWN_PREVIEW_LIMIT: usize = 16 * 1024;
const MAX_PREVIEW_LINE_BYTES: usize = 2048;
const PREVIEW_READ_CHUNK_BYTES: usize = 2048;
const EXCERPT_LINE_LIMIT: usize = 3;

struct DirectorySeed {
  name: String,
  sort_name: String,
  path: PathBuf,
  metadata: fs::Metadata,
  child_relative: String,
  is_dir: bool,
}

#[derive(Debug, Eq, PartialEq)]
struct NotePreview {
  title: String,
  excerpt: String,
}

#[derive(Eq, PartialEq)]
enum PreviewParseMode {
  Start,
  Frontmatter,
  Body,
}

struct PreviewBuilder {
  fallback_title: String,
  title: Option<String>,
  excerpt: String,
  excerpt_lines: usize,
  mode: PreviewParseMode,
  can_skip_leading_title: bool,
}

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
  if force_markdown && !is_markdown_name(&name) {
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

fn is_markdown_name(name: &str) -> bool {
  name
    .get(name.len().saturating_sub(3)..)
    .map(|suffix| suffix.eq_ignore_ascii_case(".md"))
    .unwrap_or(false)
}

fn markdown_stem(name: &str) -> String {
  if is_markdown_name(name) {
    name.get(..name.len().saturating_sub(3)).unwrap_or(name).to_string()
  } else {
    name.to_string()
  }
}

fn clean_yaml_value(value: &str) -> String {
  let trimmed = value.trim();
  if trimmed.len() >= 2 {
    let bytes = trimmed.as_bytes();
    let quote = bytes[0];
    if (quote == b'\'' || quote == b'"') && bytes[trimmed.len() - 1] == quote {
      return trimmed[1..trimmed.len() - 1].trim().to_string();
    }
  }
  trimmed.to_string()
}

fn inline_yaml_value_after_key<'a>(metadata: &'a str, key: &str) -> Option<&'a str> {
  let start = metadata.find(key)? + key.len();
  let rest = metadata.get(start..)?.trim_start();
  if rest.is_empty() {
    return None;
  }
  let bytes = rest.as_bytes();
  if bytes[0] == b'"' || bytes[0] == b'\'' {
    let quote = bytes[0] as char;
    return rest
      .get(1..)
      .and_then(|tail| tail.find(quote).and_then(|end| rest.get(..end + 2)));
  }
  rest
    .split_once(char::is_whitespace)
    .map(|(value, _)| value)
    .or(Some(rest))
}

impl PreviewBuilder {
  fn new(fallback_name: &str) -> Self {
    Self {
      fallback_title: markdown_stem(fallback_name),
      title: None,
      excerpt: String::with_capacity(160),
      excerpt_lines: 0,
      mode: PreviewParseMode::Start,
      can_skip_leading_title: true,
    }
  }

  fn set_title_if_empty(&mut self, value: &str) {
    let title = clean_yaml_value(value);
    if self.title.is_none() && !title.is_empty() {
      self.title = Some(title);
    }
  }

  fn parse_frontmatter_line(&mut self, trimmed: &str) {
    if let Some(title) = trimmed.strip_prefix("title:") {
      self.set_title_if_empty(title);
    }
  }

  fn parse_inline_frontmatter(&mut self, metadata: &str) {
    if let Some(title) = inline_yaml_value_after_key(metadata, "title:") {
      self.set_title_if_empty(title);
    }
  }

  fn push_excerpt_line(&mut self, trimmed: &str) {
    if self.excerpt_lines > 0 {
      self.excerpt.push(' ');
    }
    self.excerpt.push_str(trimmed);
    self.excerpt_lines += 1;
  }

  fn feed_body_line(&mut self, trimmed: &str) {
    if trimmed.is_empty() || trimmed == "---" || self.is_done() {
      return;
    }

    if self.can_skip_leading_title && trimmed.starts_with("# ") {
      self.set_title_if_empty(trimmed.trim_start_matches("# ").trim());
      self.can_skip_leading_title = false;
      return;
    }

    self.can_skip_leading_title = false;
    self.push_excerpt_line(trimmed);
  }

  fn feed_line(&mut self, line: &str) {
    let trimmed = line.trim();
    match self.mode {
      PreviewParseMode::Start => {
        if trimmed.is_empty() {
          return;
        }
        if trimmed == "---" {
          self.mode = PreviewParseMode::Frontmatter;
          return;
        }
        if let Some(after_open) = trimmed.strip_prefix("---") {
          if let Some(close_index) = after_open.find("---") {
            let metadata = after_open[..close_index].trim();
            let body = after_open[close_index + 3..].trim();
            self.parse_inline_frontmatter(metadata);
            self.mode = PreviewParseMode::Body;
            self.feed_body_line(body);
            return;
          }
        }
        self.mode = PreviewParseMode::Body;
        self.feed_body_line(trimmed);
      }
      PreviewParseMode::Frontmatter => {
        if trimmed == "---" {
          self.mode = PreviewParseMode::Body;
          return;
        }
        self.parse_frontmatter_line(trimmed);
      }
      PreviewParseMode::Body => self.feed_body_line(trimmed),
    }
  }

  fn is_done(&self) -> bool {
    self.excerpt_lines >= EXCERPT_LINE_LIMIT
  }

  fn finish(self) -> NotePreview {
    NotePreview {
      title: self.title.unwrap_or(self.fallback_title),
      excerpt: self.excerpt,
    }
  }
}

fn markdown_preview_from_text(markdown: &str, fallback_name: &str) -> NotePreview {
  let mut builder = PreviewBuilder::new(fallback_name);
  for line in markdown.lines() {
    builder.feed_line(line);
    if builder.is_done() {
      break;
    }
  }
  builder.finish()
}

fn read_note_preview(path: &Path, fallback_name: &str) -> R<NotePreview> {
  let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
  let mut builder = PreviewBuilder::new(fallback_name);
  let mut chunk = [0_u8; PREVIEW_READ_CHUNK_BYTES];
  let mut line = Vec::with_capacity(256);
  let mut total_bytes = 0_usize;

  loop {
    if total_bytes >= MARKDOWN_PREVIEW_LIMIT || builder.is_done() {
      break;
    }
    let read_len = (MARKDOWN_PREVIEW_LIMIT - total_bytes).min(chunk.len());
    let count = file.read(&mut chunk[..read_len]).map_err(|e| e.to_string())?;
    if count == 0 {
      break;
    }
    total_bytes += count;

    for byte in &chunk[..count] {
      match *byte {
        b'\n' => {
          let decoded = String::from_utf8_lossy(&line);
          builder.feed_line(decoded.as_ref());
          line.clear();
          if builder.is_done() {
            break;
          }
        }
        b'\r' => {}
        value => {
          if line.len() < MAX_PREVIEW_LINE_BYTES {
            line.push(value);
          }
        }
      }
    }
  }

  if !line.is_empty() && !builder.is_done() {
    let decoded = String::from_utf8_lossy(&line);
    builder.feed_line(decoded.as_ref());
  }

  Ok(builder.finish())
}

fn direct_markdown_note_count(path: &Path) -> usize {
  fs::read_dir(path)
    .ok()
    .map(|children| {
      children
        .filter_map(Result::ok)
        .filter(|child| {
          let name = child.file_name().to_string_lossy();
          !is_ignored_entry(&name) && is_markdown_name(&name)
        })
        .count()
    })
    .unwrap_or(0)
}

fn collect_directory_seeds(directory: &Path, relative_path: &str) -> R<Vec<DirectorySeed>> {
  let mut seeds = Vec::new();
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
    let is_dir = metadata.is_dir();
    if !is_dir && !(metadata.is_file() && is_markdown_name(&name)) {
      continue;
    }
    let sort_name = name.to_ascii_lowercase();
    let child_relative = normalize_relative_path(&format!("{}/{}", relative_path, name));
    seeds.push(DirectorySeed { name, sort_name, path, metadata, child_relative, is_dir });
  }
  seeds.sort_by(|a, b| {
    b.is_dir
      .cmp(&a.is_dir)
      .then_with(|| a.sort_name.cmp(&b.sort_name))
  });
  Ok(seeds)
}

fn entry_from_seed(seed: DirectorySeed, include_preview: bool) -> Value {
  if seed.is_dir {
    return json!({
      "kind": "folder",
      "title": seed.name,
      "path": seed.child_relative,
      "noteCount": direct_markdown_note_count(&seed.path),
      "updatedAt": metadata_updated_at(&seed.metadata),
      "type": "folder",
      "tags": [],
      "createdAt": "",
      "excerpt": "",
      "coverImage": ""
    });
  }

  let preview = if include_preview {
    read_note_preview(&seed.path, &seed.name).unwrap_or_else(|_| NotePreview {
      title: markdown_stem(&seed.name),
      excerpt: String::new(),
    })
  } else {
    NotePreview {
      title: markdown_stem(&seed.name),
      excerpt: String::new(),
    }
  };
  json!({
    "kind": "note",
    "title": preview.title,
    "path": seed.child_relative,
    "filename": seed.name,
    "updatedAt": metadata_updated_at(&seed.metadata),
    "type": "note",
    "tags": [],
    "createdAt": "",
    "excerpt": preview.excerpt,
    "coverImage": ""
  })
}

pub fn list_directory_page(vault: &VaultDescriptor, relative_path: &str, offset: usize, limit: Option<usize>, include_preview: bool) -> R<Vec<Value>> {
  let directory = existing_path_inside_vault(&vault.path, relative_path)?;
  let seeds = collect_directory_seeds(&directory, relative_path)?;
  let limit = limit.unwrap_or(usize::MAX);
  Ok(seeds
    .into_iter()
    .skip(offset)
    .take(limit)
    .map(|seed| entry_from_seed(seed, include_preview))
    .collect())
}

pub fn list_directory(vault: &VaultDescriptor, relative_path: &str) -> R<Vec<Value>> {
  list_directory_page(vault, relative_path, 0, None, true)
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
    "type": entry_type.unwrap_or_else(|| if is_markdown_name(&normalized) { "note".to_string() } else { "folder".to_string() }),
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
    let unique = std::time::SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    let dir = std::env::temp_dir().join(format!("elephant-entry-preview-{unique}"));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("large.md");
    fs::write(&path, format!("---\ntitle: \"Fast\"\n---\n\n{}", "x".repeat(MARKDOWN_PREVIEW_LIMIT * 2))).unwrap();

    let preview = read_note_preview(&path, "large.md").unwrap();
    assert_eq!(preview.title, "Fast");
    assert!(preview.excerpt.len() <= MAX_PREVIEW_LINE_BYTES);

    let _ = fs::remove_dir_all(&dir);
  }

  #[test]
  fn extracts_excerpt_after_yaml_frontmatter_and_title() {
    let markdown = "---\ntitle: \"Noteh\"\ntype: \"note\"\ntags: []\n---\n\n# Noteh\n\nFirst useful line.\nSecond useful line.";
    assert_eq!(markdown_preview_from_text(markdown, "fallback.md"), NotePreview {
      title: "Noteh".to_string(),
      excerpt: "First useful line. Second useful line.".to_string(),
    });
  }

  #[test]
  fn extracts_excerpt_after_inline_frontmatter() {
    let markdown = "--- title: \"Noteh\" type: \"note\" --- Real content starts here.\nSecond line.";
    assert_eq!(markdown_preview_from_text(markdown, "fallback.md"), NotePreview {
      title: "Noteh".to_string(),
      excerpt: "Real content starts here. Second line.".to_string(),
    });
  }

  #[test]
  fn keeps_scaffold_note_excerpt_empty() {
    let markdown = "---\ntitle: \"Empty\"\ntype: \"note\"\ntags: []\n---\n\n# Empty\n";
    assert_eq!(markdown_preview_from_text(markdown, "fallback.md"), NotePreview {
      title: "Empty".to_string(),
      excerpt: String::new(),
    });
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

  #[test]
  fn list_directory_page_respects_offset_limit_and_preview_flag() {
    let unique = std::time::SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .unwrap()
      .as_nanos();
    let root = std::env::temp_dir().join(format!("elephantnote-page-test-{unique}"));
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("A.md"), "---\ntitle: \"A title\"\n---\n\nA body.").unwrap();
    fs::write(root.join("B.md"), "---\ntitle: \"B title\"\n---\n\nB body.").unwrap();
    fs::write(root.join("C.md"), "---\ntitle: \"C title\"\n---\n\nC body.").unwrap();

    let vault = VaultDescriptor {
      id: "test".to_string(),
      name: "Test".to_string(),
      path: root.to_string_lossy().to_string(),
      icon: String::new(),
      last_opened_at: "0".to_string(),
    };

    let entries = list_directory_page(&vault, "", 1, Some(1), false).unwrap();
    fs::remove_dir_all(&root).ok();

    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].get("title").and_then(Value::as_str), Some("B"));
    assert_eq!(entries[0].get("excerpt").and_then(Value::as_str), Some(""));
  }
}

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use crate::vault_layout;

use super::config::now_string;
use super::metadata::{read_json_or, write_json};
use super::types::VaultDescriptor;

type R<T> = Result<T, String>;

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

fn civil_from_days(days_since_unix_epoch: i64) -> (i32, u32, u32) {
  let z = days_since_unix_epoch + 719_468;
  let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
  let doe = z - era * 146_097;
  let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
  let y = yoe + era * 400;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let day = doy - (153 * mp + 2) / 5 + 1;
  let month = mp + if mp < 10 { 3 } else { -9 };
  let year = y + if month <= 2 { 1 } else { 0 };
  (year as i32, month as u32, day as u32)
}

fn unix_seconds_to_utc_string(seconds: u64) -> String {
  let days = (seconds / 86_400) as i64;
  let second_of_day = seconds % 86_400;
  let (year, month, day) = civil_from_days(days);
  let hour = second_of_day / 3_600;
  let minute = (second_of_day % 3_600) / 60;
  let second = second_of_day % 60;
  format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

fn entry_updated_at(path: &Path) -> String {
  fs::metadata(path)
    .and_then(|m| m.modified())
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| unix_seconds_to_utc_string(d.as_secs()))
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

pub fn list_directory(vault: &VaultDescriptor, relative_path: &str) -> R<Vec<Value>> {
  let mut entries = Vec::new();
  let directory = inside(&vault.path, relative_path);

  for item in fs::read_dir(directory).map_err(|e| e.to_string())? {
    let item = item.map_err(|e| e.to_string())?;
    let name = item.file_name().to_string_lossy().to_string();
    if is_ignored_entry(&name) {
      continue;
    }

    let path = item.path();
    let child_relative = normalize_relative_path(&format!("{}/{}", relative_path, name));
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;

    if metadata.is_dir() {
      let note_count = fs::read_dir(&path)
        .ok()
        .map(|children| children.filter_map(Result::ok).filter(|child| child.file_name().to_string_lossy().to_lowercase().ends_with(".md")).count())
        .unwrap_or(0);
      entries.push(json!({
        "kind": "folder",
        "title": name,
        "path": child_relative,
        "noteCount": note_count,
        "updatedAt": entry_updated_at(&path),
        "type": "folder",
        "tags": [],
        "createdAt": "",
        "excerpt": "",
        "coverImage": ""
      }));
    } else if metadata.is_file() && name.to_lowercase().ends_with(".md") {
      let markdown = fs::read_to_string(&path).unwrap_or_default();
      let title = markdown_title(&markdown, &name);
      let excerpt = markdown.lines().filter(|line| !line.trim().is_empty()).take(3).collect::<Vec<_>>().join(" ");
      entries.push(json!({
        "kind": "note",
        "title": title,
        "path": child_relative,
        "filename": name,
        "updatedAt": entry_updated_at(&path),
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
  let relative_path = relative_path.unwrap_or_default();
  let directory = inside(&vault.path, &relative_path);
  fs::create_dir_all(&directory).map_err(|e| e.to_string())?;

  let filename = filename.filter(|f| !f.trim().is_empty()).unwrap_or_else(|| next_available_name(&directory, "Untitled.md"));
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
  let relative_path = relative_path.unwrap_or_default();
  let directory = inside(&vault.path, &relative_path);
  fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
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
  let source = inside(&vault.path, &relative_path);
  let parent = source.parent().ok_or_else(|| "Cannot rename vault root.".to_string())?;
  let mut safe = title.trim().replace('/', "-").replace('\\', "-");
  if source.extension().and_then(|e| e.to_str()) == Some("md") && !safe.to_lowercase().ends_with(".md") {
    safe.push_str(".md");
  }
  fs::rename(&source, parent.join(safe)).map_err(|e| e.to_string())
}

pub fn move_entry(vault: &VaultDescriptor, relative_path: String, target_directory_path: Option<String>) -> R<()> {
  let source = inside(&vault.path, &relative_path);
  let target_dir = inside(&vault.path, target_directory_path.as_deref().unwrap_or(""));
  fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
  let name = source.file_name().ok_or_else(|| "Invalid source path.".to_string())?;
  fs::rename(&source, target_dir.join(name)).map_err(|e| e.to_string())
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
  fn formats_entry_timestamps_as_js_parseable_utc_iso() {
    assert_eq!(unix_seconds_to_utc_string(0), "1970-01-01T00:00:00.000Z");
    assert_eq!(unix_seconds_to_utc_string(1_717_952_400), "2024-06-09T15:00:00.000Z");
  }
}

use serde::Serialize;
use std::{
  collections::BTreeSet,
  fs,
  path::{Component, Path},
  time::UNIX_EPOCH,
};
use tauri::AppHandle;

use crate::addon_runtime_access::{canonical_vault_root, normalize_relative_path, read_enabled_addon, scope_matches};

type R<T> = Result<T, String>;

const MAX_LISTED_NOTES: usize = 1_000;
const MAX_DIRECTORY_DEPTH: usize = 64;
const MAX_NOTE_BYTES: u64 = 5 * 1024 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonNoteEntry {
  path: String,
  size: u64,
  modified_at: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonNoteDocument {
  path: String,
  size: u64,
  modified_at: Option<u64>,
  markdown: String,
}

fn normalize_listing_prefix(value: &str) -> R<String> {
  if value.trim() == "." {
    return Ok(String::new());
  }
  normalize_relative_path(value, "A note directory or '.' for the vault root is required")
}

fn is_hidden_component(path: &Path) -> bool {
  path.components().any(|component| match component {
    Component::Normal(part) => part.to_string_lossy().starts_with('.'),
    _ => false,
  })
}

fn permitted(scopes: &[String], relative_path: &str) -> bool {
  !scopes.is_empty() && scopes.iter().any(|scope| scope_matches(scope, relative_path))
}

fn modified_at(metadata: &fs::Metadata) -> Option<u64> {
  metadata
    .modified()
    .ok()
    .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64)
}

fn collect_markdown_notes(root: &Path, prefix: &str, scopes: &[String]) -> R<Vec<AddonNoteEntry>> {
  let start = if prefix.is_empty() { root.to_path_buf() } else { root.join(prefix) };
  if !start.exists() {
    return Ok(Vec::new());
  }
  let canonical_start = fs::canonicalize(&start).map_err(|error| error.to_string())?;
  if !canonical_start.starts_with(root) {
    return Err("Refusing to list notes outside the active vault".to_string());
  }

  let mut stack = vec![(canonical_start, 0_usize)];
  let mut seen = BTreeSet::new();
  let mut notes = Vec::new();

  while let Some((directory, depth)) = stack.pop() {
    if depth > MAX_DIRECTORY_DEPTH {
      return Err(format!("Addon note listing exceeded the maximum directory depth of {MAX_DIRECTORY_DEPTH}"));
    }
    for entry in fs::read_dir(&directory).map_err(|error| error.to_string())? {
      let entry = entry.map_err(|error| error.to_string())?;
      let file_type = entry.file_type().map_err(|error| error.to_string())?;
      if file_type.is_symlink() {
        continue;
      }
      let path = entry.path();
      let relative = path
        .strip_prefix(root)
        .map_err(|_| "Listed note escaped the active vault".to_string())?;
      if is_hidden_component(relative) {
        continue;
      }
      let relative_path = relative.to_string_lossy().replace('\\', "/");

      if file_type.is_dir() {
        stack.push((path, depth + 1));
        continue;
      }
      if !file_type.is_file()
        || path
          .extension()
          .and_then(|value| value.to_str())
          .map(|value| value.eq_ignore_ascii_case("md"))
          != Some(true)
      {
        continue;
      }
      if !permitted(scopes, &relative_path) || !seen.insert(relative_path.clone()) {
        continue;
      }

      let metadata = entry.metadata().map_err(|error| error.to_string())?;
      notes.push(AddonNoteEntry {
        path: relative_path,
        size: metadata.len(),
        modified_at: modified_at(&metadata),
      });
      if notes.len() >= MAX_LISTED_NOTES {
        return Err(format!("Addon note listing exceeded the maximum of {MAX_LISTED_NOTES} notes"));
      }
    }
  }

  notes.sort_by(|left, right| left.path.cmp(&right.path));
  Ok(notes)
}

#[tauri::command]
pub fn tauri_addons_notes_list(app: AppHandle, addon_id: String, prefix: String) -> R<Vec<AddonNoteEntry>> {
  let prefix = normalize_listing_prefix(&prefix)?;
  let record = read_enabled_addon(&app, &addon_id)?;
  let scopes = &record.manifest.permissions.notes.read;
  let can_list = if prefix.is_empty() {
    scopes.iter().any(|scope| scope.trim() == "*")
  } else {
    permitted(scopes, &prefix)
  };
  if !can_list {
    let display = if prefix.is_empty() { "the vault root" } else { &prefix };
    return Err(format!("Addon is not permitted to list notes under {display}"));
  }
  collect_markdown_notes(&canonical_vault_root(&app)?, &prefix, scopes)
}

#[tauri::command]
pub fn tauri_addons_notes_read(app: AppHandle, addon_id: String, path: String) -> R<AddonNoteDocument> {
  let relative_path = normalize_relative_path(&path, "A note path is required")?;
  let relative = Path::new(&relative_path);
  if is_hidden_component(relative) {
    return Err("Addons cannot read notes from hidden directories".to_string());
  }
  if relative
    .extension()
    .and_then(|value| value.to_str())
    .map(|value| value.eq_ignore_ascii_case("md"))
    != Some(true)
  {
    return Err("Addon note reads are limited to Markdown files".to_string());
  }

  let record = read_enabled_addon(&app, &addon_id)?;
  let scopes = &record.manifest.permissions.notes.read;
  if !permitted(scopes, &relative_path) {
    return Err(format!("Addon is not permitted to read {relative_path}"));
  }

  let root = canonical_vault_root(&app)?;
  let target = fs::canonicalize(root.join(relative))
    .map_err(|error| format!("Failed to resolve note {relative_path}: {error}"))?;
  if !target.starts_with(&root) {
    return Err("Refusing to read a note outside the active vault".to_string());
  }
  let metadata = fs::metadata(&target).map_err(|error| error.to_string())?;
  if !metadata.is_file() {
    return Err(format!("Note is not a regular file: {relative_path}"));
  }
  if metadata.len() > MAX_NOTE_BYTES {
    return Err(format!("Note exceeds the {MAX_NOTE_BYTES} byte addon read limit"));
  }
  let markdown = fs::read_to_string(&target)
    .map_err(|error| format!("Failed to read note {relative_path} as UTF-8: {error}"))?;
  Ok(AddonNoteDocument {
    path: relative_path,
    size: metadata.len(),
    modified_at: modified_at(&metadata),
    markdown,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn accepts_root_sentinel_and_rejects_traversal() {
    assert_eq!(normalize_listing_prefix(".").unwrap(), "");
    assert!(normalize_listing_prefix("../Inbox").is_err());
    assert_eq!(normalize_listing_prefix("Inbox/2026").unwrap(), "Inbox/2026");
  }

  #[test]
  fn hidden_paths_are_never_listed_or_read() {
    assert!(is_hidden_component(Path::new(".elephantnote/addons/registry.json")));
    assert!(is_hidden_component(Path::new("Inbox/.private/note.md")));
    assert!(!is_hidden_component(Path::new("Inbox/note.md")));
  }

  #[test]
  fn permission_scopes_are_boundary_aware() {
    let scopes = vec!["Inbox/**".to_string()];
    assert!(permitted(&scopes, "Inbox/note.md"));
    assert!(!permitted(&scopes, "Inbox-old/note.md"));
  }
}

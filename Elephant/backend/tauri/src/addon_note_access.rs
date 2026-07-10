use serde::{Deserialize, Serialize};
use std::{
  collections::{BTreeMap, BTreeSet},
  fs,
  path::{Component, Path, PathBuf},
  time::UNIX_EPOCH,
};
use tauri::AppHandle;

use crate::{
  addons::InstalledAddon,
  vault::config as vault_config,
  vault_layout,
};

type R<T> = Result<T, String>;

const REGISTRY_VERSION: u32 = 1;
const MAX_LISTED_NOTES: usize = 1_000;
const MAX_DIRECTORY_DEPTH: usize = 64;

#[derive(Debug, Deserialize)]
struct AddonRegistry {
  version: u32,
  addons: BTreeMap<String, InstalledAddon>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonNoteEntry {
  path: String,
  size: u64,
  modified_at: Option<u64>,
}

fn normalize_relative_path(value: &str) -> R<String> {
  let value = value.trim();
  if value.is_empty() {
    return Err("A non-empty note directory is required".to_string());
  }
  let path = Path::new(value);
  if path.is_absolute() {
    return Err("Addon note paths must be relative to the active vault".to_string());
  }

  let mut normalized = PathBuf::new();
  for component in path.components() {
    match component {
      Component::Normal(part) => normalized.push(part),
      Component::CurDir => {}
      Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
        return Err(format!("Path traversal is not allowed: {value}"));
      }
    }
  }
  if normalized.as_os_str().is_empty() {
    return Err("A non-empty note directory is required".to_string());
  }
  Ok(normalized.to_string_lossy().replace('\\', "/"))
}

fn scope_matches(scope: &str, relative_path: &str) -> bool {
  let scope = scope.trim().replace('\\', "/");
  if scope == "*" {
    return true;
  }
  if let Some(prefix) = scope.strip_suffix("/**") {
    let prefix = prefix.trim_end_matches('/');
    return relative_path == prefix || relative_path.starts_with(&format!("{prefix}/"));
  }
  relative_path == scope
}

fn registry_path(app: &AppHandle) -> R<PathBuf> {
  let vault = vault_config::get_active_vault(app)?;
  Ok(vault_layout::addons_dir(&vault.path).join("registry.json"))
}

fn read_enabled_addon(app: &AppHandle, addon_id: &str) -> R<InstalledAddon> {
  let path = registry_path(app)?;
  let raw = fs::read_to_string(&path).map_err(|error| format!("Failed to read addon registry: {error}"))?;
  let registry: AddonRegistry = serde_json::from_str(&raw).map_err(|error| format!("Invalid addon registry: {error}"))?;
  if registry.version != REGISTRY_VERSION {
    return Err(format!("Unsupported addon registry version {}", registry.version));
  }
  let record = registry
    .addons
    .get(addon_id)
    .cloned()
    .ok_or_else(|| format!("Unknown addon: {addon_id}"))?;
  if !record.enabled {
    return Err(format!("Addon is disabled: {addon_id}"));
  }
  Ok(record)
}

fn canonical_vault_root(app: &AppHandle) -> R<PathBuf> {
  let vault = vault_config::get_active_vault(app)?;
  let root = PathBuf::from(vault.path);
  fs::create_dir_all(&root).map_err(|error| error.to_string())?;
  fs::canonicalize(root).map_err(|error| error.to_string())
}

fn is_hidden_component(path: &Path) -> bool {
  path.components().any(|component| match component {
    Component::Normal(part) => part.to_string_lossy().starts_with('.'),
    _ => false,
  })
}

fn collect_markdown_notes(root: &Path, prefix: &str, scopes: &[String]) -> R<Vec<AddonNoteEntry>> {
  let start = root.join(prefix);
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
      if !file_type.is_file() || path.extension().and_then(|value| value.to_str()).map(|value| value.eq_ignore_ascii_case("md")) != Some(true) {
        continue;
      }
      if !scopes.iter().any(|scope| scope_matches(scope, &relative_path)) {
        continue;
      }
      if !seen.insert(relative_path.clone()) {
        continue;
      }

      let metadata = entry.metadata().map_err(|error| error.to_string())?;
      let modified_at = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis().min(u128::from(u64::MAX)) as u64);
      notes.push(AddonNoteEntry {
        path: relative_path,
        size: metadata.len(),
        modified_at,
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
  let prefix = normalize_relative_path(&prefix)?;
  let record = read_enabled_addon(&app, &addon_id)?;
  let scopes = &record.manifest.permissions.notes.read;
  if scopes.is_empty() || !scopes.iter().any(|scope| scope_matches(scope, &prefix)) {
    return Err(format!("Addon is not permitted to list notes under {prefix}"));
  }
  let root = canonical_vault_root(&app)?;
  collect_markdown_notes(&root, &prefix, scopes)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_path_traversal_and_empty_prefixes() {
    assert!(normalize_relative_path("").is_err());
    assert!(normalize_relative_path("../Inbox").is_err());
    assert_eq!(normalize_relative_path("Inbox/2026").unwrap(), "Inbox/2026");
  }

  #[test]
  fn read_scopes_are_prefix_bounded() {
    assert!(scope_matches("Inbox/**", "Inbox"));
    assert!(scope_matches("Inbox/**", "Inbox/note.md"));
    assert!(!scope_matches("Inbox/**", "Inbox-old/note.md"));
  }

  #[test]
  fn hidden_paths_are_never_listed() {
    assert!(is_hidden_component(Path::new(".elephantnote/addons/registry.json")));
    assert!(is_hidden_component(Path::new("Inbox/.private/note.md")));
    assert!(!is_hidden_component(Path::new("Inbox/note.md")));
  }
}

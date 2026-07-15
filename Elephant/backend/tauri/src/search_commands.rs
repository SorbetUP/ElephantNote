use serde_json::{json, Value};
use std::{collections::BTreeSet, fs, path::{Path, PathBuf}, time::UNIX_EPOCH};
use tauri::AppHandle;

use crate::{
  fts::{scan_markdown_files, FtsIndex},
  vault::config as vault_config,
};

type R<T> = Result<T, String>;
const DISABLED_MARKER: &str = ".elephantnote/index/search.disabled";

fn active_vault(app: &AppHandle) -> R<crate::vault::types::VaultDescriptor> {
  vault_config::get_active_vault(app)
}

fn disabled_marker(root: &Path) -> PathBuf {
  root.join(DISABLED_MARKER)
}

fn search_enabled(root: &Path) -> bool {
  !disabled_marker(root).exists()
}

fn modified_seconds(path: &Path) -> u64 {
  fs::metadata(path)
    .and_then(|metadata| metadata.modified())
    .ok()
    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_secs())
    .unwrap_or(0)
}

fn title_for(relative_path: &str, content: &str) -> String {
  content
    .lines()
    .find_map(|line| line.trim().strip_prefix("# ").map(str::trim).filter(|value| !value.is_empty()))
    .map(str::to_string)
    .unwrap_or_else(|| {
      Path::new(relative_path)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("Untitled")
        .to_string()
    })
}

fn excerpt_for(content: &str) -> String {
  let compact = content
    .lines()
    .filter(|line| !line.trim().is_empty() && !line.trim_start().starts_with("# "))
    .take(5)
    .collect::<Vec<_>>()
    .join(" ");
  compact.chars().take(500).collect()
}

fn status_value(app: &AppHandle) -> R<Value> {
  let vault = active_vault(app)?;
  let root = PathBuf::from(&vault.path);
  let total = scan_markdown_files(&root).len();
  let indexed = FtsIndex::open(&root)
    .and_then(|index| index.count(&vault.id))
    .unwrap_or(0)
    .max(0) as usize;
  let enabled = search_enabled(&root);
  Ok(json!({
    "status": if enabled { if indexed == 0 && total > 0 { "not_initialized" } else { "ready" } } else { "disabled" },
    "enabled": enabled,
    "runtime": "tauri-rust",
    "vaultPath": vault.path,
    "indexedDocuments": indexed,
    "totalDocuments": total,
    "message": if enabled { "" } else { "Search is disabled for this vault." },
    "error": ""
  }))
}

fn rebuild_index(app: &AppHandle) -> R<Value> {
  let vault = active_vault(app)?;
  let root = PathBuf::from(&vault.path);
  if !search_enabled(&root) {
    return status_value(app);
  }
  let index = FtsIndex::open(&root).map_err(|error| error.to_string())?;
  index.clear_vault(&vault.id).map_err(|error| error.to_string())?;
  let notes = scan_markdown_files(&root);
  for (relative_path, full_path, content) in &notes {
    index
      .upsert_note(
        &vault.id,
        relative_path,
        &full_path.to_string_lossy(),
        &title_for(relative_path, content),
        content,
        modified_seconds(full_path) as i64,
      )
      .map_err(|error| error.to_string())?;
  }
  status_value(app)
}

#[tauri::command]
pub fn tauri_search_init_vault(app: AppHandle, vault_path: Option<String>) -> R<Value> {
  let vault = active_vault(&app)?;
  if let Some(requested) = vault_path.filter(|value| !value.trim().is_empty()) {
    let requested = fs::canonicalize(&requested).map_err(|error| error.to_string())?;
    let active = fs::canonicalize(&vault.path).map_err(|error| error.to_string())?;
    if requested != active {
      return Err("Search initialization does not match the active vault.".to_string());
    }
  }
  let root = PathBuf::from(&vault.path);
  let indexed = FtsIndex::open(&root)
    .and_then(|index| index.count(&vault.id))
    .unwrap_or(0);
  if search_enabled(&root) && indexed == 0 && !scan_markdown_files(&root).is_empty() {
    return rebuild_index(&app);
  }
  status_value(&app)
}

#[tauri::command]
pub fn tauri_search_inspect(app: AppHandle) -> R<Value> {
  let vault = active_vault(&app)?;
  let root = PathBuf::from(&vault.path);
  let notes = scan_markdown_files(&root);
  let mut folders = BTreeSet::new();
  let documents = notes
    .iter()
    .map(|(relative_path, full_path, content)| {
      if let Some(parent) = Path::new(relative_path).parent().and_then(|value| value.to_str()) {
        if !parent.is_empty() { folders.insert(parent.replace('\\', "/")); }
      }
      json!({
        "relativePath": relative_path,
        "path": relative_path,
        "fullPath": full_path.to_string_lossy(),
        "title": title_for(relative_path, content),
        "content": content,
        "body": content,
        "excerpt": excerpt_for(content),
        "tags": [],
        "updatedAt": modified_seconds(full_path).to_string()
      })
    })
    .collect::<Vec<_>>();
  Ok(json!({
    "indexPath": root.join(".elephantnote/index/notes.sqlite").to_string_lossy(),
    "documents": documents,
    "folders": folders.into_iter().collect::<Vec<_>>(),
    "semanticLinks": [],
    "graph": null,
    "generatedAt": chrono::Utc::now().to_rfc3339()
  }))
}

#[tauri::command]
pub fn tauri_search_rebuild(app: AppHandle) -> R<Value> {
  rebuild_index(&app)
}

#[tauri::command]
pub fn tauri_search_clear(app: AppHandle) -> R<Value> {
  let vault = active_vault(&app)?;
  let root = PathBuf::from(&vault.path);
  let index = FtsIndex::open(&root).map_err(|error| error.to_string())?;
  index.clear_vault(&vault.id).map_err(|error| error.to_string())?;
  status_value(&app)
}

#[tauri::command]
pub fn tauri_search_disable(app: AppHandle) -> R<Value> {
  let vault = active_vault(&app)?;
  let marker = disabled_marker(Path::new(&vault.path));
  if let Some(parent) = marker.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  fs::write(marker, b"disabled\n").map_err(|error| error.to_string())?;
  status_value(&app)
}

#[tauri::command]
pub fn tauri_search_enable(app: AppHandle) -> R<Value> {
  let vault = active_vault(&app)?;
  let marker = disabled_marker(Path::new(&vault.path));
  if marker.exists() {
    fs::remove_file(marker).map_err(|error| error.to_string())?;
  }
  rebuild_index(&app)
}

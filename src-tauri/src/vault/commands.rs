use serde_json::{json, Value};
use tauri::AppHandle;

use super::config::{get_active_vault, read_config, remove_vault, set_active_vault, set_vault_icon, set_vault_name, upsert_vault, write_config};
use super::entries;
use super::metadata::{initialize_vault, read_json_or};
use super::types::active_vault;
use crate::vault_layout;

type R<T> = Result<T, String>;

fn payload(app: &AppHandle, vault: Option<super::types::VaultDescriptor>) -> R<Value> {
  let config = read_config(app)?;
  if let Some(vault) = vault {
    let workspace = initialize_vault(&vault.path)?;
    let listed_entries = entries::list_directory(&vault, "")?;
    Ok(json!({
      "vaults": config.vaults,
      "activeVaultId": config.active_vault_id,
      "activeVault": vault,
      "workspace": workspace,
      "entries": listed_entries
    }))
  } else {
    Ok(json!({
      "vaults": config.vaults,
      "activeVaultId": config.active_vault_id,
      "activeVault": null,
      "workspace": null,
      "entries": []
    }))
  }
}

#[tauri::command]
pub fn tauri_vaults_get(app: AppHandle) -> R<Value> {
  let config = read_config(&app)?;
  payload(&app, active_vault(&config))
}

#[tauri::command]
pub fn tauri_vaults_select_path(app: AppHandle, vault_path: String) -> R<Value> {
  let mut config = read_config(&app)?;
  let vault = upsert_vault(&mut config, vault_path);
  write_config(&app, &config)?;
  payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_vaults_set_active(app: AppHandle, vault_id: String) -> R<Value> {
  let mut config = read_config(&app)?;
  set_active_vault(&mut config, vault_id);
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_set_icon(app: AppHandle, vault_id: String, icon: String) -> R<Value> {
  let mut config = read_config(&app)?;
  set_vault_icon(&mut config, &vault_id, icon);
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_set_name(app: AppHandle, vault_id: String, name: String) -> R<Value> {
  let mut config = read_config(&app)?;
  set_vault_name(&mut config, &vault_id, name);
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_remove(app: AppHandle, vault_id: String) -> R<Value> {
  let mut config = read_config(&app)?;
  remove_vault(&mut config, &vault_id);
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  payload(&app, vault)
}

#[tauri::command]
pub fn tauri_directory_list(app: AppHandle, relative_path: Option<String>) -> R<Vec<Value>> {
  entries::list_directory(&get_active_vault(&app)?, relative_path.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn tauri_notes_create(app: AppHandle, relative_path: Option<String>, filename: Option<String>, title: Option<String>) -> R<Value> {
  entries::create_note(&get_active_vault(&app)?, relative_path, filename, title)
}

#[tauri::command]
pub fn tauri_folders_create(app: AppHandle, relative_path: Option<String>) -> R<Value> {
  entries::create_folder(&get_active_vault(&app)?, relative_path)
}

#[tauri::command]
pub fn tauri_sidebar_attach(app: AppHandle, relative_path: String, title: Option<String>, entry_type: Option<String>) -> R<Value> {
  entries::attach_sidebar_entry(&get_active_vault(&app)?, relative_path, title, entry_type)
}

#[tauri::command]
pub fn tauri_sidebar_detach(app: AppHandle, relative_path: String) -> R<Value> {
  entries::detach_sidebar_entry(&get_active_vault(&app)?, relative_path)
}

#[tauri::command]
pub fn tauri_entries_rename(app: AppHandle, relative_path: String, title: String) -> R<Value> {
  let vault = get_active_vault(&app)?;
  entries::rename_entry(&vault, relative_path, title)?;
  payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_entries_move(app: AppHandle, relative_path: String, target_directory_path: Option<String>) -> R<Value> {
  let vault = get_active_vault(&app)?;
  entries::move_entry(&vault, relative_path, target_directory_path)?;
  payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_entries_delete(app: AppHandle, relative_path: String) -> R<Value> {
  entries::delete_entry(&get_active_vault(&app)?, relative_path)
}

#[tauri::command]
pub fn tauri_calendar_list(app: AppHandle) -> R<Vec<Value>> {
  let vault = get_active_vault(&app)?;
  Ok(read_json_or(vault_layout::config_file(&vault.path, vault_layout::CALENDAR_FILE), json!({ "events": [] })).get("events").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_sources_list(app: AppHandle) -> R<Vec<Value>> {
  let vault = get_active_vault(&app)?;
  Ok(read_json_or(vault_layout::config_file(&vault.path, vault_layout::SOURCES_FILE), json!({ "sources": [] })).get("sources").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_wiki_list(app: AppHandle) -> R<Vec<Value>> {
  let vault = get_active_vault(&app)?;
  Ok(read_json_or(vault_layout::wiki_file(&vault.path, vault_layout::WIKI_FILE), json!({ "records": [] })).get("records").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_search_query(app: AppHandle, params: Option<Value>) -> R<Value> {
  let vault = get_active_vault(&app)?;
  let query = params.and_then(|p| p.get("query").or_else(|| p.get("q")).and_then(Value::as_str).map(str::to_string)).unwrap_or_default().to_lowercase();
  if query.trim().is_empty() {
    return Ok(json!({ "results": [] }));
  }
  let root = std::path::PathBuf::from(&vault.path);
  let mut results = Vec::new();
  scan_notes(&root, &root, &mut results, &query)?;
  Ok(json!({ "results": results }))
}

fn scan_notes(root: &std::path::Path, current: &std::path::Path, out: &mut Vec<Value>, query: &str) -> R<()> {
  for item in std::fs::read_dir(current).map_err(|e| e.to_string())? {
    let item = item.map_err(|e| e.to_string())?;
    let name = item.file_name().to_string_lossy().to_string();
    if entries::is_ignored_entry(&name) {
      continue;
    }
    let path = item.path();
    let metadata = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
      scan_notes(root, &path, out, query)?;
    } else if metadata.is_file() && name.to_lowercase().ends_with(".md") {
      let markdown = std::fs::read_to_string(&path).unwrap_or_default();
      let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
      if markdown.to_lowercase().contains(query) || relative.to_lowercase().contains(query) {
        out.push(json!({ "path": relative, "fullPath": path.to_string_lossy(), "title": name.trim_end_matches(".md"), "excerpt": markdown.lines().take(3).collect::<Vec<_>>().join(" "), "tags": [], "score": 1 }));
      }
    }
  }
  Ok(())
}

#[tauri::command]
pub fn tauri_search_status(app: AppHandle) -> R<Value> {
  Ok(json!({ "enabled": true, "runtime": "tauri-rust", "activeVault": active_vault(&read_config(&app)?) }))
}

#[tauri::command]
pub fn tauri_sync_status(app: AppHandle) -> R<Value> {
  Ok(json!({ "runtime": "tauri-rust", "activeVault": active_vault(&read_config(&app)?), "queued": 0, "running": false, "lastRunAt": null }))
}

#[tauri::command]
pub fn tauri_sync_enqueue(operation: String, payload: Option<Value>) -> R<Value> {
  Ok(json!({ "queued": false, "operation": operation, "payload": payload, "reason": "queue-not-enabled-yet" }))
}

#[tauri::command]
pub fn tauri_sync_run(app: AppHandle, payload_by_operation: Option<Value>) -> R<Value> {
  Ok(json!({ "ok": true, "runtime": "tauri-rust", "activeVault": active_vault(&read_config(&app)?), "payload": payload_by_operation }))
}

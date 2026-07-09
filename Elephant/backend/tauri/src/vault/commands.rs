use serde_json::{json, Value};
use tauri::AppHandle;

use super::config::{
    get_active_vault, read_config, remove_vault, set_active_vault, set_vault_icon, set_vault_name,
    upsert_vault, write_config,
};
use super::entries;
use super::metadata::{initialize_vault, read_json_or};
use super::sync;
use super::types::active_vault;
use crate::vault_layout;

type R<T> = Result<T, String>;
const DIRECTORY_LIST_LIMIT_MAX: usize = 500;

fn payload(app: &AppHandle, vault: Option<super::types::VaultDescriptor>) -> R<Value> {
    let config = read_config(app)?;
    if let Some(vault) = vault {
        let workspace = initialize_vault(&vault.path)?;
        let listed_entries = entries::list_directory_page(&vault, "", 0, Some(120), true)?;
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
pub fn tauri_directory_list(
    app: AppHandle,
    relative_path: Option<String>,
    offset: Option<u64>,
    limit: Option<u64>,
    include_preview: Option<bool>,
) -> R<Vec<Value>> {
    let offset = offset.unwrap_or(0) as usize;
    let limit = limit.map(|value| value.clamp(1, DIRECTORY_LIST_LIMIT_MAX as u64) as usize);
    entries::list_directory_page(
        &get_active_vault(&app)?,
        relative_path.as_deref().unwrap_or(""),
        offset,
        limit,
        include_preview.unwrap_or(true),
    )
}

#[tauri::command]
pub fn tauri_notes_create(
    app: AppHandle,
    relative_path: Option<String>,
    filename: Option<String>,
    title: Option<String>,
) -> R<Value> {
    entries::create_note(&get_active_vault(&app)?, relative_path, filename, title)
}

#[tauri::command]
pub fn tauri_folders_create(app: AppHandle, relative_path: Option<String>) -> R<Value> {
    entries::create_folder(&get_active_vault(&app)?, relative_path)
}

#[tauri::command]
pub fn tauri_sidebar_attach(
    app: AppHandle,
    relative_path: String,
    title: Option<String>,
    entry_type: Option<String>,
) -> R<Value> {
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
pub fn tauri_entries_move(
    app: AppHandle,
    relative_path: String,
    target_directory_path: Option<String>,
) -> R<Value> {
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
    Ok(read_json_or(
        vault_layout::config_file(&vault.path, vault_layout::CALENDAR_FILE),
        json!({ "events": [] }),
    )
    .get("events")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default())
}

#[tauri::command]
pub fn tauri_sources_list(app: AppHandle) -> R<Vec<Value>> {
    let vault = get_active_vault(&app)?;
    Ok(read_json_or(
        vault_layout::config_file(&vault.path, vault_layout::SOURCES_FILE),
        json!({ "sources": [] }),
    )
    .get("sources")
    .and_then(Value::as_array)
    .cloned()
    .unwrap_or_default())
}

#[tauri::command]
pub fn tauri_sync_status(app: AppHandle) -> R<Value> {
    sync::sync_status(active_vault(&read_config(&app)?))
}

#[tauri::command]
pub fn tauri_sync_enqueue(app: AppHandle, operation: String, payload: Option<Value>) -> R<Value> {
    sync::sync_enqueue(get_active_vault(&app)?, operation, payload)
}

#[tauri::command]
pub fn tauri_sync_run(app: AppHandle, payload_by_operation: Option<Value>) -> R<Value> {
    sync::sync_run(get_active_vault(&app)?, payload_by_operation)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> std::path::PathBuf {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("elephant-{name}-{stamp}"))
    }
}

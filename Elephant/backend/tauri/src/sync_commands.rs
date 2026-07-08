use serde_json::Value;
use tauri::{AppHandle, State};

use crate::sync::IrohSyncState;
use crate::vault::{config, sync};

type R<T> = Result<T, String>;

fn with_running(mut value: Value, running: bool) -> Value {
  if let Some(object) = value.as_object_mut() {
    object.insert("running".to_string(), Value::Bool(running));
  }
  value
}

#[tauri::command(rename = "tauri_sync_create_invite")]
pub async fn iroh_sync_create_invite(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  payload: Option<Value>,
) -> R<Value> {
  let runtime = state.runtime(&app).await?;
  let _operation = state.lock_operation().await;
  let vault = config::get_active_vault(&app)?;
  sync::cleanup_conflicts_for_vault(&vault)?;
  sync::sync_create_invite(vault, payload, runtime).await
}

#[tauri::command(rename = "tauri_sync_accept_invite")]
pub async fn iroh_sync_accept_invite(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  invite: Value,
) -> R<Value> {
  let runtime = state.runtime(&app).await?;
  let _operation = state.lock_operation().await;
  let vault = config::get_active_vault(&app)?;
  sync::cleanup_conflicts_for_vault(&vault)?;
  sync::sync_accept_invite(vault, invite, runtime).await
}

#[tauri::command(rename = "tauri_sync_status")]
pub async fn iroh_sync_status(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
) -> R<Value> {
  let runtime = state.runtime(&app).await?;
  let running = state.is_running();
  let vault_config = config::read_config(&app)?;
  let value = if let Some(vault) = crate::vault::types::active_vault(&vault_config) {
    if !running {
      sync::cleanup_conflicts_for_vault(&vault)?;
    }
    sync::sync_status_iroh(Some(vault), &runtime.endpoint_id().to_string())?
  } else {
    sync::sync_status_iroh(None, &runtime.endpoint_id().to_string())?
  };
  Ok(with_running(value, running))
}

#[tauri::command(rename = "tauri_sync_enqueue")]
pub async fn iroh_sync_enqueue(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  operation: String,
  payload: Option<Value>,
) -> R<Value> {
  let runtime = state.runtime(&app).await?;
  let _operation = state.lock_operation().await;
  let vault = config::get_active_vault(&app)?;
  sync::cleanup_conflicts_for_vault(&vault)?;
  sync::sync_enqueue_iroh(
    vault,
    &runtime.endpoint_id().to_string(),
    operation,
    payload,
  )
}

#[tauri::command(rename = "tauri_sync_run")]
pub async fn iroh_sync_run(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  payload_by_operation: Option<Value>,
) -> R<Value> {
  let runtime = state.runtime(&app).await?;
  let _operation = state.lock_operation().await;
  let vault = config::get_active_vault(&app)?;
  sync::cleanup_conflicts_for_vault(&vault)?;
  let result = {
    let _activity = state.begin_activity()?;
    sync::sync_run_iroh(vault, payload_by_operation, runtime).await
  }?;
  Ok(with_running(result, false))
}

#[tauri::command(rename = "tauri_sync_conflict_settings_get")]
pub async fn iroh_sync_conflict_settings_get(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
) -> R<Value> {
  let vault = config::get_active_vault(&app)?;
  if state.is_running() {
    sync::sync_conflict_settings_peek(vault)
  } else {
    sync::sync_conflict_settings_get(vault)
  }
}

#[tauri::command(rename = "tauri_sync_conflict_settings_set")]
pub async fn iroh_sync_conflict_settings_set(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  conflict_retention_days: u32,
) -> R<Value> {
  let _operation = state.lock_operation().await;
  sync::sync_conflict_settings_set(
    config::get_active_vault(&app)?,
    conflict_retention_days,
  )
}

#[tauri::command(rename = "tauri_sync_conflict_restore")]
pub async fn iroh_sync_conflict_restore(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  relative_path: String,
) -> R<Value> {
  let _operation = state.lock_operation().await;
  sync::sync_conflict_restore(config::get_active_vault(&app)?, relative_path)
}

#[tauri::command(rename = "tauri_sync_conflict_delete")]
pub async fn iroh_sync_conflict_delete(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  relative_path: String,
) -> R<Value> {
  let _operation = state.lock_operation().await;
  sync::sync_conflict_delete(config::get_active_vault(&app)?, relative_path)
}

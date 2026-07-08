use serde_json::Value;
use tauri::{AppHandle, State};

use crate::sync::IrohSyncState;
use crate::vault::{config, sync};

type R<T> = Result<T, String>;

#[tauri::command(rename = "tauri_sync_create_invite")]
pub async fn iroh_sync_create_invite(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  payload: Option<Value>,
) -> R<Value> {
  let runtime = state.runtime(&app).await?;
  let _operation = state.lock_operation().await;
  sync::sync_create_invite(config::get_active_vault(&app)?, payload, runtime).await
}

#[tauri::command(rename = "tauri_sync_accept_invite")]
pub async fn iroh_sync_accept_invite(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
  invite: Value,
) -> R<Value> {
  let runtime = state.runtime(&app).await?;
  let _operation = state.lock_operation().await;
  sync::sync_accept_invite(config::get_active_vault(&app)?, invite, runtime).await
}

#[tauri::command(rename = "tauri_sync_status")]
pub async fn iroh_sync_status(
  app: AppHandle,
  state: State<'_, IrohSyncState>,
) -> R<Value> {
  let runtime = state.runtime(&app).await?;
  let vault = config::read_config(&app)?;
  sync::sync_status_iroh(
    crate::vault::types::active_vault(&vault),
    &runtime.endpoint_id().to_string(),
  )
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
  sync::sync_enqueue_iroh(
    config::get_active_vault(&app)?,
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
  sync::sync_run_iroh(
    config::get_active_vault(&app)?,
    payload_by_operation,
    runtime,
  )
  .await
}

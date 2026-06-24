use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::vault_layout;

use super::types::VaultDescriptor;

type R<T> = Result<T, String>;

const OP_INIT: &str = "init";
const OP_PULL: &str = "pull";
const OP_SNAPSHOT: &str = "snapshot";
const OP_PUSH: &str = "push";
const OP_SYNC: &str = "sync";

const STATUS_QUEUED: &str = "queued";
const STATUS_DONE: &str = "done";
const BACKEND_GIT: &str = "git";

pub const SYNC_CONFIG_FILE: &str = "sync-config.json";
pub const SYNC_HISTORY_FILE: &str = "sync-log.json";
pub const SYNC_QUEUE_FILE: &str = "sync-queue.json";
pub const SYNC_STATE_FILE: &str = "sync-state.json";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct SyncConfig {
  version: u8,
  device_id: String,
  folder_id: String,
  folder_label: String,
  backend: String,
  mode: String,
  remote_name: String,
  remote: String,
  remote_path: String,
  branch: String,
  peers: Vec<Value>,
  updated_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct SyncQueueItem {
  id: String,
  operation: String,
  payload: Value,
  status: String,
  created_at: String,
  updated_at: String,
  error: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct SyncHistoryRecord {
  id: String,
  operation: String,
  status: String,
  updated_at: String,
  error: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct RepositoryStatus {
  branch: String,
  ahead: u32,
  behind: u32,
  dirty: bool,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct SyncState {
  last_run_at: String,
  last_error: String,
  repository: RepositoryStatus,
}

fn now() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn sync_path(cwd: &Path, file: &str) -> PathBuf {
  vault_layout::sync_file(cwd, file)
}

fn normalized_payload(payload: Value) -> Value {
  if payload.is_object() { payload } else { json!({}) }
}

fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
  fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or_default()
}

fn read_value(path: &Path, fallback: Value) -> Value {
  fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or(fallback)
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> R<()> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let raw = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
  fs::write(path, format!("{}\n", raw)).map_err(|error| error.to_string())
}

fn read_config(cwd: &Path) -> Option<SyncConfig> {
  let path = sync_path(cwd, SYNC_CONFIG_FILE);
  if path.exists() { Some(read_json(&path)) } else { None }
}

fn read_queue(cwd: &Path) -> Vec<SyncQueueItem> {
  let value = read_value(&sync_path(cwd, SYNC_QUEUE_FILE), json!({ "queue": [] }));
  value
    .get("queue")
    .and_then(Value::as_array)
    .or_else(|| value.as_array())
    .map(|items| items.iter().filter_map(|item| serde_json::from_value(item.clone()).ok()).collect())
    .unwrap_or_default()
}

fn write_queue(cwd: &Path, queue: &[SyncQueueItem]) -> R<()> {
  write_json(&sync_path(cwd, SYNC_QUEUE_FILE), &json!({ "version": 1, "updatedAt": now(), "queue": queue }))
}

fn read_history(cwd: &Path) -> Vec<SyncHistoryRecord> {
  let value = read_value(&sync_path(cwd, SYNC_HISTORY_FILE), json!({ "history": [] }));
  value
    .get("history")
    .and_then(Value::as_array)
    .map(|items| items.iter().filter_map(|item| serde_json::from_value(item.clone()).ok()).collect())
    .unwrap_or_default()
}

fn write_history(cwd: &Path, history: &[SyncHistoryRecord]) -> R<()> {
  let history = if history.len() > 200 { &history[history.len() - 200..] } else { history };
  write_json(&sync_path(cwd, SYNC_HISTORY_FILE), &json!({ "version": 1, "updatedAt": now(), "history": history }))
}

fn read_state(cwd: &Path) -> SyncState {
  read_json(&sync_path(cwd, SYNC_STATE_FILE))
}

fn write_state(cwd: &Path, state: &SyncState) -> R<()> {
  write_json(&sync_path(cwd, SYNC_STATE_FILE), state)
}

fn valid_operation(operation: &str) -> bool {
  matches!(operation, OP_INIT | OP_PULL | OP_SNAPSHOT | OP_PUSH | OP_SYNC)
}

fn explicit_operations(payload: &Value) -> Vec<String> {
  payload
    .get("operations")
    .and_then(Value::as_array)
    .map(|operations| operations.iter().filter_map(Value::as_str).map(str::trim).filter(|operation| valid_operation(operation)).map(str::to_string).collect())
    .unwrap_or_default()
}

fn plan_operations(payload: &Value) -> Vec<String> {
  let explicit = explicit_operations(payload);
  if !explicit.is_empty() {
    return explicit;
  }
  if payload.get(OP_SYNC).is_some() || ![OP_INIT, OP_PULL, OP_SNAPSHOT, OP_PUSH].iter().any(|operation| payload.get(*operation).is_some()) {
    return [OP_INIT, OP_PULL, OP_SNAPSHOT, OP_PUSH].iter().map(|operation| operation.to_string()).collect();
  }
  let mut operations = vec![OP_INIT.to_string()];
  for operation in [OP_PULL, OP_SNAPSHOT, OP_PUSH] {
    if payload.get(operation).is_some() {
      operations.push(operation.to_string());
    }
  }
  operations
}

fn payload_for(payload: &Value, operation: &str) -> Value {
  normalized_payload(payload.get(operation).cloned().unwrap_or_else(|| json!({})))
}

fn payload_for_or(payload: &Value, operation: &str, fallback_operation: &str) -> Value {
  normalized_payload(payload.get(operation).cloned().or_else(|| payload.get(fallback_operation).cloned()).unwrap_or_else(|| json!({})))
}

pub fn create_sync_plan_value(payload_by_operation: Value) -> Value {
  let payload = normalized_payload(payload_by_operation);
  let operations = plan_operations(&payload);
  let items = operations
    .iter()
    .map(|operation| {
      let operation_payload = if payload.get(OP_SYNC).is_some() { payload_for_or(&payload, operation, OP_SYNC) } else { payload_for(&payload, operation) };
      json!({ "operation": operation, "payload": operation_payload })
    })
    .collect::<Vec<_>>();
  json!({ "operations": operations, "items": items })
}

fn queue_item(operation: &str, payload: Value, index: usize, status: &str) -> SyncQueueItem {
  let timestamp = now();
  SyncQueueItem {
    id: format!("sync-{}-{}", timestamp, index),
    operation: operation.to_string(),
    payload,
    status: status.to_string(),
    created_at: timestamp.clone(),
    updated_at: timestamp,
    error: String::new(),
  }
}

fn default_config(vault: &VaultDescriptor) -> SyncConfig {
  let label = Path::new(&vault.path).file_name().and_then(|name| name.to_str()).unwrap_or("Vault").to_string();
  SyncConfig {
    version: 2,
    device_id: format!("en-{}", vault.id),
    folder_id: format!("vault-{}", vault.id),
    folder_label: label,
    backend: BACKEND_GIT.to_string(),
    mode: "send-receive".to_string(),
    remote_name: "origin".to_string(),
    remote: String::new(),
    remote_path: String::new(),
    branch: String::new(),
    peers: Vec::new(),
    updated_at: now(),
  }
}

fn ensure_sync_files(vault: &VaultDescriptor) -> R<()> {
  let cwd = PathBuf::from(&vault.path);
  fs::create_dir_all(vault_layout::hidden_dir(&cwd, vault_layout::SYNC_DIR)).map_err(|error| error.to_string())?;
  if read_config(&cwd).is_none() {
    write_json(&sync_path(&cwd, SYNC_CONFIG_FILE), &default_config(vault))?;
  }
  Ok(())
}

fn repository_status(_cwd: &Path) -> RepositoryStatus {
  RepositoryStatus::default()
}

fn status_value(vault: &VaultDescriptor, queue: &[SyncQueueItem], history: &[SyncHistoryRecord], state: &SyncState, config: Option<&SyncConfig>, repository: &RepositoryStatus) -> Value {
  json!({
    "runtime": "tauri-rust",
    "activeVault": vault,
    "cwd": vault.path.as_str(),
    "running": false,
    "deviceId": config.map(|config| config.device_id.as_str()).unwrap_or(""),
    "folderId": config.map(|config| config.folder_id.as_str()).unwrap_or(""),
    "backend": config.map(|config| config.backend.as_str()).unwrap_or(BACKEND_GIT),
    "remote": config.map(|config| config.remote.as_str()).unwrap_or(""),
    "remotePath": config.map(|config| config.remote_path.as_str()).unwrap_or(""),
    "peers": config.map(|config| config.peers.clone()).unwrap_or_default(),
    "branch": if repository.branch.is_empty() { config.map(|config| config.branch.as_str()).unwrap_or("") } else { repository.branch.as_str() },
    "ahead": repository.ahead,
    "behind": repository.behind,
    "dirty": repository.dirty,
    "syncthing": { "configured": false, "connected": false, "endpoint": "", "localDeviceId": "", "folderState": "", "lastError": "" },
    "queued": queue.iter().filter(|item| item.status == STATUS_QUEUED).count(),
    "operations": queue,
    "history": history,
    "lastRunAt": state.last_run_at.as_str(),
    "lastError": state.last_error.as_str()
  })
}

fn no_active_status() -> Value {
  json!({
    "runtime": "tauri-rust",
    "activeVault": null,
    "cwd": "",
    "running": false,
    "deviceId": "",
    "folderId": "",
    "backend": BACKEND_GIT,
    "remote": "",
    "remotePath": "",
    "peers": [],
    "branch": "",
    "ahead": 0,
    "behind": 0,
    "dirty": false,
    "syncthing": { "configured": false, "connected": false, "endpoint": "", "localDeviceId": "", "folderState": "", "lastError": "" },
    "queued": 0,
    "operations": [],
    "history": [],
    "lastRunAt": "",
    "lastError": "No active ElephantNote vault."
  })
}

pub fn sync_status(vault: Option<VaultDescriptor>) -> R<Value> {
  let Some(vault) = vault else {
    return Ok(no_active_status());
  };
  ensure_sync_files(&vault)?;
  let cwd = PathBuf::from(&vault.path);
  let queue = read_queue(&cwd);
  let history = read_history(&cwd);
  let mut state = read_state(&cwd);
  let repository = repository_status(&cwd);
  state.repository = repository.clone();
  let config = read_config(&cwd);
  Ok(status_value(&vault, &queue, &history, &state, config.as_ref(), &repository))
}

pub fn sync_enqueue(vault: VaultDescriptor, operation: String, payload: Option<Value>) -> R<Value> {
  if !valid_operation(&operation) {
    return Err(format!("Unknown sync operation: {}.", operation));
  }
  ensure_sync_files(&vault)?;
  let cwd = PathBuf::from(&vault.path);
  let mut queue = read_queue(&cwd);
  queue.push(queue_item(&operation, normalized_payload(payload.unwrap_or_else(|| json!({}))), queue.len(), STATUS_QUEUED));
  write_queue(&cwd, &queue)?;
  sync_status(Some(vault))
}

pub fn sync_run(vault: VaultDescriptor, payload_by_operation: Option<Value>) -> R<Value> {
  ensure_sync_files(&vault)?;
  let cwd = PathBuf::from(&vault.path);
  let payload = normalized_payload(payload_by_operation.unwrap_or_else(|| json!({})));
  let items = create_sync_plan_value(payload).get("items").and_then(Value::as_array).cloned().unwrap_or_default();
  let mut queue = read_queue(&cwd);
  let mut history = read_history(&cwd);

  for item in items {
    let operation = item.get("operation").and_then(Value::as_str).unwrap_or(OP_SYNC).to_string();
    let operation_payload = normalized_payload(item.get("payload").cloned().unwrap_or_else(|| json!({})));
    let done = queue_item(&operation, operation_payload, queue.len(), STATUS_DONE);
    history.push(SyncHistoryRecord { id: done.id.clone(), operation: done.operation.clone(), status: done.status.clone(), updated_at: done.updated_at.clone(), error: String::new() });
    queue.push(done);
  }

  write_queue(&cwd, &queue)?;
  write_history(&cwd, &history)?;
  let mut state = read_state(&cwd);
  state.last_run_at = now();
  state.last_error.clear();
  state.repository = repository_status(&cwd);
  write_state(&cwd, &state)?;
  sync_status(Some(vault))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn default_plan_pulls_before_snapshot() {
    let plan = create_sync_plan_value(json!({}));
    assert_eq!(plan["operations"], json!(["init", "pull", "snapshot", "push"]));
  }

  #[test]
  fn explicit_plan_is_preserved() {
    let plan = create_sync_plan_value(json!({ "operations": ["init", "snapshot"] }));
    assert_eq!(plan["operations"], json!(["init", "snapshot"]));
  }
}

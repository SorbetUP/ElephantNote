use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::vault_layout;

use super::types::VaultDescriptor;

type R<T> = Result<T, String>;

const SYNC_OPERATION_INIT: &str = "init";
const SYNC_OPERATION_SNAPSHOT: &str = "snapshot";
const SYNC_OPERATION_PULL: &str = "pull";
const SYNC_OPERATION_PUSH: &str = "push";
const SYNC_OPERATION_SYNC: &str = "sync";

const SYNC_STATUS_QUEUED: &str = "queued";
const SYNC_STATUS_RUNNING: &str = "running";
const SYNC_STATUS_DONE: &str = "done";
const SYNC_STATUS_ERROR: &str = "error";

const SYNC_BACKEND_GIT: &str = "git";
const SYNC_DEFAULT_REMOTE: &str = "origin";

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

fn read_json<T: for<'de> Deserialize<'de> + Default>(path: &Path) -> T {
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or_default()
}

fn read_value(path: &Path, fallback: Value) -> Value {
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or(fallback)
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

fn normalized_payload(payload: Value) -> Value {
  if payload.is_object() { payload } else { json!({}) }
}

fn valid_operation(operation: &str) -> bool {
  matches!(operation, SYNC_OPERATION_INIT | SYNC_OPERATION_SNAPSHOT | SYNC_OPERATION_PULL | SYNC_OPERATION_PUSH | SYNC_OPERATION_SYNC)
}

fn explicit_operations(payload: &Value) -> Vec<String> {
  payload
    .get("operations")
    .and_then(Value::as_array)
    .map(|operations| operations.iter().filter_map(Value::as_str).map(str::trim).filter(|op| valid_operation(op)).map(str::to_string).collect())
    .unwrap_or_default()
}

fn payload_for(payload: &Value, operation: &str) -> Value {
  normalized_payload(payload.get(operation).cloned().unwrap_or_else(|| json!({})))
}

fn payload_for_or(payload: &Value, operation: &str, fallback: &str) -> Value {
  normalized_payload(payload.get(operation).cloned().or_else(|| payload.get(fallback).cloned()).unwrap_or_else(|| json!({})))
}

fn plan_operations(payload: &Value) -> Vec<String> {
  let explicit = explicit_operations(payload);
  if !explicit.is_empty() {
    return explicit;
  }
  if payload.get(SYNC_OPERATION_SYNC).is_some() || ![SYNC_OPERATION_INIT, SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH].iter().any(|op| payload.get(*op).is_some()) {
    return vec![SYNC_OPERATION_INIT, SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH].into_iter().map(str::to_string).collect();
  }

  let mut operations = vec![SYNC_OPERATION_INIT.to_string()];
  for operation in [SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH] {
    if payload.get(operation).is_some() {
      operations.push(operation.to_string());
    }
  }
  operations
}

pub fn create_sync_plan_value(payload_by_operation: Value) -> Value {
  let payload = normalized_payload(payload_by_operation);
  let operations = plan_operations(&payload);
  let payloads = operations
    .iter()
    .map(|operation| {
      let value = if payload.get(SYNC_OPERATION_SYNC).is_some() {
        payload_for_or(&payload, operation, SYNC_OPERATION_SYNC)
      } else {
        payload_for(&payload, operation)
      };
      json!({ "operation": operation, "payload": value })
    })
    .collect::<Vec<_>>();
  json!({ "operations": operations, "items": payloads })
}

fn queue_item(operation: &str, payload: Value, index: usize) -> SyncQueueItem {
  let timestamp = now();
  SyncQueueItem {
    id: format!("sync-{}-{}", timestamp, index),
    operation: operation.to_string(),
    payload,
    status: SYNC_STATUS_QUEUED.to_string(),
    created_at: timestamp.clone(),
    updated_at: timestamp,
    error: String::new(),
  }
}

fn git(cwd: &Path, args: &[&str]) -> R<String> {
  let output = Command::new("git")
    .args(args)
    .current_dir(cwd)
    .output()
    .map_err(|error| format!("failed to execute git {}: {}", args.join(" "), error))?;
  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).to_string();
  if output.status.success() {
    Ok(stdout)
  } else {
    let details = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
    Err(format!("git {} failed: {}", args.join(" "), details))
  }
}

fn git_ok(cwd: &Path, args: &[&str]) -> bool {
  Command::new("git").args(args).current_dir(cwd).output().map(|output| output.status.success()).unwrap_or(false)
}

fn config_from_payload(cwd: &Path, previous: Option<SyncConfig>, payload: &Value) -> SyncConfig {
  let previous = previous.unwrap_or_default();
  let timestamp = now();
  let label = cwd.file_name().and_then(|name| name.to_str()).unwrap_or("Vault").to_string();
  SyncConfig {
    version: 2,
    device_id: if previous.device_id.is_empty() { format!("en-{}", timestamp) } else { previous.device_id },
    folder_id: if previous.folder_id.is_empty() { format!("vault-{}", label.replace(' ', "-").to_lowercase()) } else { previous.folder_id },
    folder_label: if previous.folder_label.is_empty() { label } else { previous.folder_label },
    backend: payload.get("backend").and_then(Value::as_str).unwrap_or(if previous.backend.is_empty() { SYNC_BACKEND_GIT } else { &previous.backend }).to_string(),
    mode: payload.get("mode").and_then(Value::as_str).unwrap_or(if previous.mode.is_empty() { "send-receive" } else { &previous.mode }).to_string(),
    remote_name: payload.get("remoteName").and_then(Value::as_str).unwrap_or(if previous.remote_name.is_empty() { SYNC_DEFAULT_REMOTE } else { &previous.remote_name }).to_string(),
    remote: payload.get("remote").and_then(Value::as_str).unwrap_or(&previous.remote).to_string(),
    remote_path: payload.get("remotePath").and_then(Value::as_str).unwrap_or(&previous.remote_path).to_string(),
    branch: payload.get("branch").and_then(Value::as_str).unwrap_or(&previous.branch).to_string(),
    peers: payload.get("peers").and_then(Value::as_array).cloned().unwrap_or(previous.peers),
    updated_at: timestamp,
  }
}

fn ensure_ready(cwd: &Path, payload: &Value) -> R<SyncConfig> {
  fs::create_dir_all(cwd).map_err(|error| error.to_string())?;
  fs::create_dir_all(vault_layout::hidden_dir(cwd, vault_layout::SYNC_DIR)).map_err(|error| error.to_string())?;
  if !cwd.join(".git").exists() {
    git(cwd, &["init"])?;
  }
  if !git_ok(cwd, &["config", "user.name"]) {
    git(cwd, &["config", "user.name", "ElephantNote Sync"])?;
  }
  if !git_ok(cwd, &["config", "user.email"]) {
    git(cwd, &["config", "user.email", "sync@elephantnote.local"])?;
  }

  let config = config_from_payload(cwd, read_config(cwd), payload);
  if !config.remote.is_empty() {
    if git_ok(cwd, &["remote", "get-url", &config.remote_name]) {
      git(cwd, &["remote", "set-url", &config.remote_name, &config.remote])?;
    } else {
      git(cwd, &["remote", "add", &config.remote_name, &config.remote])?;
    }
  }
  write_json(&sync_path(cwd, SYNC_CONFIG_FILE), &config)?;
  Ok(config)
}

fn current_branch(cwd: &Path) -> String {
  git(cwd, &["branch", "--show-current"]).map(|out| out.trim().to_string()).unwrap_or_default()
}

fn target_branch(cwd: &Path, config: &SyncConfig, payload: &Value) -> String {
  payload
    .get("branch")
    .and_then(Value::as_str)
    .filter(|branch| !branch.is_empty())
    .or_else(|| if config.branch.is_empty() { None } else { Some(config.branch.as_str()) })
    .map(str::to_string)
    .unwrap_or_else(|| {
      let branch = current_branch(cwd);
      if branch.is_empty() { "main".to_string() } else { branch }
    })
}

fn has_remote(cwd: &Path, config: &SyncConfig) -> bool {
  !config.remote.is_empty() || git_ok(cwd, &["remote", "get-url", &config.remote_name])
}

fn run_operation(cwd: &Path, operation: &str, payload: &Value) -> R<()> {
  match operation {
    SYNC_OPERATION_INIT => ensure_ready(cwd, payload).map(|_| ()),
    SYNC_OPERATION_PULL => {
      let config = ensure_ready(cwd, payload)?;
      if has_remote(cwd, &config) {
        let branch = target_branch(cwd, &config, payload);
        git(cwd, &["pull", "--ff-only", &config.remote_name, &branch])?;
      }
      Ok(())
    }
    SYNC_OPERATION_SNAPSHOT => {
      ensure_ready(cwd, payload)?;
      if git(cwd, &["status", "--short"])?.trim().is_empty() {
        return Ok(());
      }
      git(cwd, &["add", "-A"])?;
      let message = payload
        .get("message")
        .and_then(Value::as_str)
        .filter(|message| !message.trim().is_empty())
        .unwrap_or("ElephantNote sync snapshot");
      git(cwd, &["commit", "-m", message])?;
      Ok(())
    }
    SYNC_OPERATION_PUSH => {
      let config = ensure_ready(cwd, payload)?;
      if has_remote(cwd, &config) {
        let branch = target_branch(cwd, &config, payload);
        git(cwd, &["push", "-u", &config.remote_name, &branch])?;
      }
      Ok(())
    }
    SYNC_OPERATION_SYNC => {
      run_operation(cwd, SYNC_OPERATION_INIT, payload)?;
      run_operation(cwd, SYNC_OPERATION_PULL, payload)?;
      run_operation(cwd, SYNC_OPERATION_SNAPSHOT, payload)?;
      run_operation(cwd, SYNC_OPERATION_PUSH, payload)
    }
    _ => Err(format!("Unknown sync operation: {}.", operation)),
  }
}

fn repository_status(cwd: &Path) -> RepositoryStatus {
  if !cwd.join(".git").exists() {
    return RepositoryStatus::default();
  }
  let status = git(cwd, &["status", "--short", "--branch"]).unwrap_or_default();
  let mut lines = status.lines();
  let branch_line = lines.next().unwrap_or_default();
  RepositoryStatus {
    branch: current_branch(cwd),
    ahead: parse_counter(branch_line, "ahead"),
    behind: parse_counter(branch_line, "behind"),
    dirty: lines.any(|line| !line.trim().is_empty()),
  }
}

fn parse_counter(line: &str, label: &str) -> u32 {
  line
    .split(label)
    .nth(1)
    .and_then(|tail| tail.trim_start().split(|character: char| !character.is_ascii_digit()).next())
    .and_then(|digits| digits.parse::<u32>().ok())
    .unwrap_or(0)
}

fn status_value(vault: &VaultDescriptor, queue: &[SyncQueueItem], history: &[SyncHistoryRecord], state: &SyncState, config: Option<&SyncConfig>, repository: &RepositoryStatus) -> Value {
  json!({
    "runtime": "tauri-rust",
    "activeVault": vault,
    "cwd": vault.path,
    "running": queue.iter().any(|item| item.status == SYNC_STATUS_RUNNING),
    "deviceId": config.map(|config| config.device_id.as_str()).unwrap_or(""),
    "folderId": config.map(|config| config.folder_id.as_str()).unwrap_or(""),
    "backend": config.map(|config| config.backend.as_str()).unwrap_or(SYNC_BACKEND_GIT),
    "remote": config.map(|config| config.remote.as_str()).unwrap_or(""),
    "remotePath": config.map(|config| config.remote_path.as_str()).unwrap_or(""),
    "peers": config.map(|config| config.peers.clone()).unwrap_or_default(),
    "branch": if repository.branch.is_empty() { config.map(|config| config.branch.as_str()).unwrap_or("") } else { repository.branch.as_str() },
    "ahead": repository.ahead,
    "behind": repository.behind,
    "dirty": repository.dirty,
    "syncthing": { "configured": false, "connected": false, "endpoint": "", "localDeviceId": "", "folderState": "", "lastError": "" },
    "queued": queue.iter().filter(|item| item.status == SYNC_STATUS_QUEUED).count(),
    "operations": queue,
    "history": history,
    "lastRunAt": state.last_run_at,
    "lastError": state.last_error
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
    "backend": SYNC_BACKEND_GIT,
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
  let cwd = PathBuf::from(&vault.path);
  let queue = read_queue(&cwd);
  let history = read_history(&cwd);
  let mut state = read_state(&cwd);
  let repository = repository_status(&cwd);
  state.repository = repository.clone();
  Ok(status_value(&vault, &queue, &history, &state, read_config(&cwd).as_ref(), &repository))
}

pub fn sync_enqueue(vault: VaultDescriptor, operation: String, payload: Option<Value>) -> R<Value> {
  if !valid_operation(&operation) {
    return Err(format!("Unknown sync operation: {}.", operation));
  }
  let cwd = PathBuf::from(&vault.path);
  let mut queue = read_queue(&cwd);
  queue.push(queue_item(&operation, normalized_payload(payload.unwrap_or_else(|| json!({}))), queue.len()));
  write_queue(&cwd, &queue)?;
  sync_status(Some(vault))
}

pub fn sync_run(vault: VaultDescriptor, payload_by_operation: Option<Value>) -> R<Value> {
  let cwd = PathBuf::from(&vault.path);
  let payload = normalized_payload(payload_by_operation.unwrap_or_else(|| json!({})));
  let plan = create_sync_plan_value(payload.clone());
  let items = plan.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
  let mut queue = read_queue(&cwd);
  let mut history = read_history(&cwd);
  let mut state = read_state(&cwd);

  for item in items {
    let operation = item.get("operation").and_then(Value::as_str).unwrap_or(SYNC_OPERATION_SYNC).to_string();
    let operation_payload = normalized_payload(item.get("payload").cloned().unwrap_or_else(|| json!({})));
    let mut queue_item = queue_item(&operation, operation_payload.clone(), queue.len());
    queue_item.status = SYNC_STATUS_RUNNING.to_string();
    queue_item.updated_at = now();
    queue.push(queue_item.clone());
    write_queue(&cwd, &queue)?;

    match run_operation(&cwd, &operation, &operation_payload) {
      Ok(()) => {
        if let Some(last) = queue.last_mut() {
          last.status = SYNC_STATUS_DONE.to_string();
          last.updated_at = now();
          queue_item = last.clone();
        }
      }
      Err(error) => {
        if let Some(last) = queue.last_mut() {
          last.status = SYNC_STATUS_ERROR.to_string();
          last.error = error.clone();
          last.updated_at = now();
          queue_item = last.clone();
        }
        history.push(SyncHistoryRecord { id: queue_item.id, operation: queue_item.operation, status: queue_item.status, updated_at: queue_item.updated_at, error: queue_item.error });
        write_history(&cwd, &history)?;
        write_queue(&cwd, &queue)?;
        state.last_error = error.clone();
        state.repository = repository_status(&cwd);
        write_state(&cwd, &state)?;
        return Err(error);
      }
    }

    history.push(SyncHistoryRecord { id: queue_item.id, operation: queue_item.operation, status: queue_item.status, updated_at: queue_item.updated_at, error: queue_item.error });
    write_history(&cwd, &history)?;
    write_queue(&cwd, &queue)?;
  }

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

  #[test]
  fn parses_git_ahead_behind_counters() {
    let line = "## main...origin/main [ahead 2, behind 5]";
    assert_eq!(parse_counter(line, "ahead"), 2);
    assert_eq!(parse_counter(line, "behind"), 5);
  }
}

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
const SYNC_OPERATION_PULL: &str = "pull";
const SYNC_OPERATION_SNAPSHOT: &str = "snapshot";
const SYNC_OPERATION_PUSH: &str = "push";
const SYNC_OPERATION_SYNC: &str = "sync";

const STATUS_QUEUED: &str = "queued";
const STATUS_DONE: &str = "done";
const STATUS_ERROR: &str = "error";
const BACKEND_GIT: &str = "git";
const DEFAULT_BRANCH: &str = "main";

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

fn write_config(cwd: &Path, config: &SyncConfig) -> R<()> {
  write_json(&sync_path(cwd, SYNC_CONFIG_FILE), config)
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
  matches!(
    operation,
    SYNC_OPERATION_INIT | SYNC_OPERATION_PULL | SYNC_OPERATION_SNAPSHOT | SYNC_OPERATION_PUSH | SYNC_OPERATION_SYNC
  )
}

fn payload_has(payload: &Value, operation: &str) -> bool {
  payload.get(operation).is_some()
}

fn explicit_operations(payload: &Value) -> Vec<String> {
  payload
    .get("operations")
    .and_then(Value::as_array)
    .map(|operations| {
      operations
        .iter()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|operation| valid_operation(operation))
        .map(str::to_string)
        .collect()
    })
    .unwrap_or_default()
}

fn operation_payload(payload: &Value, operation: &str) -> Value {
  normalized_payload(payload.get(operation).cloned().unwrap_or_else(|| json!({})))
}

fn operation_payload_or_sync(payload: &Value, operation: &str) -> Value {
  normalized_payload(
    payload
      .get(operation)
      .cloned()
      .or_else(|| payload.get(SYNC_OPERATION_SYNC).cloned())
      .unwrap_or_else(|| json!({})),
  )
}

fn planned_operations(payload_by_operation: &Value) -> Vec<String> {
  let operations = explicit_operations(payload_by_operation);
  if !operations.is_empty() {
    return operations;
  }
  if payload_has(payload_by_operation, SYNC_OPERATION_SYNC) {
    return [SYNC_OPERATION_INIT, SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH]
      .iter()
      .map(|operation| operation.to_string())
      .collect();
  }
  let has_explicit_git_operation = [SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH]
    .iter()
    .any(|operation| payload_has(payload_by_operation, operation));
  if !has_explicit_git_operation {
    return [SYNC_OPERATION_INIT, SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH]
      .iter()
      .map(|operation| operation.to_string())
      .collect();
  }
  let mut operations = vec![SYNC_OPERATION_INIT.to_string()];
  for operation in [SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH] {
    if payload_has(payload_by_operation, operation) {
      operations.push(operation.to_string());
    }
  }
  operations
}

pub fn create_sync_plan_value(payload_by_operation: Value) -> Value {
  let payload = normalized_payload(payload_by_operation);
  let operations = planned_operations(&payload);
  let items = operations
    .iter()
    .map(|operation| json!({ "operation": operation, "payload": operation_payload_or_sync(&payload, operation) }))
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
    branch: DEFAULT_BRANCH.to_string(),
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

fn git_text(cwd: &Path, args: &[&str]) -> R<String> {
  let output = Command::new("git").args(args).current_dir(cwd).output().map_err(|error| error.to_string())?;
  if !output.status.success() {
    return Err(format!(
      "git {} failed: {}{}",
      args.join(" "),
      String::from_utf8_lossy(&output.stderr),
      String::from_utf8_lossy(&output.stdout)
    ));
  }
  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

fn git_succeeds(cwd: &Path, args: &[&str]) -> bool {
  Command::new("git").args(args).current_dir(cwd).status().map(|status| status.success()).unwrap_or(false)
}

fn git_has_commits(cwd: &Path) -> bool {
  git_succeeds(cwd, &["rev-parse", "--verify", "HEAD"])
}

fn repository_status(cwd: &Path) -> RepositoryStatus {
  if !cwd.join(".git").exists() {
    return RepositoryStatus::default();
  }
  let branch = git_text(cwd, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
  let dirty = git_text(cwd, &["status", "--porcelain"]).map(|status| !status.trim().is_empty()).unwrap_or(false);
  RepositoryStatus { branch, ahead: 0, behind: 0, dirty }
}

fn status_value(
  vault: &VaultDescriptor,
  queue: &[SyncQueueItem],
  history: &[SyncHistoryRecord],
  state: &SyncState,
  config: Option<&SyncConfig>,
  repository: &RepositoryStatus,
) -> Value {
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

struct SyncRunner {
  vault: VaultDescriptor,
  cwd: PathBuf,
  config: SyncConfig,
  queue: Vec<SyncQueueItem>,
  history: Vec<SyncHistoryRecord>,
  state: SyncState,
}

impl SyncRunner {
  fn new(vault: VaultDescriptor) -> R<Self> {
    ensure_sync_files(&vault)?;
    let cwd = PathBuf::from(&vault.path);
    Ok(Self {
      vault,
      config: read_config(&cwd).unwrap_or_default(),
      queue: read_queue(&cwd),
      history: read_history(&cwd),
      state: read_state(&cwd),
      cwd,
    })
  }

  fn enqueue_operation(&mut self, operation: &str, payload: Value) {
    self.queue.push(queue_item(operation, payload, self.queue.len(), STATUS_QUEUED));
  }

  fn enqueue_default_plan(&mut self, payload_by_operation: &Value) -> R<()> {
    let operations = explicit_operations(payload_by_operation);
    if !operations.is_empty() {
      for operation in operations {
        self.enqueue_operation(&operation, operation_payload_or_sync(payload_by_operation, &operation));
      }
      return Ok(());
    }

    if payload_has(payload_by_operation, SYNC_OPERATION_SYNC) {
      for operation in [SYNC_OPERATION_INIT, SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH] {
        self.enqueue_operation(operation, operation_payload_or_sync(payload_by_operation, operation));
      }
      return Ok(());
    }

    let has_explicit_git_operation = [SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH]
      .iter()
      .any(|operation| payload_has(payload_by_operation, operation));
    self.enqueue_operation(SYNC_OPERATION_INIT, operation_payload(payload_by_operation, SYNC_OPERATION_INIT));

    if !has_explicit_git_operation {
      for operation in [SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH] {
        self.enqueue_operation(operation, operation_payload(payload_by_operation, operation));
      }
      return Ok(());
    }

    for operation in [SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH] {
      if payload_has(payload_by_operation, operation) {
        self.enqueue_operation(operation, operation_payload(payload_by_operation, operation));
      }
    }
    Ok(())
  }

  fn persist(&self) -> R<()> {
    write_config(&self.cwd, &self.config)?;
    write_queue(&self.cwd, &self.queue)?;
    write_history(&self.cwd, &self.history)?;
    write_state(&self.cwd, &self.state)
  }

  fn git(&self, args: &[&str]) -> R<String> {
    git_text(&self.cwd, args)
  }

  fn git_ok(&self, args: &[&str]) -> bool {
    git_succeeds(&self.cwd, args)
  }

  fn ensure_git_repository(&self) -> R<()> {
    fs::create_dir_all(&self.cwd).map_err(|error| error.to_string())?;
    if !self.cwd.join(".git").exists() {
      if !self.git_ok(&["init", "--initial-branch", DEFAULT_BRANCH]) {
        self.git(&["init"])?;
        self.git(&["checkout", "-B", DEFAULT_BRANCH])?;
      }
    }
    self.git(&["config", "user.name", "ElephantNote Sync"])?;
    self.git(&["config", "user.email", "sync@elephantnote.local"])?;
    Ok(())
  }

  fn configured_branch(&self) -> String {
    if !self.config.branch.trim().is_empty() {
      return self.config.branch.clone();
    }
    let current = self.git(&["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();
    if current.trim().is_empty() || current == "HEAD" { DEFAULT_BRANCH.to_string() } else { current }
  }

  fn configure_remote(&mut self, payload: &Value) -> R<()> {
    let branch = payload.get("branch").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).unwrap_or(DEFAULT_BRANCH).to_string();
    self.config.branch = branch;
    if let Some(remote) = payload.get("remote").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
      self.config.remote = remote.to_string();
      self.config.remote_path = remote.to_string();
      let remote_name = if self.config.remote_name.trim().is_empty() { "origin" } else { self.config.remote_name.as_str() };
      if self.git_ok(&["remote", "get-url", remote_name]) {
        self.git(&["remote", "set-url", remote_name, remote])?;
      } else {
        self.git(&["remote", "add", remote_name, remote])?;
      }
    }
    self.config.updated_at = now();
    Ok(())
  }

  fn ensure_git_exclude(&self) -> R<()> {
    if !self.cwd.join(".git").exists() {
      return Ok(());
    }
    let exclude_path = self.cwd.join(".git/info/exclude");
    if let Some(parent) = exclude_path.parent() {
      fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let required = [
      "/.elephantnote/sync/sync-config.json",
      "/.elephantnote/sync/sync-log.json",
      "/.elephantnote/sync/sync-queue.json",
      "/.elephantnote/sync/sync-state.json",
    ];
    let mut content = fs::read_to_string(&exclude_path).unwrap_or_default();
    for line in required {
      if !content.lines().any(|existing| existing.trim() == line) {
        if !content.ends_with('\n') && !content.is_empty() {
          content.push('\n');
        }
        content.push_str(line);
        content.push('\n');
      }
    }
    fs::write(exclude_path, content).map_err(|error| error.to_string())
  }

  fn untrack_sync_metadata(&self) -> R<()> {
    if !self.cwd.join(".git").exists() {
      return Ok(());
    }
    self.git(&["rm", "--cached", "-r", "--ignore-unmatch", ".elephantnote/sync"])?;
    Ok(())
  }

  fn run_init(&mut self, payload: &Value) -> R<()> {
    self.ensure_git_repository()?;
    self.configure_remote(payload)?;
    self.ensure_git_exclude()?;
    self.untrack_sync_metadata()
  }

  fn run_pull(&mut self) -> R<()> {
    self.ensure_git_repository()?;
    self.ensure_git_exclude()?;
    if self.config.remote.trim().is_empty() {
      return Ok(());
    }
    let remote_name = if self.config.remote_name.trim().is_empty() { "origin" } else { self.config.remote_name.as_str() };
    let branch = self.configured_branch();
    self.git(&["fetch", remote_name, &branch])?;
    if git_has_commits(&self.cwd) {
      self.git(&["merge", "--ff-only", "FETCH_HEAD"])?;
    } else {
      self.git(&["checkout", "-B", &branch, "FETCH_HEAD"])?;
    }
    self.ensure_git_exclude()?;
    self.untrack_sync_metadata()
  }

  fn run_snapshot(&mut self, payload: &Value) -> R<()> {
    self.ensure_git_repository()?;
    self.ensure_git_exclude()?;
    self.git(&["add", "-A", "--", "."])?;
    self.untrack_sync_metadata()?;
    if self.git_ok(&["diff", "--cached", "--quiet"]) {
      return Ok(());
    }
    let message = payload.get("message").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).unwrap_or("ElephantNote sync snapshot");
    self.git(&["commit", "-m", message])?;
    Ok(())
  }

  fn run_push(&mut self) -> R<()> {
    self.ensure_git_repository()?;
    if self.config.remote.trim().is_empty() || !git_has_commits(&self.cwd) {
      return Ok(());
    }
    let remote_name = if self.config.remote_name.trim().is_empty() { "origin" } else { self.config.remote_name.as_str() };
    let branch = self.configured_branch();
    self.git(&["push", "-u", remote_name, &branch])?;
    Ok(())
  }

  fn run_operation(&mut self, operation: &str, payload: &Value) -> R<()> {
    match operation {
      SYNC_OPERATION_INIT => self.run_init(payload),
      SYNC_OPERATION_PULL => self.run_pull(),
      SYNC_OPERATION_SNAPSHOT => self.run_snapshot(payload),
      SYNC_OPERATION_PUSH => self.run_push(),
      SYNC_OPERATION_SYNC => Ok(()),
      _ => Err(format!("Unknown sync operation: {}.", operation)),
    }
  }

  fn run_queued_operations(&mut self) -> R<()> {
    let mut remaining = Vec::new();
    let mut last_error = String::new();
    let pending = std::mem::take(&mut self.queue);

    for mut item in pending {
      if item.status != STATUS_QUEUED {
        remaining.push(item);
        continue;
      }
      let result = self.run_operation(&item.operation.clone(), &item.payload.clone());
      item.updated_at = now();
      match result {
        Ok(()) => {
          item.status = STATUS_DONE.to_string();
          item.error.clear();
        }
        Err(error) => {
          item.status = STATUS_ERROR.to_string();
          item.error = error.clone();
          last_error = error;
        }
      }
      self.history.push(SyncHistoryRecord {
        id: item.id.clone(),
        operation: item.operation.clone(),
        status: item.status.clone(),
        updated_at: item.updated_at.clone(),
        error: item.error.clone(),
      });
      if item.status != STATUS_DONE {
        remaining.push(item);
      }
    }

    self.queue = remaining;
    if last_error.is_empty() {
      Ok(())
    } else {
      Err(last_error)
    }
  }

  fn status(&self) -> Value {
    let repository = repository_status(&self.cwd);
    status_value(&self.vault, &self.queue, &self.history, &self.state, Some(&self.config), &repository)
  }
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
  let payload = normalized_payload(payload_by_operation.unwrap_or_else(|| json!({})));
  let mut runner = SyncRunner::new(vault)?;
  runner.enqueue_default_plan(&payload)?;
  let result = runner.run_queued_operations();
  runner.state.last_run_at = now();
  runner.state.last_error = result.err().unwrap_or_default();
  runner.state.repository = repository_status(&runner.cwd);
  runner.persist()?;
  Ok(runner.status())
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

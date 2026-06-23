use serde::{de::DeserializeOwned, Deserialize, Serialize};
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
const SYNC_BACKEND_RCLONE: &str = "rclone";
const SYNC_BACKEND_SYNCTHING_GIT: &str = "syncthing-git";
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

struct GitOutput {
  stdout: String,
}

struct GitSyncEngine {
  cwd: PathBuf,
  queue: Vec<SyncQueueItem>,
  history: Vec<SyncHistoryRecord>,
  state: SyncState,
  config: Option<SyncConfig>,
}

fn now() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn normalize_path(path: impl AsRef<Path>) -> String {
  path.as_ref().to_string_lossy().replace('\\', "/")
}

fn base36(mut value: u32) -> String {
  if value == 0 {
    return "0".to_string();
  }
  let digits = b"0123456789abcdefghijklmnopqrstuvwxyz";
  let mut out = Vec::new();
  while value > 0 {
    out.push(digits[(value % 36) as usize] as char);
    value /= 36;
  }
  out.iter().rev().collect()
}

fn compact_hash(value: &str) -> String {
  let mut hash = 5381_u32;
  for character in value.chars() {
    hash = hash.wrapping_shl(5).wrapping_add(hash) ^ character as u32;
  }
  base36(hash)
}

fn hostname() -> String {
  std::env::var("HOSTNAME")
    .or_else(|_| std::env::var("COMPUTERNAME"))
    .unwrap_or_else(|_| "localhost".to_string())
}

fn folder_label(cwd: &Path) -> String {
  cwd.file_name().and_then(|name| name.to_str()).unwrap_or("Vault").to_string()
}

fn read_json<T: DeserializeOwned + Default>(path: &Path) -> T {
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or_default()
}

fn read_json_value(path: &Path, fallback: Value) -> Value {
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

fn sync_path(cwd: &Path, file: &str) -> PathBuf {
  vault_layout::sync_file(cwd, file)
}

fn read_config(cwd: &Path) -> Option<SyncConfig> {
  let path = sync_path(cwd, SYNC_CONFIG_FILE);
  if path.exists() { Some(read_json(&path)) } else { None }
}

fn read_queue(cwd: &Path) -> Vec<SyncQueueItem> {
  let value = read_json_value(&sync_path(cwd, SYNC_QUEUE_FILE), json!({ "queue": [] }));
  let array = value.get("queue").and_then(Value::as_array).or_else(|| value.as_array());
  array
    .map(|items| items.iter().filter_map(|item| serde_json::from_value(item.clone()).ok()).collect())
    .unwrap_or_default()
}

fn write_queue(cwd: &Path, queue: &[SyncQueueItem]) -> R<()> {
  let queue = if queue.len() > 200 { queue[queue.len() - 200..].to_vec() } else { queue.to_vec() };
  write_json(&sync_path(cwd, SYNC_QUEUE_FILE), &json!({ "version": 1, "updatedAt": now(), "queue": queue }))
}

fn read_history(cwd: &Path) -> Vec<SyncHistoryRecord> {
  let value = read_json_value(&sync_path(cwd, SYNC_HISTORY_FILE), json!({ "history": [] }));
  value
    .get("history")
    .and_then(Value::as_array)
    .map(|items| items.iter().filter_map(|item| serde_json::from_value(item.clone()).ok()).collect())
    .unwrap_or_default()
}

fn write_history(cwd: &Path, history: &[SyncHistoryRecord]) -> R<()> {
  let history = if history.len() > 200 { history[history.len() - 200..].to_vec() } else { history.to_vec() };
  write_json(&sync_path(cwd, SYNC_HISTORY_FILE), &json!({ "version": 1, "updatedAt": now(), "history": history }))
}

fn read_state(cwd: &Path) -> SyncState {
  read_json(&sync_path(cwd, SYNC_STATE_FILE))
}

fn write_state(cwd: &Path, state: &SyncState) -> R<()> {
  write_json(&sync_path(cwd, SYNC_STATE_FILE), state)
}

fn payload_source(payload: &Value) -> &Value {
  payload.get("config").filter(|value| value.is_object()).unwrap_or(payload)
}

fn payload_string(payload: &Value, key: &str) -> Option<String> {
  payload_source(payload).get(key).and_then(Value::as_str).map(str::to_string)
}

fn payload_array(payload: &Value, key: &str) -> Option<Vec<Value>> {
  payload_source(payload).get(key).and_then(Value::as_array).cloned()
}

fn valid_backend(value: &str) -> bool {
  matches!(value, SYNC_BACKEND_GIT | SYNC_BACKEND_RCLONE | SYNC_BACKEND_SYNCTHING_GIT)
}

fn valid_operation(operation: &str) -> bool {
  matches!(
    operation,
    SYNC_OPERATION_INIT | SYNC_OPERATION_SNAPSHOT | SYNC_OPERATION_PULL | SYNC_OPERATION_PUSH | SYNC_OPERATION_SYNC
  )
}

fn normalized_payload(payload: Value) -> Value {
  if payload.is_object() { payload } else { json!({}) }
}

fn payload_for(payload_by_operation: &Value, operation: &str) -> Value {
  normalized_payload(payload_by_operation.get(operation).cloned().unwrap_or_else(|| json!({})))
}

fn create_sync_identity(cwd: &Path, hostname: &str) -> (String, String, String) {
  let cwd = normalize_path(cwd);
  let seed = format!("{}|{}", cwd, hostname);
  (
    format!("en-{}", compact_hash(&seed)),
    format!("vault-{}", compact_hash(&cwd)),
    cwd.split('/').filter(|part| !part.is_empty()).last().unwrap_or("Vault").to_string(),
  )
}

fn create_sync_config(cwd: &Path, previous: Option<&SyncConfig>, payload: &Value) -> SyncConfig {
  let host = hostname();
  let (device_id, folder_id, folder_label_from_identity) = create_sync_identity(cwd, &host);
  let backend = payload_string(payload, "backend")
    .or_else(|| previous.map(|config| config.backend.clone()))
    .filter(|value| valid_backend(value))
    .unwrap_or_else(|| SYNC_BACKEND_GIT.to_string());

  SyncConfig {
    version: 2,
    device_id: previous
      .map(|config| config.device_id.clone())
      .filter(|value| !value.is_empty())
      .unwrap_or(device_id),
    folder_id: previous
      .map(|config| config.folder_id.clone())
      .filter(|value| !value.is_empty())
      .unwrap_or(folder_id),
    folder_label: previous
      .map(|config| config.folder_label.clone())
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| if folder_label_from_identity.is_empty() { folder_label(cwd) } else { folder_label_from_identity }),
    backend,
    mode: payload_string(payload, "mode")
      .or_else(|| previous.map(|config| config.mode.clone()))
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| "send-receive".to_string()),
    remote_name: payload_string(payload, "remoteName")
      .or_else(|| previous.map(|config| config.remote_name.clone()))
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| SYNC_DEFAULT_REMOTE.to_string()),
    remote: payload_string(payload, "remote").or_else(|| previous.map(|config| config.remote.clone())).unwrap_or_default(),
    remote_path: payload_string(payload, "remotePath").or_else(|| previous.map(|config| config.remote_path.clone())).unwrap_or_default(),
    branch: payload_string(payload, "branch").or_else(|| previous.map(|config| config.branch.clone())).unwrap_or_default(),
    peers: payload_array(payload, "peers").or_else(|| previous.map(|config| config.peers.clone())).unwrap_or_default(),
    updated_at: now(),
  }
}

fn create_queue_item(operation: &str, payload: Value, index: usize) -> R<SyncQueueItem> {
  let operation = operation.trim();
  if !valid_operation(operation) {
    return Err(format!("Unknown sync operation: {}.", operation));
  }
  let timestamp = now();
  Ok(SyncQueueItem {
    id: format!("sync-{}-{}", timestamp, compact_hash(&format!("{}:{}", operation, index))),
    operation: operation.to_string(),
    payload: normalized_payload(payload),
    status: SYNC_STATUS_QUEUED.to_string(),
    created_at: timestamp.clone(),
    updated_at: timestamp,
    error: String::new(),
  })
}

fn history_record(item: &SyncQueueItem) -> SyncHistoryRecord {
  SyncHistoryRecord {
    id: item.id.clone(),
    operation: item.operation.clone(),
    status: if [SYNC_STATUS_QUEUED, SYNC_STATUS_RUNNING, SYNC_STATUS_DONE, SYNC_STATUS_ERROR].contains(&item.status.as_str()) {
      item.status.clone()
    } else {
      SYNC_STATUS_ERROR.to_string()
    },
    updated_at: item.updated_at.clone(),
    error: item.error.clone(),
  }
}

fn tail_values<T: Clone + Serialize>(items: &[T], limit: usize) -> Value {
  let slice = if items.len() > limit { &items[items.len() - limit..] } else { items };
  serde_json::to_value(slice).unwrap_or_else(|_| json!([]))
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
    "syncthing": {
      "configured": false,
      "connected": false,
      "endpoint": "",
      "localDeviceId": "",
      "folderState": "",
      "lastError": ""
    },
    "queued": 0,
    "operations": [],
    "history": [],
    "lastRunAt": "",
    "lastError": "No active ElephantNote vault."
  })
}

fn create_status(
  vault: &VaultDescriptor,
  config: Option<&SyncConfig>,
  queue: &[SyncQueueItem],
  history: &[SyncHistoryRecord],
  state: &SyncState,
  repository: &RepositoryStatus,
) -> Value {
  json!({
    "runtime": "tauri-rust",
    "activeVault": vault,
    "cwd": vault.path.as_str(),
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
    "syncthing": {
      "configured": false,
      "connected": false,
      "endpoint": "",
      "localDeviceId": "",
      "folderState": "",
      "lastError": ""
    },
    "queued": queue.iter().filter(|item| item.status == SYNC_STATUS_QUEUED).count(),
    "operations": tail_values(queue, 20),
    "history": tail_values(history, 50),
    "lastRunAt": state.last_run_at.as_str(),
    "lastError": state.last_error.as_str()
  })
}

impl GitSyncEngine {
  fn load(cwd: impl AsRef<Path>) -> GitSyncEngine {
    let cwd = cwd.as_ref().to_path_buf();
    GitSyncEngine {
      queue: read_queue(&cwd),
      history: read_history(&cwd),
      state: read_state(&cwd),
      config: read_config(&cwd),
      cwd,
    }
  }

  fn enqueue(&mut self, operation: &str, payload: Value) -> R<()> {
    let item = create_queue_item(operation, payload, self.queue.len())?;
    self.queue.push(item);
    Ok(())
  }

  fn enqueue_default_plan(&mut self, payload_by_operation: &Value) -> R<()> {
    if payload_by_operation.get(SYNC_OPERATION_SYNC).is_some() {
      self.enqueue(SYNC_OPERATION_SYNC, payload_for(payload_by_operation, SYNC_OPERATION_SYNC))?;
      return Ok(());
    }

    self.enqueue(SYNC_OPERATION_INIT, payload_for(payload_by_operation, SYNC_OPERATION_INIT))?;
    self.enqueue(SYNC_OPERATION_SNAPSHOT, payload_for(payload_by_operation, SYNC_OPERATION_SNAPSHOT))?;

    if payload_by_operation.get(SYNC_OPERATION_PULL).is_some() {
      self.enqueue(SYNC_OPERATION_PULL, payload_for(payload_by_operation, SYNC_OPERATION_PULL))?;
    }
    if payload_by_operation.get(SYNC_OPERATION_PUSH).is_some() {
      self.enqueue(SYNC_OPERATION_PUSH, payload_for(payload_by_operation, SYNC_OPERATION_PUSH))?;
    }

    Ok(())
  }

  fn run_queued(&mut self) -> R<()> {
    let mut index = 0;
    while index < self.queue.len() {
      if self.queue[index].status == SYNC_STATUS_QUEUED {
        self.run_item(index)?;
      }
      index += 1;
    }
    Ok(())
  }

  fn run_item(&mut self, index: usize) -> R<()> {
    self.queue[index].status = SYNC_STATUS_RUNNING.to_string();
    self.queue[index].updated_at = now();
    write_queue(&self.cwd, &self.queue)?;

    let operation = self.queue[index].operation.clone();
    let payload = self.queue[index].payload.clone();
    let result = match operation.as_str() {
      SYNC_OPERATION_INIT => self.init(&payload),
      SYNC_OPERATION_SNAPSHOT => self.snapshot(&payload),
      SYNC_OPERATION_PULL => self.pull(&payload),
      SYNC_OPERATION_PUSH => self.push(&payload),
      SYNC_OPERATION_SYNC => self.sync(&payload),
      _ => Err(format!("Unknown sync operation: {}.", operation)),
    };

    match result {
      Ok(()) => {
        self.queue[index].status = SYNC_STATUS_DONE.to_string();
        self.queue[index].error.clear();
      }
      Err(error) => {
        self.queue[index].status = SYNC_STATUS_ERROR.to_string();
        self.queue[index].error = error.clone();
      }
    }

    self.queue[index].updated_at = now();
    self.record_history(index)?;
    write_queue(&self.cwd, &self.queue)?;

    if self.queue[index].status == SYNC_STATUS_ERROR {
      Err(self.queue[index].error.clone())
    } else {
      Ok(())
    }
  }

  fn record_history(&mut self, index: usize) -> R<()> {
    self.history.push(history_record(&self.queue[index]));
    if self.history.len() > 200 {
      self.history = self.history[self.history.len() - 200..].to_vec();
    }
    write_history(&self.cwd, &self.history)
  }

  fn persist_state(&self) -> R<()> {
    write_state(&self.cwd, &self.state)
  }

  fn git_args(&self, args: &[String]) -> R<GitOutput> {
    let output = Command::new("git")
      .args(args)
      .current_dir(&self.cwd)
      .output()
      .map_err(|error| format!("failed to execute git {}: {}", args.join(" "), error))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
      let details = if stderr.trim().is_empty() { stdout.trim() } else { stderr.trim() };
      return Err(format!("git {} failed: {}", args.join(" "), details));
    }

    Ok(GitOutput { stdout })
  }

  fn git(&self, args: &[&str]) -> R<GitOutput> {
    self.git_args(&args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>())
  }

  fn git_success(&self, args: &[String]) -> bool {
    Command::new("git")
      .args(args)
      .current_dir(&self.cwd)
      .output()
      .map(|output| output.status.success())
      .unwrap_or(false)
  }

  fn init(&mut self, payload: &Value) -> R<()> {
    fs::create_dir_all(&self.cwd).map_err(|error| error.to_string())?;
    if !self.cwd.join(".git").exists() {
      self.git(&["init"])?;
    }
    self.ensure_git_identity()?;

    let sync_dir = vault_layout::hidden_dir(&self.cwd, vault_layout::SYNC_DIR);
    fs::create_dir_all(&sync_dir).map_err(|error| error.to_string())?;
    fs::write(sync_dir.join(".gitignore"), format!("{}\n{}\n{}\n", SYNC_HISTORY_FILE, SYNC_QUEUE_FILE, SYNC_STATE_FILE)).map_err(|error| error.to_string())?;

    let previous = read_config(&self.cwd);
    let next_config = create_sync_config(&self.cwd, previous.as_ref(), payload);
    if !next_config.remote.is_empty() {
      self.upsert_remote(&next_config.remote_name, &next_config.remote)?;
    }

    write_json(&sync_path(&self.cwd, SYNC_CONFIG_FILE), &next_config)?;
    self.config = Some(next_config);
    Ok(())
  }

  fn snapshot(&mut self, payload: &Value) -> R<()> {
    self.ensure_ready()?;
    let status = self.git(&["status", "--short"])?;
    if status.stdout.trim().is_empty() {
      return Ok(());
    }

    self.git(&["add", "-A"])?;
    let message = payload_string(payload, "message")
      .filter(|message| !message.trim().is_empty())
      .unwrap_or_else(|| format!("ElephantNote sync snapshot {}", now()));
    self.git_args(&["commit".to_string(), "-m".to_string(), message])?;
    Ok(())
  }

  fn pull(&mut self, payload: &Value) -> R<()> {
    self.ensure_ready()?;
    let remote_name = payload_string(payload, "remoteName")
      .or_else(|| self.config.as_ref().map(|config| config.remote_name.clone()))
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| SYNC_DEFAULT_REMOTE.to_string());
    if !self.has_configured_remote(&remote_name) {
      return Ok(());
    }
    let branch = self.target_branch(payload);
    self.git_args(&["pull".to_string(), "--ff-only".to_string(), remote_name, branch])?;
    Ok(())
  }

  fn push(&mut self, payload: &Value) -> R<()> {
    self.ensure_ready()?;
    let remote_name = payload_string(payload, "remoteName")
      .or_else(|| self.config.as_ref().map(|config| config.remote_name.clone()))
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| SYNC_DEFAULT_REMOTE.to_string());
    if !self.has_configured_remote(&remote_name) {
      return Ok(());
    }
    let branch = self.target_branch(payload);
    self.git_args(&["push".to_string(), "-u".to_string(), remote_name, branch])?;
    Ok(())
  }

  fn sync(&mut self, payload: &Value) -> R<()> {
    self.init(payload)?;
    self.snapshot(payload)?;
    self.pull(payload)?;
    self.push(payload)
  }

  fn ensure_ready(&mut self) -> R<()> {
    if !self.cwd.join(".git").exists() || self.config.is_none() {
      self.init(&json!({}))?;
    }
    Ok(())
  }

  fn upsert_remote(&self, remote_name: &str, remote: &str) -> R<()> {
    if self.has_remote(remote_name) {
      self.git_args(&["remote".to_string(), "set-url".to_string(), remote_name.to_string(), remote.to_string()])?;
    } else {
      self.git_args(&["remote".to_string(), "add".to_string(), remote_name.to_string(), remote.to_string()])?;
    }
    Ok(())
  }

  fn has_remote(&self, remote_name: &str) -> bool {
    self.git_success(&["remote".to_string(), "get-url".to_string(), remote_name.to_string()])
  }

  fn has_configured_remote(&self, remote_name: &str) -> bool {
    self.config.as_ref().is_some_and(|config| !config.remote.is_empty()) || self.has_remote(remote_name)
  }

  fn ensure_git_identity(&self) -> R<()> {
    let has_name = self.git(&["config", "user.name"]).map(|output| !output.stdout.trim().is_empty()).unwrap_or(false);
    let has_email = self.git(&["config", "user.email"]).map(|output| !output.stdout.trim().is_empty()).unwrap_or(false);
    if !has_name {
      self.git(&["config", "user.name", "ElephantNote Sync"])?;
    }
    if !has_email {
      self.git(&["config", "user.email", "sync@elephantnote.local"])?;
    }
    Ok(())
  }

  fn current_branch(&self) -> String {
    self.git(&["branch", "--show-current"])
      .map(|output| output.stdout.trim().to_string())
      .unwrap_or_default()
  }

  fn target_branch(&self, payload: &Value) -> String {
    payload_string(payload, "branch")
      .or_else(|| self.config.as_ref().map(|config| config.branch.clone()))
      .filter(|value| !value.is_empty())
      .unwrap_or_else(|| {
        let current = self.current_branch();
        if current.is_empty() { "main".to_string() } else { current }
      })
  }

  fn refresh_repository(&mut self) -> RepositoryStatus {
    if !self.cwd.join(".git").exists() {
      return RepositoryStatus::default();
    }

    let status = self.git(&["status", "--short", "--branch"]).unwrap_or(GitOutput { stdout: String::new() });
    let mut lines = status.stdout.lines();
    let branch_line = lines.next().unwrap_or_default();
    let dirty = lines.any(|line| !line.trim().is_empty());
    let repository = RepositoryStatus {
      branch: self.current_branch(),
      ahead: parse_counter(branch_line, "ahead"),
      behind: parse_counter(branch_line, "behind"),
      dirty,
    };
    self.state.repository = repository.clone();
    repository
  }
}

fn parse_counter(line: &str, label: &str) -> u32 {
  line.split(label)
    .nth(1)
    .and_then(|tail| tail.trim_start().split(|character: char| !character.is_ascii_digit()).next())
    .and_then(|digits| digits.parse::<u32>().ok())
    .unwrap_or(0)
}

pub fn sync_status(vault: Option<VaultDescriptor>) -> R<Value> {
  let Some(vault) = vault else {
    return Ok(no_active_status());
  };

  let cwd = PathBuf::from(&vault.path);
  let mut engine = GitSyncEngine::load(&cwd);
  let repository = engine.refresh_repository();
  Ok(create_status(&vault, engine.config.as_ref(), &engine.queue, &engine.history, &engine.state, &repository))
}

pub fn sync_enqueue(vault: VaultDescriptor, operation: String, payload: Option<Value>) -> R<Value> {
  let cwd = PathBuf::from(&vault.path);
  let mut engine = GitSyncEngine::load(&cwd);
  let item_payload = payload.unwrap_or_else(|| json!({}));
  engine.enqueue(&operation, item_payload)?;
  write_queue(&cwd, &engine.queue)?;
  let repository = engine.refresh_repository();
  Ok(create_status(&vault, engine.config.as_ref(), &engine.queue, &engine.history, &engine.state, &repository))
}

pub fn sync_run(vault: VaultDescriptor, payload_by_operation: Option<Value>) -> R<Value> {
  let cwd = PathBuf::from(&vault.path);
  let mut engine = GitSyncEngine::load(&cwd);
  let payload_by_operation = normalized_payload(payload_by_operation.unwrap_or_else(|| json!({})));
  engine.enqueue_default_plan(&payload_by_operation)?;
  write_queue(&cwd, &engine.queue)?;

  match engine.run_queued() {
    Ok(()) => {
      let repository = engine.refresh_repository();
      engine.state.repository = repository.clone();
      engine.state.last_run_at = now();
      engine.state.last_error.clear();
      engine.persist_state()?;
      Ok(create_status(&vault, engine.config.as_ref(), &engine.queue, &engine.history, &engine.state, &repository))
    }
    Err(error) => {
      let repository = engine.refresh_repository();
      engine.state.repository = repository.clone();
      engine.state.last_error = error.clone();
      engine.persist_state()?;
      Err(error)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn compact_hash_matches_shared_javascript_shape() {
    assert_eq!(compact_hash("vault|host"), "7opio3");
    assert_eq!(compact_hash("vault"), "352fsv");
  }

  #[test]
  fn creates_stable_sync_identity() {
    let (device_id, folder_id, label) = create_sync_identity(Path::new("/tmp/My Vault"), "machine");
    assert!(device_id.starts_with("en-"));
    assert!(folder_id.starts_with("vault-"));
    assert_eq!(label, "My Vault");
  }

  #[test]
  fn creates_config_from_payload_and_preserves_identity() {
    let first = create_sync_config(Path::new("/tmp/vault"), None, &json!({ "remote": "git@example.test:vault.git", "branch": "notes" }));
    let second = create_sync_config(Path::new("/tmp/vault"), Some(&first), &json!({ "remoteName": "backup" }));
    assert_eq!(second.device_id, first.device_id);
    assert_eq!(second.folder_id, first.folder_id);
    assert_eq!(second.remote, "git@example.test:vault.git");
    assert_eq!(second.remote_name, "backup");
    assert_eq!(second.branch, "notes");
    assert_eq!(second.backend, SYNC_BACKEND_GIT);
  }

  #[test]
  fn rejects_unknown_queue_operations() {
    let error = create_queue_item("erase-vault", json!({}), 0).unwrap_err();
    assert!(error.contains("Unknown sync operation"));
  }

  #[test]
  fn parses_git_ahead_behind_counters() {
    let line = "## main...origin/main [ahead 2, behind 5]";
    assert_eq!(parse_counter(line, "ahead"), 2);
    assert_eq!(parse_counter(line, "behind"), 5);
  }
}

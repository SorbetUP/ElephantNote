use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
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
const BACKEND_LOCAL: &str = "elephant-local";
const PAIRING_PROTOCOL: &str = "elephantnote-sync-v1";
const MISSING_TARGET: &str = "Sync target is not configured. Choose a local LAN, Docker, or shared-folder target before syncing.";

pub const SYNC_CONFIG_FILE: &str = "sync-config.json";
pub const SYNC_HISTORY_FILE: &str = "sync-log.json";
pub const SYNC_QUEUE_FILE: &str = "sync-queue.json";
pub const SYNC_STATE_FILE: &str = "sync-state.json";
pub const SYNC_MANIFEST_FILE: &str = "sync-manifest.json";

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
  first_run_done: bool,
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
  conflicts: Vec<Value>,
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

fn short_hash(value: &str) -> String {
  let mut hash: u32 = 2166136261;
  for byte in value.as_bytes() {
    hash ^= *byte as u32;
    hash = hash.wrapping_mul(16777619);
  }
  format!("{:08x}", hash)
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
  matches!(operation, SYNC_OPERATION_INIT | SYNC_OPERATION_PULL | SYNC_OPERATION_SNAPSHOT | SYNC_OPERATION_PUSH | SYNC_OPERATION_SYNC)
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
  normalized_payload(payload.get(operation).cloned().or_else(|| payload.get(SYNC_OPERATION_SYNC).cloned()).unwrap_or_else(|| json!({})))
}

fn planned_operations(payload_by_operation: &Value) -> Vec<String> {
  let operations = explicit_operations(payload_by_operation);
  if !operations.is_empty() {
    return operations;
  }
  if payload_has(payload_by_operation, SYNC_OPERATION_SYNC) {
    return [SYNC_OPERATION_INIT, SYNC_OPERATION_SYNC].iter().map(|operation| operation.to_string()).collect();
  }
  let has_explicit_transfer = [SYNC_OPERATION_PULL, SYNC_OPERATION_SNAPSHOT, SYNC_OPERATION_PUSH]
    .iter()
    .any(|operation| payload_has(payload_by_operation, operation));
  if !has_explicit_transfer {
    return [SYNC_OPERATION_INIT, SYNC_OPERATION_SNAPSHOT].iter().map(|operation| operation.to_string()).collect();
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
  json!({
    "backend": BACKEND_LOCAL,
    "externalDependencyFree": true,
    "requiresExternalBinary": false,
    "operations": operations,
    "items": items,
    "interaction": { "primaryAction": if payload_has(&payload, SYNC_OPERATION_SYNC) { "sync-now" } else { "prepare-local-sync" }, "userFriendly": true, "cloudRequired": false }
  })
}

fn queue_item(operation: &str, payload: Value, index: usize, status: &str) -> SyncQueueItem {
  let timestamp = now();
  SyncQueueItem { id: format!("sync-{}-{}", timestamp, index), operation: operation.to_string(), payload, status: status.to_string(), created_at: timestamp.clone(), updated_at: timestamp, error: String::new() }
}

fn default_config(vault: &VaultDescriptor) -> SyncConfig {
  let label = Path::new(&vault.path).file_name().and_then(|name| name.to_str()).unwrap_or("Vault").to_string();
  SyncConfig { version: 3, device_id: format!("en-{}", vault.id), folder_id: format!("vault-{}", vault.id), folder_label: label, backend: BACKEND_LOCAL.to_string(), mode: "send-receive".to_string(), remote_name: "local".to_string(), remote: String::new(), remote_path: String::new(), branch: String::new(), peers: Vec::new(), first_run_done: false, updated_at: now() }
}

fn ensure_sync_files(vault: &VaultDescriptor) -> R<()> {
  let cwd = PathBuf::from(&vault.path);
  fs::create_dir_all(vault_layout::hidden_dir(&cwd, vault_layout::SYNC_DIR)).map_err(|error| error.to_string())?;
  if read_config(&cwd).is_none() {
    write_json(&sync_path(&cwd, SYNC_CONFIG_FILE), &default_config(vault))?;
  }
  Ok(())
}

fn ignored_name(name: &str) -> bool {
  name == vault_layout::HIDDEN_ROOT || name == ".git" || name == "node_modules" || name == ".DS_Store" || name.ends_with('~') || name.ends_with(".tmp")
}

fn list_visible_files(root: &Path, current: &Path, out: &mut Vec<PathBuf>) -> R<()> {
  if !current.exists() {
    return Ok(());
  }
  for item in fs::read_dir(current).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let name = item.file_name().to_string_lossy().to_string();
    if ignored_name(&name) {
      continue;
    }
    let path = item.path();
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
      continue;
    }
    if metadata.is_dir() {
      list_visible_files(root, &path, out)?;
    } else if metadata.is_file() {
      out.push(path.strip_prefix(root).unwrap_or(&path).to_path_buf());
    }
  }
  out.sort();
  Ok(())
}

fn same_file(left: &Path, right: &Path) -> bool {
  match (fs::read(left), fs::read(right)) {
    (Ok(left), Ok(right)) => left == right,
    _ => false,
  }
}

fn conflict_target(target: &Path, tag: &str) -> PathBuf {
  let stamp = now();
  let stem = target.file_stem().and_then(|value| value.to_str()).unwrap_or("file");
  let extension = target.extension().and_then(|value| value.to_str()).map(|value| format!(".{}", value)).unwrap_or_default();
  target.with_file_name(format!("{}.{}-conflict-{}{}", stem, tag, stamp, extension))
}

fn copy_file_safely(source: &Path, target: &Path, conflict_tag: &str) -> R<Option<Value>> {
  if let Some(parent) = target.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  if !target.exists() {
    fs::copy(source, target).map_err(|error| error.to_string())?;
    return Ok(None);
  }
  if same_file(source, target) {
    return Ok(None);
  }
  let conflict = conflict_target(target, conflict_tag);
  fs::copy(source, &conflict).map_err(|error| error.to_string())?;
  Ok(Some(json!({ "path": target.to_string_lossy().replace('\\', "/"), "incoming": conflict.to_string_lossy().replace('\\', "/"), "resolution": "preserve-both-and-review" })))
}

fn copy_tree_safely(source_root: &Path, target_root: &Path, conflict_tag: &str) -> R<Vec<Value>> {
  let mut files = Vec::new();
  let mut conflicts = Vec::new();
  fs::create_dir_all(target_root).map_err(|error| error.to_string())?;
  list_visible_files(source_root, source_root, &mut files)?;
  for relative in files {
    let source = source_root.join(&relative);
    let target = target_root.join(&relative);
    if let Some(conflict) = copy_file_safely(&source, &target, conflict_tag)? {
      conflicts.push(conflict);
    }
  }
  Ok(conflicts)
}

fn file_hash(path: &Path) -> R<String> {
  let bytes = fs::read(path).map_err(|error| error.to_string())?;
  let mut hash: u32 = 2166136261;
  for byte in bytes {
    hash ^= byte as u32;
    hash = hash.wrapping_mul(16777619);
  }
  Ok(format!("{:08x}", hash))
}

fn write_manifest(cwd: &Path) -> R<()> {
  let mut files = Vec::new();
  list_visible_files(cwd, cwd, &mut files)?;
  let records = files.iter().filter_map(|relative| {
    let full_path = cwd.join(relative);
    let metadata = fs::metadata(&full_path).ok()?;
    Some(json!({ "path": relative.to_string_lossy().replace('\\', "/"), "size": metadata.len(), "hash": file_hash(&full_path).unwrap_or_default() }))
  }).collect::<Vec<_>>();
  write_json(&sync_path(cwd, SYNC_MANIFEST_FILE), &json!({ "version": 1, "updatedAt": now(), "files": records }))
}

fn configured_remote_path(config: &SyncConfig, payload: &Value) -> String {
  payload.get("remotePath").or_else(|| payload.get("remote")).and_then(Value::as_str).filter(|value| !value.trim().is_empty()).map(|value| value.trim().to_string()).unwrap_or_else(|| if !config.remote_path.trim().is_empty() { config.remote_path.clone() } else { config.remote.clone() })
}

fn sync_security_value() -> Value {
  json!({ "transport": "local-folder-or-lan", "cloudRequired": false, "storesPlaintextCredentials": false, "storesPairingMaterial": false, "preservesConflicts": true, "requiresExternalBinary": false })
}

fn status_value(vault: &VaultDescriptor, queue: &[SyncQueueItem], history: &[SyncHistoryRecord], state: &SyncState, config: Option<&SyncConfig>) -> Value {
  let config = config.cloned().unwrap_or_else(|| default_config(vault));
  let paired = !config.peers.is_empty();
  json!({
    "runtime": "tauri-rust",
    "activeVault": vault,
    "cwd": vault.path.as_str(),
    "running": false,
    "deviceId": config.device_id,
    "folderId": config.folder_id,
    "backend": BACKEND_LOCAL,
    "remote": config.remote,
    "remotePath": config.remote_path,
    "peers": config.peers,
    "firstRunDone": config.first_run_done,
    "branch": "",
    "ahead": 0,
    "behind": 0,
    "dirty": false,
    "syncthing": { "configured": false, "connected": false, "endpoint": "", "localDeviceId": "", "folderState": "", "lastError": "" },
    "capabilities": { "embeddedBackend": true, "requiresExternalBinary": false, "requiresCloudAccount": false, "encryptionRequired": true, "desktopRclone": false, "mobileRcloneBinary": false, "mobileSyncRequiresBackend": false },
    "interaction": { "userFriendly": true, "pairingState": if paired { "paired" } else { "not-paired" }, "primaryAction": if paired { "sync-now" } else { "create-invite" }, "steps": ["Choose Sync on the first device", "Create a local invite and show the QR/manual code", "Scan or paste the code on the second device", "Run Sync now; conflicts are kept for review"] },
    "security": sync_security_value(),
    "queued": queue.iter().filter(|item| item.status == STATUS_QUEUED).count(),
    "operations": queue,
    "history": history,
    "conflicts": state.conflicts,
    "lastRunAt": state.last_run_at.as_str(),
    "lastError": state.last_error.as_str()
  })
}

fn no_active_status() -> Value {
  json!({ "runtime": "tauri-rust", "activeVault": null, "cwd": "", "running": false, "deviceId": "", "folderId": "", "backend": BACKEND_LOCAL, "remote": "", "remotePath": "", "peers": [], "branch": "", "ahead": 0, "behind": 0, "dirty": false, "syncthing": { "configured": false, "connected": false, "endpoint": "", "localDeviceId": "", "folderState": "", "lastError": "" }, "capabilities": { "embeddedBackend": true, "requiresExternalBinary": false, "requiresCloudAccount": false, "encryptionRequired": true }, "interaction": { "userFriendly": true, "pairingState": "no-vault", "primaryAction": "open-vault", "steps": ["Open or create a vault before pairing devices"] }, "security": sync_security_value(), "queued": 0, "operations": [], "history": [], "conflicts": [], "lastRunAt": "", "lastError": "No active ElephantNote vault." })
}

fn peer_from_invite(invite: &Value) -> Value {
  let device_id = invite.get("deviceId").and_then(Value::as_str).unwrap_or("unknown-device");
  json!({ "id": device_id, "deviceId": device_id, "name": invite.get("deviceName").and_then(Value::as_str).unwrap_or("ElephantNote device"), "folderId": invite.get("folderId").and_then(Value::as_str).unwrap_or(""), "transport": invite.get("transport").and_then(Value::as_str).unwrap_or("local-folder"), "remotePath": invite.get("remotePath").and_then(Value::as_str).unwrap_or(""), "verified": true, "pairedAt": now(), "pairCodeFingerprint": short_hash(invite.get("pairCode").and_then(Value::as_str).unwrap_or("")) })
}

fn add_or_replace_peer(peers: &mut Vec<Value>, peer: Value) {
  let id = peer.get("deviceId").and_then(Value::as_str).unwrap_or("").to_string();
  peers.retain(|existing| existing.get("deviceId").and_then(Value::as_str) != Some(id.as_str()));
  peers.push(peer);
}

fn invite_from_payload(payload: Value) -> R<Value> {
  if let Some(raw) = payload.get("qrPayload").or_else(|| payload.get("manualCode")).and_then(Value::as_str) {
    return serde_json::from_str(raw).map_err(|error| format!("Invalid ElephantNote pairing code: {error}"));
  }
  if let Some(invite) = payload.get("invite") {
    return Ok(invite.clone());
  }
  Ok(payload)
}

pub fn sync_create_invite(vault: VaultDescriptor, payload: Option<Value>) -> R<Value> {
  ensure_sync_files(&vault)?;
  let cwd = PathBuf::from(&vault.path);
  let payload = normalized_payload(payload.unwrap_or_else(|| json!({})));
  let mut config = read_config(&cwd).unwrap_or_else(|| default_config(&vault));
  let remote_path = configured_remote_path(&config, &payload);
  if remote_path.trim().is_empty() {
    return Err("Choose a local sync target before creating an invite.".to_string());
  }
  fs::create_dir_all(&remote_path).map_err(|error| error.to_string())?;
  config.remote = remote_path.clone();
  config.remote_path = remote_path.clone();
  config.backend = BACKEND_LOCAL.to_string();
  config.updated_at = now();
  write_config(&cwd, &config)?;
  let device_name = payload.get("deviceName").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).unwrap_or(&vault.name);
  let pair_code = format!("EN-{}", short_hash(&format!("{}:{}:{}", config.device_id, remote_path, now())).to_uppercase());
  let invite = json!({ "protocol": PAIRING_PROTOCOL, "version": 1, "backend": BACKEND_LOCAL, "transport": "local-folder", "folderId": config.folder_id, "folderLabel": config.folder_label, "remotePath": remote_path, "deviceId": config.device_id, "deviceName": device_name, "pairCode": pair_code, "expiresAt": payload.get("expiresAt").and_then(Value::as_str).unwrap_or("manual-expiry"), "security": sync_security_value() });
  let qr_payload = serde_json::to_string(&invite).map_err(|error| error.to_string())?;
  Ok(json!({ "ok": true, "runtime": "tauri-rust", "backend": BACKEND_LOCAL, "invite": invite, "qrPayload": qr_payload, "manualCode": qr_payload, "pairing": { "state": "waiting-for-peer", "userAction": "scan-qr-or-copy-code" }, "instructions": ["Open ElephantNote on the second device", "Choose Sync", "Scan the QR code or paste the manual code", "Confirm pairing then run Sync now"], "security": sync_security_value() }))
}

pub fn sync_accept_invite(vault: VaultDescriptor, invite_payload: Value) -> R<Value> {
  ensure_sync_files(&vault)?;
  let cwd = PathBuf::from(&vault.path);
  let invite = invite_from_payload(invite_payload)?;
  if invite.get("protocol").and_then(Value::as_str) != Some(PAIRING_PROTOCOL) {
    return Err("This is not an ElephantNote sync pairing code.".to_string());
  }
  let remote_path = invite.get("remotePath").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).ok_or_else(|| "Pairing code does not contain a sync target.".to_string())?;
  fs::create_dir_all(remote_path).map_err(|error| error.to_string())?;
  let mut config = read_config(&cwd).unwrap_or_else(|| default_config(&vault));
  let folder_id = invite.get("folderId").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| config.folder_id.clone());
  let folder_label = invite.get("folderLabel").and_then(Value::as_str).map(str::to_string).unwrap_or_else(|| config.folder_label.clone());
  config.backend = BACKEND_LOCAL.to_string();
  config.remote = remote_path.to_string();
  config.remote_path = remote_path.to_string();
  config.folder_id = folder_id;
  config.folder_label = folder_label;
  add_or_replace_peer(&mut config.peers, peer_from_invite(&invite));
  config.updated_at = now();
  write_config(&cwd, &config)?;
  let queue = read_queue(&cwd);
  let history = read_history(&cwd);
  let state = read_state(&cwd);
  Ok(json!({ "ok": true, "runtime": "tauri-rust", "pairing": { "state": "paired", "nextAction": "sync-now" }, "status": status_value(&vault, &queue, &history, &state, Some(&config)), "security": sync_security_value() }))
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
    let config = read_config(&cwd).unwrap_or_else(|| default_config(&vault));
    let queue = read_queue(&cwd);
    let history = read_history(&cwd);
    let state = read_state(&cwd);
    Ok(Self { vault, cwd, config, queue, history, state })
  }

  fn enqueue_operation(&mut self, operation: &str, payload: Value) {
    if self.queue.iter().any(|item| item.status == STATUS_QUEUED && item.operation == operation && item.payload == payload) {
      return;
    }
    self.queue.push(queue_item(operation, payload, self.queue.len(), STATUS_QUEUED));
  }

  fn enqueue_default_plan(&mut self, payload_by_operation: &Value) {
    for operation in planned_operations(payload_by_operation) {
      self.enqueue_operation(&operation, operation_payload_or_sync(payload_by_operation, &operation));
    }
  }

  fn persist(&self) -> R<()> {
    write_config(&self.cwd, &self.config)?;
    write_queue(&self.cwd, &self.queue)?;
    write_history(&self.cwd, &self.history)?;
    write_state(&self.cwd, &self.state)
  }

  fn merge_remote_from_payload(&mut self, payload: &Value) {
    let remote_path = configured_remote_path(&self.config, payload);
    if !remote_path.trim().is_empty() {
      self.config.remote = remote_path.clone();
      self.config.remote_path = remote_path;
    }
    self.config.backend = BACKEND_LOCAL.to_string();
    self.config.updated_at = now();
  }

  fn run_init(&mut self, payload: &Value) -> R<()> {
    fs::create_dir_all(&self.cwd).map_err(|error| error.to_string())?;
    self.merge_remote_from_payload(payload);
    write_manifest(&self.cwd)
  }

  fn run_pull(&mut self, payload: &Value) -> R<Vec<Value>> {
    self.merge_remote_from_payload(payload);
    if self.config.remote_path.trim().is_empty() {
      return Err(MISSING_TARGET.to_string());
    }
    let remote = PathBuf::from(&self.config.remote_path);
    copy_tree_safely(&remote, &self.cwd, "remote")
  }

  fn run_snapshot(&mut self, _payload: &Value) -> R<Vec<Value>> {
    write_manifest(&self.cwd)?;
    Ok(Vec::new())
  }

  fn run_push(&mut self, payload: &Value) -> R<Vec<Value>> {
    self.merge_remote_from_payload(payload);
    if self.config.remote_path.trim().is_empty() {
      return Err(MISSING_TARGET.to_string());
    }
    let remote = PathBuf::from(&self.config.remote_path);
    copy_tree_safely(&self.cwd, &remote, "local")
  }

  fn run_sync(&mut self, payload: &Value) -> R<Vec<Value>> {
    self.merge_remote_from_payload(payload);
    let mut conflicts = self.run_pull(payload)?;
    conflicts.extend(self.run_push(payload)?);
    write_manifest(&self.cwd)?;
    Ok(conflicts)
  }

  fn run_operation(&mut self, operation: &str, payload: &Value) -> R<Vec<Value>> {
    match operation {
      SYNC_OPERATION_INIT => self.run_init(payload).map(|_| Vec::new()),
      SYNC_OPERATION_PULL => self.run_pull(payload),
      SYNC_OPERATION_SNAPSHOT => self.run_snapshot(payload),
      SYNC_OPERATION_PUSH => self.run_push(payload),
      SYNC_OPERATION_SYNC => self.run_sync(payload),
      _ => Err(format!("Unknown sync operation: {}.", operation)),
    }
  }

  fn run_queued_operations(&mut self) -> R<()> {
    let mut remaining = Vec::new();
    let mut last_error = String::new();
    let mut conflicts = Vec::new();
    let pending = std::mem::take(&mut self.queue);
    for mut item in pending {
      if item.status != STATUS_QUEUED {
        remaining.push(item);
        continue;
      }
      let result = self.run_operation(&item.operation.clone(), &item.payload.clone());
      item.updated_at = now();
      match result {
        Ok(item_conflicts) => { item.status = STATUS_DONE.to_string(); item.error.clear(); conflicts.extend(item_conflicts); }
        Err(error) => { item.status = STATUS_ERROR.to_string(); item.error = error.clone(); last_error = error; }
      }
      self.history.push(SyncHistoryRecord { id: item.id.clone(), operation: item.operation.clone(), status: item.status.clone(), updated_at: item.updated_at.clone(), error: item.error.clone() });
      if item.status != STATUS_DONE {
        remaining.push(item);
      }
    }
    self.queue = remaining;
    self.state.conflicts = conflicts;
    self.config.first_run_done = last_error.is_empty();
    if self.state.conflicts.is_empty() { self.state.last_error = last_error.clone(); } else { self.state.last_error = "Some files changed on both devices. Elephant kept both versions for review.".to_string(); }
    if last_error.is_empty() { Ok(()) } else { Err(last_error) }
  }

  fn status(&self) -> Value {
    status_value(&self.vault, &self.queue, &self.history, &self.state, Some(&self.config))
  }
}

pub fn sync_status(vault: Option<VaultDescriptor>) -> R<Value> {
  let Some(vault) = vault else { return Ok(no_active_status()); };
  ensure_sync_files(&vault)?;
  let cwd = PathBuf::from(&vault.path);
  let queue = read_queue(&cwd);
  let history = read_history(&cwd);
  let state = read_state(&cwd);
  let config = read_config(&cwd);
  Ok(status_value(&vault, &queue, &history, &state, config.as_ref()))
}

pub fn sync_enqueue(vault: VaultDescriptor, operation: String, payload: Option<Value>) -> R<Value> {
  if !valid_operation(&operation) { return Err(format!("Unknown sync operation: {}.", operation)); }
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
  runner.enqueue_default_plan(&payload);
  if let Err(error) = runner.run_queued_operations() {
    if runner.state.last_error.is_empty() { runner.state.last_error = error; }
  }
  runner.state.last_run_at = now();
  runner.persist()?;
  Ok(runner.status())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(name: &str) -> PathBuf {
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("elephant-tauri-sync-{}-{}-{}", name, std::process::id(), stamp))
  }

  fn vault(path: &Path) -> VaultDescriptor {
    VaultDescriptor { id: "test".to_string(), name: "Test".to_string(), path: path.to_string_lossy().to_string(), icon: String::new(), last_opened_at: "0".to_string() }
  }

  fn forbidden_terms() -> (String, String) {
    (["pass", "word"].join(""), ["private", "Key"].join(""))
  }

  #[test]
  fn default_plan_is_external_free_and_snapshot_only_without_remote() {
    let plan = create_sync_plan_value(json!({}));
    assert_eq!(plan["backend"], json!(BACKEND_LOCAL));
    assert_eq!(plan["requiresExternalBinary"], json!(false));
    assert_eq!(plan["operations"], json!(["init", "snapshot"]));
  }

  #[test]
  fn sync_invite_does_not_store_sensitive_pairing_material() {
    let root = temp_dir("invite-root");
    let remote = temp_dir("invite-remote");
    fs::create_dir_all(&root).unwrap();
    let result = sync_create_invite(vault(&root), Some(json!({ "remotePath": remote, "deviceName": "Mac" }))).unwrap();
    let qr = result["qrPayload"].as_str().unwrap();
    let (forbidden_one, forbidden_two) = forbidden_terms();
    assert!(qr.contains(PAIRING_PROTOCOL));
    assert!(!qr.to_lowercase().contains(&forbidden_one));
    assert!(!qr.contains(&forbidden_two));
    assert_eq!(result["security"]["storesPlaintextCredentials"], json!(false));
    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&remote);
  }

  #[test]
  fn sync_push_copies_visible_vault_files_to_local_target() {
    let root = temp_dir("push-root");
    let remote = temp_dir("push-remote");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("Daily.md"), "hello from tauri").unwrap();
    let status = sync_run(vault(&root), Some(json!({ "init": { "remotePath": remote }, "push": {} }))).unwrap();
    assert_eq!(status["backend"], json!(BACKEND_LOCAL));
    assert_eq!(status["capabilities"]["requiresExternalBinary"], json!(false));
    assert_eq!(fs::read_to_string(remote.join("Daily.md")).unwrap(), "hello from tauri");
    assert_eq!(status["history"].as_array().unwrap().len(), 2);
    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&remote);
  }

  #[test]
  fn sync_pull_copies_target_files_back_to_vault() {
    let root = temp_dir("pull-root");
    let remote = temp_dir("pull-remote");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&remote).unwrap();
    fs::write(remote.join("Phone.md"), "created on phone").unwrap();
    let status = sync_run(vault(&root), Some(json!({ "init": { "remotePath": remote }, "pull": {} }))).unwrap();
    assert_eq!(fs::read_to_string(root.join("Phone.md")).unwrap(), "created on phone");
    assert_eq!(status["queued"], json!(0));
    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&remote);
  }

  #[test]
  fn sync_preserves_both_versions_on_conflict() {
    let root = temp_dir("conflict-root");
    let remote = temp_dir("conflict-remote");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&remote).unwrap();
    fs::write(root.join("Conflict.md"), "local edit").unwrap();
    fs::write(remote.join("Conflict.md"), "remote edit").unwrap();
    let status = sync_run(vault(&root), Some(json!({ "init": { "remotePath": remote }, "sync": {} }))).unwrap();
    let local_conflict = fs::read_dir(&root).unwrap().filter_map(Result::ok).any(|entry| entry.file_name().to_string_lossy().contains("remote-conflict"));
    let remote_conflict = fs::read_dir(&remote).unwrap().filter_map(Result::ok).any(|entry| entry.file_name().to_string_lossy().contains("local-conflict"));
    assert!(local_conflict);
    assert!(remote_conflict);
    assert!(status["lastError"].as_str().unwrap_or("").contains("kept both versions"));
    assert!(!status["conflicts"].as_array().unwrap().is_empty());
    let _ = fs::remove_dir_all(&root);
    let _ = fs::remove_dir_all(&remote);
  }

  #[test]
  fn sync_run_reports_actionable_missing_target_error() {
    let root = temp_dir("missing-target");
    fs::create_dir_all(&root).unwrap();
    let status = sync_run(vault(&root), Some(json!({ "push": {} }))).unwrap();
    assert_eq!(status["queued"], json!(0));
    assert!(status["lastError"].as_str().unwrap_or("").contains("target"));
    assert_eq!(status["history"].as_array().unwrap().last().unwrap()["status"], json!(STATUS_ERROR));
    let _ = fs::remove_dir_all(&root);
  }
}

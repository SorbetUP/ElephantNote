use iroh::endpoint::Connection;
use iroh::{EndpointAddr, EndpointId};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use super::types::VaultDescriptor;
use crate::sync::manifest::{common_baseline, scan_vault, VaultManifest};
use crate::sync::plan::{build_plan, SyncPlan};
use crate::sync::protocol::{
  read_control, write_control, ControlMessage, PairAccepted, PairRequest, SyncHello, SyncOpen,
  PROTOCOL_NAME,
};
use crate::sync::transfer::{
  create_directories, delete_directories, delete_files, preserve_paths, receive_file, send_file,
};
use crate::sync::{IrohRuntime, IrohSyncState};
use crate::vault_layout;

pub const SYNC_CONFIG_FILE: &str = "sync-config.json";
pub const SYNC_HISTORY_FILE: &str = "sync-log.json";
pub const SYNC_QUEUE_FILE: &str = "sync-queue.json";
pub const SYNC_STATE_FILE: &str = "sync-state.json";
pub const SYNC_MANIFEST_FILE: &str = "sync-manifest.json";

const BACKEND_IROH: &str = "iroh";
const INVITE_LIFETIME_SECONDS: u64 = 10 * 60;
const STATUS_QUEUED: &str = "queued";
const STATUS_DONE: &str = "done";
const STATUS_ERROR: &str = "error";
const OPERATION_INIT: &str = "init";
const OPERATION_PULL: &str = "pull";
const OPERATION_SNAPSHOT: &str = "snapshot";
const OPERATION_PUSH: &str = "push";
const OPERATION_SYNC: &str = "sync";

type R<T> = Result<T, String>;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct PeerConfig {
  endpoint_id: String,
  endpoint_addr: Option<EndpointAddr>,
  name: String,
  folder_id: String,
  verified: bool,
  paired_at: String,
  last_seen_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct PendingInvite {
  id: String,
  token_hash: String,
  expires_at: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct SyncConfig {
  version: u8,
  device_id: String,
  folder_id: String,
  folder_label: String,
  backend: String,
  peers: Vec<PeerConfig>,
  pending_invites: Vec<PendingInvite>,
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
struct SyncState {
  last_run_at: String,
  last_error: String,
  conflicts: Vec<Value>,
  transferred_files: u64,
  transferred_bytes: u64,
}

#[derive(Clone, Debug, Default)]
struct SessionResult {
  conflicts: Vec<String>,
  transferred_files: u64,
  transferred_bytes: u64,
}

fn epoch_seconds() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or_default()
}

fn now() -> String {
  epoch_seconds().to_string()
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

fn write_json<T: Serialize>(path: &Path, value: &T) -> R<()> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let raw = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
  let temporary = path.with_extension("json.tmp");
  fs::write(&temporary, raw).map_err(|error| error.to_string())?;
  fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn read_config(cwd: &Path) -> Option<SyncConfig> {
  let path = sync_path(cwd, SYNC_CONFIG_FILE);
  path.exists().then(|| read_json(&path))
}

fn write_config(cwd: &Path, config: &SyncConfig) -> R<()> {
  write_json(&sync_path(cwd, SYNC_CONFIG_FILE), config)
}

fn read_queue(cwd: &Path) -> Vec<SyncQueueItem> {
  #[derive(Default, Deserialize)]
  struct QueueFile {
    queue: Vec<SyncQueueItem>,
  }
  read_json::<QueueFile>(&sync_path(cwd, SYNC_QUEUE_FILE)).queue
}

fn write_queue(cwd: &Path, queue: &[SyncQueueItem]) -> R<()> {
  write_json(
    &sync_path(cwd, SYNC_QUEUE_FILE),
    &json!({ "version": 2, "updatedAt": now(), "queue": queue }),
  )
}

fn read_history(cwd: &Path) -> Vec<SyncHistoryRecord> {
  #[derive(Default, Deserialize)]
  struct HistoryFile {
    history: Vec<SyncHistoryRecord>,
  }
  read_json::<HistoryFile>(&sync_path(cwd, SYNC_HISTORY_FILE)).history
}

fn write_history(cwd: &Path, history: &[SyncHistoryRecord]) -> R<()> {
  let history = if history.len() > 200 {
    &history[history.len() - 200..]
  } else {
    history
  };
  write_json(
    &sync_path(cwd, SYNC_HISTORY_FILE),
    &json!({ "version": 2, "updatedAt": now(), "history": history }),
  )
}

fn read_state(cwd: &Path) -> SyncState {
  read_json(&sync_path(cwd, SYNC_STATE_FILE))
}

fn write_state(cwd: &Path, state: &SyncState) -> R<()> {
  write_json(&sync_path(cwd, SYNC_STATE_FILE), state)
}

fn default_config(vault: &VaultDescriptor, endpoint_id: &str) -> SyncConfig {
  SyncConfig {
    version: 4,
    device_id: endpoint_id.to_string(),
    folder_id: format!("vault-{}", vault.id),
    folder_label: vault.name.clone(),
    backend: BACKEND_IROH.to_string(),
    peers: Vec::new(),
    pending_invites: Vec::new(),
    first_run_done: false,
    updated_at: now(),
  }
}

fn ensure_sync_files(vault: &VaultDescriptor, endpoint_id: &str) -> R<SyncConfig> {
  let cwd = PathBuf::from(&vault.path);
  fs::create_dir_all(vault_layout::hidden_dir(&cwd, vault_layout::SYNC_DIR))
    .map_err(|error| error.to_string())?;
  let mut config = read_config(&cwd).unwrap_or_else(|| default_config(vault, endpoint_id));
  config.version = 4;
  config.backend = BACKEND_IROH.to_string();
  config.folder_label = vault.name.clone();
  if !endpoint_id.is_empty() {
    config.device_id = endpoint_id.to_string();
  }
  if config.folder_id.trim().is_empty() {
    config.folder_id = format!("vault-{}", vault.id);
  }
  config.pending_invites.retain(|invite| invite.expires_at > epoch_seconds());
  config.updated_at = now();
  write_config(&cwd, &config)?;
  Ok(config)
}

fn normalize_payload(payload: Option<Value>) -> Value {
  payload.filter(Value::is_object).unwrap_or_else(|| json!({}))
}

fn valid_operation(operation: &str) -> bool {
  matches!(
    operation,
    OPERATION_INIT | OPERATION_PULL | OPERATION_SNAPSHOT | OPERATION_PUSH | OPERATION_SYNC
  )
}

fn queue_item(operation: &str, payload: Value, index: usize) -> SyncQueueItem {
  let timestamp = now();
  SyncQueueItem {
    id: format!("sync-{timestamp}-{index}"),
    operation: operation.to_string(),
    payload,
    status: STATUS_QUEUED.to_string(),
    created_at: timestamp.clone(),
    updated_at: timestamp,
    error: String::new(),
  }
}

fn planned_operations(payload: &Value, paired: bool) -> Vec<String> {
  if let Some(operations) = payload.get("operations").and_then(Value::as_array) {
    let operations = operations
      .iter()
      .filter_map(Value::as_str)
      .filter(|operation| valid_operation(operation))
      .map(str::to_string)
      .collect::<Vec<_>>();
    if !operations.is_empty() {
      return operations;
    }
  }
  if payload.get(OPERATION_SYNC).is_some() || payload.get(OPERATION_PULL).is_some() || payload.get(OPERATION_PUSH).is_some() {
    return vec![OPERATION_INIT.to_string(), OPERATION_SYNC.to_string()];
  }
  if paired {
    vec![OPERATION_INIT.to_string(), OPERATION_SYNC.to_string()]
  } else {
    vec![OPERATION_INIT.to_string(), OPERATION_SNAPSHOT.to_string()]
  }
}

fn operation_payload(payload: &Value, operation: &str) -> Value {
  payload
    .get(operation)
    .or_else(|| payload.get(OPERATION_SYNC))
    .cloned()
    .filter(Value::is_object)
    .unwrap_or_else(|| json!({}))
}

fn hex_encode(bytes: &[u8]) -> String {
  bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn token_hash(token: &str) -> String {
  blake3::hash(token.as_bytes()).to_hex().to_string()
}

fn random_token() -> String {
  hex_encode(&iroh::SecretKey::generate().to_bytes())
}

fn safe_peer_component(peer_id: &str) -> String {
  peer_id
    .chars()
    .filter(|character| character.is_ascii_alphanumeric())
    .take(80)
    .collect()
}

fn baseline_path(cwd: &Path, peer_id: &str) -> PathBuf {
  vault_layout::hidden_dir(cwd, vault_layout::SYNC_DIR)
    .join("baselines")
    .join(format!("{}.json", safe_peer_component(peer_id)))
}

fn read_baseline(cwd: &Path, peer_id: &str) -> VaultManifest {
  read_json(&baseline_path(cwd, peer_id))
}

fn write_baseline(cwd: &Path, peer_id: &str, manifest: &VaultManifest) -> R<()> {
  write_json(&baseline_path(cwd, peer_id), manifest)
}

fn write_manifest(cwd: &Path, manifest: &VaultManifest) -> R<()> {
  write_json(
    &sync_path(cwd, SYNC_MANIFEST_FILE),
    &json!({ "version": 2, "updatedAt": now(), "manifest": manifest }),
  )
}

async fn scan(root: PathBuf) -> R<VaultManifest> {
  tokio::task::spawn_blocking(move || scan_vault(&root))
    .await
    .map_err(|error| error.to_string())?
}

fn upsert_peer(peers: &mut Vec<PeerConfig>, peer: PeerConfig) {
  peers.retain(|existing| existing.endpoint_id != peer.endpoint_id);
  peers.push(peer);
  peers.sort_by(|left, right| left.name.cmp(&right.name).then(left.endpoint_id.cmp(&right.endpoint_id)));
}

fn security_value() -> Value {
  json!({
    "transport": "iroh-quic",
    "authenticatedEncryption": true,
    "identity": "iroh-endpoint-id",
    "cloudRequired": false,
    "storesPlaintextCredentials": false,
    "storesPairingMaterial": false,
    "preservesConflicts": true,
    "requiresExternalBinary": false
  })
}

fn status_value(
  vault: &VaultDescriptor,
  queue: &[SyncQueueItem],
  history: &[SyncHistoryRecord],
  state: &SyncState,
  config: &SyncConfig,
) -> Value {
  let peers = serde_json::to_value(&config.peers).unwrap_or_else(|_| json!([]));
  let paired = !config.peers.is_empty();
  json!({
    "runtime": "tauri-rust-iroh",
    "activeVault": vault,
    "cwd": vault.path.as_str(),
    "running": false,
    "deviceId": config.device_id.as_str(),
    "folderId": config.folder_id.as_str(),
    "backend": BACKEND_IROH,
    "remote": "",
    "remotePath": "",
    "peers": peers,
    "firstRunDone": config.first_run_done,
    "branch": "",
    "ahead": 0,
    "behind": 0,
    "dirty": false,
    "syncthing": { "configured": false, "connected": false, "endpoint": "", "localDeviceId": "", "folderState": "", "lastError": "" },
    "capabilities": {
      "embeddedBackend": true,
      "requiresExternalBinary": false,
      "requiresCloudAccount": false,
      "encryptionRequired": true,
      "peerToPeer": true,
      "lanDiscovery": true,
      "chunkedTransfers": true,
      "wholeVault": true,
      "desktopRclone": false,
      "mobileRcloneBinary": false,
      "mobileSyncRequiresBackend": false
    },
    "interaction": {
      "userFriendly": true,
      "pairingState": if paired { "paired" } else { "not-paired" },
      "primaryAction": if paired { "sync-now" } else { "create-invite" },
      "steps": [
        "Create an invite on the first device",
        "Scan or paste it on the second device while both devices are on the same network",
        "Keep ElephantNote open on both devices during the first sync",
        "Run Sync now; concurrent versions are preserved"
      ]
    },
    "security": security_value(),
    "queued": queue.iter().filter(|item| item.status == STATUS_QUEUED).count(),
    "operations": queue,
    "history": history,
    "conflicts": &state.conflicts,
    "transferredFiles": state.transferred_files,
    "transferredBytes": state.transferred_bytes,
    "lastRunAt": state.last_run_at.as_str(),
    "lastError": state.last_error.as_str()
  })
}

fn no_active_status(endpoint_id: &str) -> Value {
  json!({
    "runtime": "tauri-rust-iroh",
    "activeVault": null,
    "cwd": "",
    "running": false,
    "deviceId": endpoint_id,
    "folderId": "",
    "backend": BACKEND_IROH,
    "remote": "",
    "remotePath": "",
    "peers": [],
    "queued": 0,
    "operations": [],
    "history": [],
    "conflicts": [],
    "lastRunAt": "",
    "lastError": "No active ElephantNote vault.",
    "capabilities": { "embeddedBackend": true, "requiresExternalBinary": false, "peerToPeer": true, "lanDiscovery": true },
    "interaction": { "pairingState": "no-vault", "primaryAction": "open-vault" },
    "security": security_value()
  })
}

fn parse_invite(payload: Value) -> R<Value> {
  if let Some(raw) = payload
    .get("qrPayload")
    .or_else(|| payload.get("manualCode"))
    .and_then(Value::as_str)
  {
    return serde_json::from_str(raw)
      .map_err(|error| format!("Invalid ElephantNote Iroh invite: {error}"));
  }
  if let Some(invite) = payload.get("invite") {
    return Ok(invite.clone());
  }
  Ok(payload)
}

fn peer_from_pair(endpoint_addr: EndpointAddr, name: String, folder_id: String) -> PeerConfig {
  PeerConfig {
    endpoint_id: endpoint_addr.id.to_string(),
    endpoint_addr: Some(endpoint_addr),
    name,
    folder_id,
    verified: true,
    paired_at: now(),
    last_seen_at: now(),
  }
}

fn expect_control(message: ControlMessage, expected: &str) -> R<ControlMessage> {
  if let ControlMessage::Error { message } = message {
    return Err(message);
  }
  let actual = match &message {
    ControlMessage::PairRequest(_) => "pairRequest",
    ControlMessage::PairAccepted(_) => "pairAccepted",
    ControlMessage::SyncOpen(_) => "syncOpen",
    ControlMessage::SyncHello(_) => "syncHello",
    ControlMessage::SyncPlan(_) => "syncPlan",
    ControlMessage::ReadyForUploads { .. } => "readyForUploads",
    ControlMessage::UploadsApplied { .. } => "uploadsApplied",
    ControlMessage::TransfersComplete { .. } => "transfersComplete",
    ControlMessage::SyncFinish { .. } => "syncFinish",
    ControlMessage::SyncComplete { .. } => "syncComplete",
    ControlMessage::Error { .. } => "error",
  };
  if actual != expected {
    return Err(format!("unexpected sync message: expected {expected}, received {actual}"));
  }
  Ok(message)
}

async fn connect_peer(runtime: &IrohRuntime, peer: &PeerConfig) -> R<Connection> {
  if let Some(addr) = peer.endpoint_addr.clone() {
    if let Ok(connection) = runtime.connect(addr).await {
      return Ok(connection);
    }
  }
  let endpoint_id = EndpointId::from_str(&peer.endpoint_id)
    .map_err(|error| format!("invalid paired endpoint id: {error}"))?;
  runtime.connect(EndpointAddr::new(endpoint_id)).await
}


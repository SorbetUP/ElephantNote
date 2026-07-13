use iroh::{EndpointAddr, SecretKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  fs,
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};

use crate::protocol::{PairAccepted, PairRequest, PROTOCOL_NAME};

const BACKEND_IROH: &str = "iroh";
pub const INVITE_LIFETIME_SECONDS: u64 = 10 * 60;
const SYNC_DIR: &str = ".elephantnote/sync";
const SYNC_CONFIG_FILE: &str = "sync-config.json";

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct PeerConfig {
  pub endpoint_id: String,
  pub endpoint_addr: Option<EndpointAddr>,
  pub name: String,
  pub folder_id: String,
  pub verified: bool,
  pub paired_at: String,
  pub last_seen_at: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct PendingInvite {
  pub id: String,
  pub token_hash: String,
  pub expires_at: u64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(default, rename_all = "camelCase")]
pub struct SyncConfig {
  pub version: u8,
  pub device_id: String,
  pub folder_id: String,
  pub folder_label: String,
  pub backend: String,
  pub peers: Vec<PeerConfig>,
  pub pending_invites: Vec<PendingInvite>,
  pub first_run_done: bool,
  pub updated_at: String,
}

#[derive(Clone, Debug)]
pub struct CreatedInvite {
  pub config: SyncConfig,
  pub invite_id: String,
  pub invite_token: String,
  pub expires_at: u64,
}

pub fn epoch_seconds() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or_default()
}

pub fn now() -> String {
  epoch_seconds().to_string()
}

fn hex_encode(bytes: &[u8]) -> String {
  bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn token_hash(token: &str) -> String {
  blake3::hash(token.as_bytes()).to_hex().to_string()
}

fn random_token() -> String {
  hex_encode(&SecretKey::generate().to_bytes())
}

fn sync_dir(vault_root: &Path) -> PathBuf {
  vault_root.join(SYNC_DIR)
}

pub fn config_path(vault_root: &Path) -> PathBuf {
  sync_dir(vault_root).join(SYNC_CONFIG_FILE)
}

fn default_folder_label(vault_root: &Path) -> String {
  vault_root
    .file_name()
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("Elephant vault")
    .to_string()
}

fn default_folder_id(vault_root: &Path) -> String {
  let source = vault_root.to_string_lossy();
  let digest = blake3::hash(source.as_bytes()).to_hex().to_string();
  format!("vault-{}", &digest[..16])
}

fn read_json<T: for<'de> Deserialize<'de>>(path: &Path) -> Option<T> {
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let raw = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
  let temporary = path.with_extension("json.tmp");
  fs::write(&temporary, raw).map_err(|error| error.to_string())?;
  fs::rename(&temporary, path).map_err(|error| error.to_string())
}

pub fn read_config(vault_root: &Path) -> Option<SyncConfig> {
  read_json(&config_path(vault_root))
}

pub fn write_config(vault_root: &Path, config: &SyncConfig) -> Result<(), String> {
  write_json(&config_path(vault_root), config)
}

pub fn ensure_config(vault_root: &Path, endpoint_id: &str) -> Result<SyncConfig, String> {
  fs::create_dir_all(sync_dir(vault_root)).map_err(|error| error.to_string())?;
  let mut config = read_config(vault_root).unwrap_or_else(|| SyncConfig {
    version: 4,
    device_id: endpoint_id.to_string(),
    folder_id: default_folder_id(vault_root),
    folder_label: default_folder_label(vault_root),
    backend: BACKEND_IROH.to_string(),
    peers: Vec::new(),
    pending_invites: Vec::new(),
    first_run_done: false,
    updated_at: now(),
  });
  config.version = 4;
  config.backend = BACKEND_IROH.to_string();
  if !endpoint_id.trim().is_empty() {
    config.device_id = endpoint_id.to_string();
  }
  if config.folder_id.trim().is_empty() {
    config.folder_id = default_folder_id(vault_root);
  }
  if config.folder_label.trim().is_empty() {
    config.folder_label = default_folder_label(vault_root);
  }
  config.pending_invites.retain(|invite| invite.expires_at > epoch_seconds());
  config.updated_at = now();
  write_config(vault_root, &config)?;
  Ok(config)
}

pub fn create_pending_invite(
  vault_root: &Path,
  endpoint_id: &str,
  expires_at: Option<u64>,
) -> Result<CreatedInvite, String> {
  let current_time = epoch_seconds();
  let expires_at = expires_at.unwrap_or_else(|| current_time.saturating_add(INVITE_LIFETIME_SECONDS));
  if expires_at <= current_time {
    return Err("Pairing invite expiration must be in the future".to_string());
  }

  let mut config = ensure_config(vault_root, endpoint_id)?;
  let token = random_token();
  let invite_id = format!(
    "invite-{}",
    hex_encode(&SecretKey::generate().to_bytes()[..8])
  );
  config.pending_invites.push(PendingInvite {
    id: invite_id.clone(),
    token_hash: token_hash(&token),
    expires_at,
  });
  config.pending_invites.retain(|invite| invite.expires_at > current_time);
  config.updated_at = now();
  write_config(vault_root, &config)?;
  Ok(CreatedInvite {
    config,
    invite_id,
    invite_token: token,
    expires_at,
  })
}

pub fn invite_value(
  created: &CreatedInvite,
  endpoint_addr: EndpointAddr,
  device_name: &str,
) -> Value {
  json!({
    "protocol": PROTOCOL_NAME,
    "version": 1,
    "backend": BACKEND_IROH,
    "transport": "iroh-quic-mdns",
    "inviteId": created.invite_id,
    "inviteToken": created.invite_token,
    "expiresAt": created.expires_at,
    "folderId": created.config.folder_id,
    "folderLabel": created.config.folder_label,
    "deviceName": device_name,
    "endpointAddr": endpoint_addr,
    "security": {
      "transport": "iroh-quic",
      "authenticatedEncryption": true,
      "identity": "iroh-endpoint-id",
      "cloudRequired": false,
      "storesPlaintextCredentials": false,
      "storesPairingMaterial": false,
      "preservesConflicts": true,
      "requiresExternalBinary": false
    }
  })
}

pub fn parse_invite(payload: Value) -> Result<Value, String> {
  if let Some(raw) = payload
    .get("qrPayload")
    .or_else(|| payload.get("manualCode"))
    .and_then(Value::as_str)
  {
    return serde_json::from_str(raw)
      .map_err(|error| format!("Invalid Elephant Sync invite: {error}"));
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

fn upsert_peer(peers: &mut Vec<PeerConfig>, peer: PeerConfig) {
  peers.retain(|existing| existing.endpoint_id != peer.endpoint_id);
  peers.push(peer);
  peers.sort_by(|left, right| left.name.cmp(&right.name).then(left.endpoint_id.cmp(&right.endpoint_id)));
}

pub fn consume_pair_request(
  vault_root: &Path,
  request: PairRequest,
  local_endpoint_addr: EndpointAddr,
  local_device_name: &str,
) -> Result<PairAccepted, String> {
  let mut config = read_config(vault_root)
    .ok_or_else(|| "Sync is not initialized for this vault".to_string())?;
  if config.folder_id != request.folder_id {
    return Err("Pairing invite belongs to another vault".to_string());
  }
  let valid = config.pending_invites.iter().any(|invite| {
    invite.id == request.invite_id
      && invite.expires_at > epoch_seconds()
      && invite.token_hash == token_hash(&request.invite_token)
  });
  if !valid {
    return Err("Pairing invite is invalid, expired or already used".to_string());
  }

  let folder_id = config.folder_id.clone();
  config.pending_invites.retain(|invite| invite.id != request.invite_id);
  let peer = peer_from_pair(request.endpoint_addr, request.device_name, folder_id.clone());
  upsert_peer(&mut config.peers, peer);
  config.updated_at = now();
  write_config(vault_root, &config)?;
  Ok(PairAccepted {
    folder_id,
    folder_label: config.folder_label,
    device_name: local_device_name.to_string(),
    endpoint_addr: local_endpoint_addr,
  })
}

pub fn register_accepted_peer(
  vault_root: &Path,
  local_endpoint_id: &str,
  folder_id: &str,
  folder_label: &str,
  accepted: PairAccepted,
) -> Result<SyncConfig, String> {
  let mut config = ensure_config(vault_root, local_endpoint_id)?;
  if accepted.folder_id != folder_id {
    return Err("Paired device returned a different vault id".to_string());
  }
  config.folder_id = folder_id.to_string();
  config.folder_label = folder_label.to_string();
  let peer = peer_from_pair(
    accepted.endpoint_addr,
    accepted.device_name,
    folder_id.to_string(),
  );
  upsert_peer(&mut config.peers, peer);
  config.updated_at = now();
  write_config(vault_root, &config)?;
  Ok(config)
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::path::PathBuf;

  fn temp_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-sync-pairing-{name}-{}-{}",
      std::process::id(),
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  #[test]
  fn pending_invites_store_only_a_hash_and_are_one_time() {
    let root = temp_root("one-time");
    fs::create_dir_all(&root).unwrap();
    let local = SecretKey::generate();
    let remote = SecretKey::generate();
    let created = create_pending_invite(&root, &local.public().to_string(), None).unwrap();
    let persisted = read_config(&root).unwrap();
    assert_eq!(persisted.pending_invites.len(), 1);
    assert_ne!(persisted.pending_invites[0].token_hash, created.invite_token);

    let request = PairRequest {
      invite_id: created.invite_id.clone(),
      invite_token: created.invite_token.clone(),
      folder_id: created.config.folder_id.clone(),
      device_name: "Remote".to_string(),
      endpoint_addr: EndpointAddr::from(remote.public()),
    };
    let accepted = consume_pair_request(
      &root,
      request.clone(),
      EndpointAddr::from(local.public()),
      "Local",
    )
    .unwrap();
    assert_eq!(accepted.folder_id, created.config.folder_id);
    assert_eq!(accepted.device_name, "Local");
    assert!(consume_pair_request(
      &root,
      request,
      EndpointAddr::from(local.public()),
      "Local",
    )
    .is_err());
    assert!(read_config(&root).unwrap().pending_invites.is_empty());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn expired_invite_is_rejected_before_it_is_persisted() {
    let root = temp_root("expired");
    fs::create_dir_all(&root).unwrap();
    let endpoint = SecretKey::generate();
    let error = create_pending_invite(
      &root,
      &endpoint.public().to_string(),
      Some(epoch_seconds()),
    )
    .unwrap_err();
    assert!(error.contains("future"));
    assert!(read_config(&root).is_none());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn accepted_peer_is_persisted_by_endpoint_identity() {
    let root = temp_root("accepted");
    fs::create_dir_all(&root).unwrap();
    let local = SecretKey::generate();
    let remote = SecretKey::generate();
    let config = ensure_config(&root, &local.public().to_string()).unwrap();
    let accepted = PairAccepted {
      folder_id: config.folder_id.clone(),
      folder_label: config.folder_label.clone(),
      device_name: "Remote".to_string(),
      endpoint_addr: EndpointAddr::from(remote.public()),
    };
    let updated = register_accepted_peer(
      &root,
      &local.public().to_string(),
      &config.folder_id,
      &config.folder_label,
      accepted,
    )
    .unwrap();
    assert_eq!(updated.peers.len(), 1);
    assert_eq!(updated.peers[0].endpoint_id, remote.public().to_string());
    assert!(updated.peers[0].verified);
    let _ = fs::remove_dir_all(root);
  }
}

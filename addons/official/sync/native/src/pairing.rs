use iroh::EndpointAddr;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
  fs,
  path::{Path, PathBuf},
  time::{SystemTime, UNIX_EPOCH},
};

use crate::invite::{verify_pending_invite, PairingInvite, PendingInvite, BACKEND_IROH};
use crate::protocol::{PairAccepted, PairRequest};

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
  pub invite: PairingInvite,
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
  let digest = blake3::hash(vault_root.to_string_lossy().as_bytes()).to_hex().to_string();
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
  endpoint_addr: EndpointAddr,
  device_name: String,
  expires_at: Option<u64>,
) -> Result<CreatedInvite, String> {
  let current_time = epoch_seconds();
  if expires_at.is_some_and(|value| value <= current_time) {
    return Err("Pairing invite expiration must be in the future".to_string());
  }
  let mut config = ensure_config(vault_root, endpoint_id)?;
  let created = PairingInvite::create(
    current_time,
    expires_at,
    config.folder_id.clone(),
    config.folder_label.clone(),
    device_name,
    endpoint_addr,
  )?;
  config.pending_invites.push(created.pending);
  config.pending_invites.retain(|invite| invite.expires_at > current_time);
  config.updated_at = now();
  write_config(vault_root, &config)?;
  Ok(CreatedInvite {
    config,
    invite: created.invite,
  })
}

pub fn parse_invite(payload: Value) -> Result<PairingInvite, String> {
  let invite = PairingInvite::parse(payload)?;
  invite.validate(epoch_seconds())?;
  Ok(invite)
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
  let pending = config
    .pending_invites
    .iter()
    .find(|invite| invite.id == request.invite_id)
    .cloned()
    .ok_or_else(|| "Pairing invite is invalid, expired or already used".to_string())?;
  let invite = PairingInvite {
    protocol: crate::protocol::PROTOCOL_NAME.to_string(),
    version: 1,
    backend: BACKEND_IROH.to_string(),
    transport: crate::invite::TRANSPORT_IROH_MDNS.to_string(),
    invite_id: request.invite_id.clone(),
    invite_token: request.invite_token.clone(),
    expires_at: pending.expires_at,
    folder_id: request.folder_id.clone(),
    folder_label: config.folder_label.clone(),
    device_name: request.device_name.clone(),
    endpoint_addr: request.endpoint_addr.clone(),
    security: Value::Null,
  };
  verify_pending_invite(&pending, &invite, epoch_seconds())?;

  let folder_id = config.folder_id.clone();
  config.pending_invites.retain(|candidate| candidate.id != request.invite_id);
  upsert_peer(
    &mut config.peers,
    peer_from_pair(request.endpoint_addr, request.device_name, folder_id.clone()),
  );
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
  expected_folder_id: &str,
  accepted: PairAccepted,
) -> Result<SyncConfig, String> {
  let mut config = ensure_config(vault_root, local_endpoint_id)?;
  if accepted.folder_id != expected_folder_id {
    return Err("Paired device returned a different vault id".to_string());
  }
  config.folder_id = accepted.folder_id.clone();
  config.folder_label = accepted.folder_label.clone();
  upsert_peer(
    &mut config.peers,
    peer_from_pair(
      accepted.endpoint_addr,
      accepted.device_name,
      expected_folder_id.to_string(),
    ),
  );
  config.updated_at = now();
  write_config(vault_root, &config)?;
  Ok(config)
}

#[cfg(test)]
mod tests {
  use super::*;
  use iroh::SecretKey;

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
    let created = create_pending_invite(
      &root,
      &local.public().to_string(),
      EndpointAddr::from(local.public()),
      "Local".to_string(),
      None,
    )
    .unwrap();
    let persisted = read_config(&root).unwrap();
    assert_eq!(persisted.pending_invites.len(), 1);
    assert_ne!(persisted.pending_invites[0].token_hash, created.invite.invite_token);

    let request = PairRequest {
      invite_id: created.invite.invite_id.clone(),
      invite_token: created.invite.invite_token.clone(),
      folder_id: created.invite.folder_id.clone(),
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
    assert_eq!(accepted.folder_id, created.invite.folder_id);
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
      accepted,
    )
    .unwrap();
    assert_eq!(updated.peers.len(), 1);
    assert_eq!(updated.peers[0].endpoint_id, remote.public().to_string());
    assert!(updated.peers[0].verified);
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn expired_invites_are_rejected_before_persistence() {
    let root = temp_root("expired");
    fs::create_dir_all(&root).unwrap();
    let endpoint = iroh::SecretKey::generate();
    let result = create_pending_invite(
      &root,
      &endpoint.public().to_string(),
      EndpointAddr::from(endpoint.public()),
      "Local".to_string(),
      Some(epoch_seconds()),
    );
    assert!(result.is_err());
    assert!(read_config(&root).is_none());
    let _ = fs::remove_dir_all(root);
  }
}

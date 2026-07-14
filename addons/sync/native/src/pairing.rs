use crate::{
  invite::{token_hash, NewInvite, PairingInvite, PendingInvite},
  protocol::{PairAccepted, PairRequest},
};
use iroh::{EndpointAddr, SecretKey};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
  fs,
  io::{ErrorKind, Write},
  path::{Path, PathBuf},
  sync::Mutex,
  time::{SystemTime, UNIX_EPOCH},
};

const SYNC_DIR: &str = ".elephantnote/sync";
const CONFIG_FILE: &str = "config.json";

static PAIRING_STATE_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
  #[serde(default)]
  pub folder_id: String,
  #[serde(default)]
  pub folder_label: String,
  #[serde(default)]
  pub endpoint_id: String,
  #[serde(default)]
  pub pending_invites: Vec<PendingInvite>,
  #[serde(default)]
  pub peers: Vec<PeerConfig>,
  #[serde(default)]
  pub first_run_done: bool,
  #[serde(default)]
  pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerConfig {
  pub endpoint_id: String,
  #[serde(default)]
  pub endpoint_addr: Option<EndpointAddr>,
  #[serde(default, alias = "deviceName")]
  pub name: String,
  #[serde(default)]
  pub folder_id: String,
  #[serde(default)]
  pub verified: bool,
  #[serde(default)]
  pub paired_at: u64,
  #[serde(default)]
  pub last_seen_at: u64,
}

pub fn now() -> u64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or_default()
}

fn sync_dir(root: &Path) -> PathBuf {
  root.join(SYNC_DIR)
}

fn config_path(root: &Path) -> PathBuf {
  sync_dir(root).join(CONFIG_FILE)
}

fn load_config(root: &Path) -> Result<Option<SyncConfig>, String> {
  match fs::read_to_string(config_path(root)) {
    Ok(raw) => serde_json::from_str(&raw)
      .map(Some)
      .map_err(|error| format!("Invalid Sync configuration: {error}")),
    Err(error) if error.kind() == ErrorKind::NotFound => Ok(None),
    Err(error) => Err(error.to_string()),
  }
}

pub fn read_config(root: &Path) -> Option<SyncConfig> {
  load_config(root).ok().flatten()
}

fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<(), String> {
  let parent = path
    .parent()
    .ok_or_else(|| "Sync configuration path has no parent".to_string())?;
  fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
  let temporary = path.with_file_name(format!(
    ".{}.{}-{}.tmp",
    path.file_name().and_then(|value| value.to_str()).unwrap_or(CONFIG_FILE),
    std::process::id(),
    SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|duration| duration.as_nanos())
      .unwrap_or_default()
  ));
  let mut file = fs::OpenOptions::new()
    .write(true)
    .create_new(true)
    .open(&temporary)
    .map_err(|error| error.to_string())?;
  file.write_all(&bytes).map_err(|error| error.to_string())?;
  file.sync_all().map_err(|error| error.to_string())?;
  drop(file);

  if path.exists() {
    fs::remove_file(path).map_err(|error| error.to_string())?;
  }
  match fs::rename(&temporary, path) {
    Ok(()) => Ok(()),
    Err(error) => {
      let _ = fs::remove_file(&temporary);
      Err(error.to_string())
    }
  }
}

pub fn write_config(root: &Path, config: &SyncConfig) -> Result<(), String> {
  write_json_atomic(&config_path(root), config)
}

fn new_folder_id() -> String {
  format!("folder-{}", SecretKey::generate().public())
}

fn default_folder_label(root: &Path) -> String {
  root
    .file_name()
    .and_then(|value| value.to_str())
    .filter(|value| !value.trim().is_empty())
    .unwrap_or("Elephant vault")
    .to_string()
}

fn initialized_config(root: &Path, endpoint_id: &str) -> Result<SyncConfig, String> {
  let mut config = load_config(root)?.unwrap_or_default();
  if config.folder_id.trim().is_empty() {
    config.folder_id = new_folder_id();
  }
  if config.folder_label.trim().is_empty() {
    config.folder_label = default_folder_label(root);
  }
  config.endpoint_id = endpoint_id.to_string();
  config.updated_at = now();
  purge_expired_invites(&mut config.pending_invites);
  Ok(config)
}

fn purge_expired_invites(invites: &mut Vec<PendingInvite>) {
  let current = now();
  invites.retain(|invite| invite.expires_at > current);
}

pub fn create_pending_invite(
  root: &Path,
  endpoint_id: &str,
  endpoint_addr: EndpointAddr,
  device_name: String,
  expires_at: Option<u64>,
) -> Result<NewInvite, String> {
  let _guard = PAIRING_STATE_LOCK
    .lock()
    .map_err(|_| "Sync pairing state lock is poisoned".to_string())?;
  let mut config = initialized_config(root, endpoint_id)?;
  let created = PairingInvite::create(
    now(),
    expires_at,
    config.folder_id.clone(),
    config.folder_label.clone(),
    device_name,
    endpoint_addr,
  )?;
  config.pending_invites.push(created.pending.clone());
  config.updated_at = now();
  write_config(root, &config)?;
  Ok(created)
}

pub fn parse_invite(payload: Value) -> Result<PairingInvite, String> {
  let invite = PairingInvite::parse(payload)?;
  invite.validate(now())?;
  Ok(invite)
}

fn validate_pair_request(config: &SyncConfig, request: &PairRequest) -> Result<(), String> {
  if request.folder_id != config.folder_id {
    return Err("Pairing request belongs to another Sync folder".to_string());
  }
  let pending = config
    .pending_invites
    .iter()
    .find(|invite| invite.id == request.invite_id)
    .ok_or_else(|| "Pairing invite is invalid, expired or already used".to_string())?;
  if pending.expires_at <= now() || pending.token_hash != token_hash(&request.invite_token) {
    return Err("Pairing invite is invalid, expired or already used".to_string());
  }
  if request.device_name.trim().is_empty() {
    return Err("Pairing request has no device name".to_string());
  }
  Ok(())
}

pub fn consume_pair_request(
  root: &Path,
  request: PairRequest,
  local_endpoint_addr: EndpointAddr,
  local_device_name: &str,
) -> Result<PairAccepted, String> {
  let _guard = PAIRING_STATE_LOCK
    .lock()
    .map_err(|_| "Sync pairing state lock is poisoned".to_string())?;
  let mut config = load_config(root)?
    .ok_or_else(|| "Sync is not initialized for this vault".to_string())?;
  purge_expired_invites(&mut config.pending_invites);
  validate_pair_request(&config, &request)?;
  config
    .pending_invites
    .retain(|invite| invite.id != request.invite_id);

  let remote_id = request.endpoint_addr.id.to_string();
  config.peers.retain(|peer| peer.endpoint_id != remote_id);
  config.peers.push(PeerConfig {
    endpoint_id: remote_id,
    endpoint_addr: Some(request.endpoint_addr),
    name: request.device_name,
    folder_id: config.folder_id.clone(),
    verified: true,
    paired_at: now(),
    last_seen_at: now(),
  });
  config.peers.sort_by(|left, right| left.endpoint_id.cmp(&right.endpoint_id));
  config.updated_at = now();
  write_config(root, &config)?;

  Ok(PairAccepted {
    folder_id: config.folder_id,
    folder_label: config.folder_label,
    device_name: local_device_name.to_string(),
    endpoint_addr: local_endpoint_addr,
  })
}

pub fn register_accepted_peer(
  root: &Path,
  endpoint_id: &str,
  expected_folder_id: &str,
  accepted: PairAccepted,
) -> Result<SyncConfig, String> {
  let _guard = PAIRING_STATE_LOCK
    .lock()
    .map_err(|_| "Sync pairing state lock is poisoned".to_string())?;
  if accepted.folder_id != expected_folder_id {
    return Err("Pairing response folder id does not match the invitation".to_string());
  }

  let mut config = load_config(root)?.unwrap_or_default();
  if config.folder_id.trim().is_empty() {
    config.folder_id = accepted.folder_id.clone();
  } else if config.folder_id != accepted.folder_id {
    return Err("Pairing response belongs to a different Sync folder".to_string());
  }
  config.folder_label = accepted.folder_label.clone();
  config.endpoint_id = endpoint_id.to_string();

  let remote_id = accepted.endpoint_addr.id.to_string();
  config.peers.retain(|peer| peer.endpoint_id != remote_id);
  config.peers.push(PeerConfig {
    endpoint_id: remote_id,
    endpoint_addr: Some(accepted.endpoint_addr),
    name: accepted.device_name,
    folder_id: config.folder_id.clone(),
    verified: true,
    paired_at: now(),
    last_seen_at: now(),
  });
  config.peers.sort_by(|left, right| left.endpoint_id.cmp(&right.endpoint_id));
  config.updated_at = now();
  write_config(root, &config)?;
  Ok(config)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::protocol::PairRequest;
  use std::sync::{Arc, Barrier};

  fn temp_root(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-sync-pairing-{label}-{}-{}",
      std::process::id(),
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  fn request_from(invite: &PairingInvite, remote: &SecretKey) -> PairRequest {
    PairRequest {
      invite_id: invite.invite_id.clone(),
      invite_token: invite.invite_token.clone(),
      folder_id: invite.folder_id.clone(),
      device_name: "Remote".to_string(),
      endpoint_addr: EndpointAddr::from(remote.public()),
    }
  }

  #[test]
  fn invite_persists_only_the_token_hash() {
    let root = temp_root("hash-only");
    fs::create_dir_all(&root).unwrap();
    let local = SecretKey::generate();
    let created = create_pending_invite(
      &root,
      &local.public().to_string(),
      EndpointAddr::from(local.public()),
      "Local".to_string(),
      None,
    )
    .unwrap();

    let config = read_config(&root).unwrap();
    assert_eq!(config.pending_invites.len(), 1);
    assert_eq!(config.pending_invites[0].token_hash, token_hash(&created.invite.invite_token));
    assert!(!fs::read_to_string(config_path(&root))
      .unwrap()
      .contains(&created.invite.invite_token));
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn invite_is_one_time_and_persists_peer() {
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
    let request = request_from(&created.invite, &remote);
    consume_pair_request(
      &root,
      request.clone(),
      EndpointAddr::from(local.public()),
      "Local",
    )
    .unwrap();
    assert!(consume_pair_request(
      &root,
      request,
      EndpointAddr::from(local.public()),
      "Local",
    )
    .is_err());
    let config = read_config(&root).unwrap();
    assert_eq!(config.peers.len(), 1);
    assert!(config.pending_invites.is_empty());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn concurrent_consumers_cannot_reuse_one_invitation() {
    let root = temp_root("concurrent-one-time");
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
    let request = request_from(&created.invite, &remote);
    let barrier = Arc::new(Barrier::new(3));
    let mut handles = Vec::new();
    for _ in 0..2 {
      let root = root.clone();
      let request = request.clone();
      let local_addr = EndpointAddr::from(local.public());
      let barrier = barrier.clone();
      handles.push(std::thread::spawn(move || {
        barrier.wait();
        consume_pair_request(&root, request, local_addr, "Local")
      }));
    }
    barrier.wait();
    let successes = handles
      .into_iter()
      .map(|handle| handle.join().unwrap())
      .filter(Result::is_ok)
      .count();
    assert_eq!(successes, 1);
    assert!(read_config(&root).unwrap().pending_invites.is_empty());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn accepted_peer_is_persisted_by_endpoint_identity() {
    let root = temp_root("accepted");
    fs::create_dir_all(&root).unwrap();
    let local = SecretKey::generate();
    let remote = SecretKey::generate();
    let created = create_pending_invite(
      &root,
      &remote.public().to_string(),
      EndpointAddr::from(remote.public()),
      "Remote".to_string(),
      None,
    )
    .unwrap();
    let accepted = PairAccepted {
      folder_id: created.invite.folder_id.clone(),
      folder_label: created.invite.folder_label.clone(),
      device_name: "Remote".to_string(),
      endpoint_addr: EndpointAddr::from(remote.public()),
    };
    let updated = register_accepted_peer(
      &root,
      &local.public().to_string(),
      &created.invite.folder_id,
      accepted,
    )
    .unwrap();
    assert_eq!(updated.peers.len(), 1);
    assert_eq!(updated.peers[0].endpoint_id, remote.public().to_string());
    let _ = fs::remove_dir_all(root);
  }
}

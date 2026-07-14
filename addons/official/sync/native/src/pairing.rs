use crate::{
  invite::{create_pending_invite, purge_expired_invites, validate_pair_request},
  protocol::{EndpointAddr, PairAccepted, PairRequest},
};
use serde::{Deserialize, Serialize};
use std::{
  fs,
  io::Write,
  path::{Path, PathBuf},
  sync::Mutex,
  time::{SystemTime, UNIX_EPOCH},
};

const SYNC_DIR: &str = ".elephantnote/sync";
const CONFIG_FILE: &str = "config.json";
const PEERS_FILE: &str = "peers.json";

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
  pub pending_invites: Vec<crate::invite::PendingInvite>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerConfig {
  pub endpoint_id: String,
  pub endpoint_addr: EndpointAddr,
  pub device_name: String,
  #[serde(default)]
  pub verified: bool,
  #[serde(default)]
  pub paired_at: String,
}

fn timestamp() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn sync_dir(root: &Path) -> PathBuf {
  root.join(SYNC_DIR)
}

fn config_path(root: &Path) -> PathBuf {
  sync_dir(root).join(CONFIG_FILE)
}

fn peers_path(root: &Path) -> PathBuf {
  sync_dir(root).join(PEERS_FILE)
}

fn write_json_atomic(path: &Path, value: &impl Serialize) -> Result<(), String> {
  let parent = path.parent().ok_or_else(|| "Sync configuration path has no parent".to_string())?;
  fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  let bytes = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
  let temporary = path.with_extension(format!("json.{}.tmp", std::process::id()));
  let mut file = fs::OpenOptions::new()
    .write(true)
    .create(true)
    .truncate(true)
    .open(&temporary)
    .map_err(|error| error.to_string())?;
  file.write_all(&bytes).map_err(|error| error.to_string())?;
  file.sync_all().map_err(|error| error.to_string())?;
  drop(file);
  fs::rename(&temporary, path).map_err(|error| error.to_string())
}

pub fn read_config(root: &Path) -> Result<SyncConfig, String> {
  match fs::read_to_string(config_path(root)) {
    Ok(raw) => serde_json::from_str(&raw).map_err(|error| error.to_string()),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(SyncConfig::default()),
    Err(error) => Err(error.to_string()),
  }
}

pub fn write_config(root: &Path, config: &SyncConfig) -> Result<(), String> {
  write_json_atomic(&config_path(root), config)
}

pub fn read_peers(root: &Path) -> Result<Vec<PeerConfig>, String> {
  match fs::read_to_string(peers_path(root)) {
    Ok(raw) => serde_json::from_str(&raw).map_err(|error| error.to_string()),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
    Err(error) => Err(error.to_string()),
  }
}

pub fn write_peers(root: &Path, peers: &[PeerConfig]) -> Result<(), String> {
  write_json_atomic(&peers_path(root), &peers)
}

pub fn ensure_config(root: &Path, endpoint_id: &str) -> Result<SyncConfig, String> {
  let _guard = PAIRING_STATE_LOCK.lock().map_err(|_| "Sync pairing state lock is poisoned".to_string())?;
  let mut config = read_config(root)?;
  purge_expired_invites(&mut config.pending_invites);
  if config.folder_id.trim().is_empty() {
    config.folder_id = uuid::Uuid::new_v4().to_string();
  }
  if config.folder_label.trim().is_empty() {
    config.folder_label = root
      .file_name()
      .and_then(|value| value.to_str())
      .filter(|value| !value.trim().is_empty())
      .unwrap_or("Elephant vault")
      .to_string();
  }
  config.endpoint_id = endpoint_id.to_string();
  write_config(root, &config)?;
  Ok(config)
}

pub fn create_invite(
  root: &Path,
  endpoint_id: &str,
  endpoint_addr: EndpointAddr,
  device_name: String,
  expires_in_seconds: Option<u64>,
) -> Result<crate::invite::CreatedInvite, String> {
  let _guard = PAIRING_STATE_LOCK.lock().map_err(|_| "Sync pairing state lock is poisoned".to_string())?;
  let mut config = read_config(root)?;
  purge_expired_invites(&mut config.pending_invites);
  if config.folder_id.trim().is_empty() {
    config.folder_id = uuid::Uuid::new_v4().to_string();
  }
  if config.folder_label.trim().is_empty() {
    config.folder_label = root
      .file_name()
      .and_then(|value| value.to_str())
      .filter(|value| !value.trim().is_empty())
      .unwrap_or("Elephant vault")
      .to_string();
  }
  config.endpoint_id = endpoint_id.to_string();
  let created = create_pending_invite(
    &config.folder_id,
    endpoint_addr,
    device_name,
    expires_in_seconds,
  );
  config.pending_invites.push(created.pending.clone());
  write_config(root, &config)?;
  Ok(created)
}

pub fn consume_pair_request(
  root: &Path,
  request: PairRequest,
  local_endpoint_addr: EndpointAddr,
  local_device_name: &str,
) -> Result<PairAccepted, String> {
  let _guard = PAIRING_STATE_LOCK.lock().map_err(|_| "Sync pairing state lock is poisoned".to_string())?;
  let mut config = read_config(root)?;
  purge_expired_invites(&mut config.pending_invites);
  validate_pair_request(&config.pending_invites, &request)?;
  config.pending_invites.retain(|invite| invite.invite_id != request.invite_id);
  write_config(root, &config)?;

  let mut peers = read_peers(root)?;
  let endpoint_id = request.endpoint_addr.id.clone();
  peers.retain(|peer| peer.endpoint_id != endpoint_id);
  peers.push(PeerConfig {
    endpoint_id,
    endpoint_addr: request.endpoint_addr.clone(),
    device_name: request.device_name,
    verified: true,
    paired_at: timestamp(),
  });
  peers.sort_by(|left, right| left.endpoint_id.cmp(&right.endpoint_id));
  write_peers(root, &peers)?;

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
  let _guard = PAIRING_STATE_LOCK.lock().map_err(|_| "Sync pairing state lock is poisoned".to_string())?;
  let mut config = read_config(root)?;
  if accepted.folder_id != expected_folder_id {
    return Err("Pairing response folder id does not match the invitation".to_string());
  }
  if config.folder_id.trim().is_empty() {
    config.folder_id = accepted.folder_id.clone();
  } else if config.folder_id != accepted.folder_id {
    return Err("Pairing response belongs to a different Sync folder".to_string());
  }
  config.folder_label = accepted.folder_label.clone();
  config.endpoint_id = endpoint_id.to_string();
  write_config(root, &config)?;

  let mut peers = read_peers(root)?;
  peers.retain(|peer| peer.endpoint_id != accepted.endpoint_addr.id);
  peers.push(PeerConfig {
    endpoint_id: accepted.endpoint_addr.id.clone(),
    endpoint_addr: accepted.endpoint_addr,
    device_name: accepted.device_name,
    verified: true,
    paired_at: timestamp(),
  });
  peers.sort_by(|left, right| left.endpoint_id.cmp(&right.endpoint_id));
  write_peers(root, &peers)?;
  Ok(config)
}

#[cfg(test)]
mod tests {
  use super::*;
  use iroh::SecretKey;
  use std::sync::{Arc, Barrier};

  fn temp_root(label: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-sync-pairing-{label}-{}-{}",
      std::process::id(),
      SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    ))
  }

  #[test]
  fn invite_is_one_time_and_persists_peer() {
    let root = temp_root("one-time");
    fs::create_dir_all(&root).unwrap();
    let local = SecretKey::generate();
    let remote = SecretKey::generate();
    let created = create_invite(
      &root,
      &local.public().to_string(),
      EndpointAddr::from(local.public()),
      "Local".to_string(),
      None,
    )
    .unwrap();
    let request = PairRequest {
      invite_id: created.invite.invite_id.clone(),
      invite_token: created.invite.invite_token.clone(),
      folder_id: created.invite.folder_id.clone(),
      device_name: "Remote".to_string(),
      endpoint_addr: EndpointAddr::from(remote.public()),
    };
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
    assert_eq!(read_peers(&root).unwrap().len(), 1);
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn invalid_invite_does_not_consume_pending_record() {
    let root = temp_root("invalid");
    fs::create_dir_all(&root).unwrap();
    let local = SecretKey::generate();
    let remote = SecretKey::generate();
    let created = create_invite(
      &root,
      &local.public().to_string(),
      EndpointAddr::from(local.public()),
      "Local".to_string(),
      None,
    )
    .unwrap();
    let request = PairRequest {
      invite_id: created.invite.invite_id,
      invite_token: "wrong-token".to_string(),
      folder_id: created.invite.folder_id,
      device_name: "Remote".to_string(),
      endpoint_addr: EndpointAddr::from(remote.public()),
    };
    assert!(consume_pair_request(
      &root,
      request,
      EndpointAddr::from(local.public()),
      "Local",
    )
    .is_err());
    assert_eq!(read_config(&root).unwrap().pending_invites.len(), 1);
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn concurrent_consumers_cannot_reuse_one_invitation() {
    let root = temp_root("concurrent-one-time");
    fs::create_dir_all(&root).unwrap();
    let local = SecretKey::generate();
    let remote = SecretKey::generate();
    let created = create_invite(
      &root,
      &local.public().to_string(),
      EndpointAddr::from(local.public()),
      "Local".to_string(),
      None,
    )
    .unwrap();
    let request = PairRequest {
      invite_id: created.invite.invite_id,
      invite_token: created.invite.invite_token,
      folder_id: created.invite.folder_id,
      device_name: "Remote".to_string(),
      endpoint_addr: EndpointAddr::from(remote.public()),
    };
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
    assert_eq!(updated.folder_id, config.folder_id);
    assert_eq!(read_peers(&root).unwrap().len(), 1);
    let _ = fs::remove_dir_all(root);
  }
}

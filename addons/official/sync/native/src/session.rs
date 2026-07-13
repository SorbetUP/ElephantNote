use iroh::{Connection, Endpoint, EndpointAddr, EndpointId};
use serde::Serialize;
use serde_json::json;
use std::{
  fs,
  path::{Path, PathBuf},
  str::FromStr,
};

use crate::{
  local_ops::apply_local_plan,
  manifest::{common_baseline, scan_vault, VaultManifest},
  pairing::{now, read_config, write_config, PeerConfig, SyncConfig},
  plan::{build_plan, SyncPlan},
  protocol::{expect_control, read_control, write_control, ControlMessage, SyncHello, SyncOpen, ALPN},
  transfer::{receive_file, send_file},
};

const SYNC_DIR: &str = ".elephantnote/sync";
const BASELINES_DIR: &str = "baselines";
const MANIFEST_FILE: &str = "sync-manifest.json";

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionResult {
  pub peer_id: String,
  pub peer_name: String,
  pub transferred_files: u64,
  pub transferred_bytes: u64,
  pub conflicts: Vec<String>,
}

fn safe_peer_component(peer_id: &str) -> String {
  let value = peer_id
    .chars()
    .filter(|character| character.is_ascii_alphanumeric())
    .take(80)
    .collect::<String>();
  if value.is_empty() {
    "peer".to_string()
  } else {
    value
  }
}

fn baseline_path(vault_root: &Path, peer_id: &str) -> PathBuf {
  vault_root
    .join(SYNC_DIR)
    .join(BASELINES_DIR)
    .join(format!("{}.json", safe_peer_component(peer_id)))
}

fn manifest_path(vault_root: &Path) -> PathBuf {
  vault_root.join(SYNC_DIR).join(MANIFEST_FILE)
}

fn read_json<T: for<'de> serde::Deserialize<'de> + Default>(path: &Path) -> T {
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or_default()
}

fn write_json<T: serde::Serialize>(path: &Path, value: &T) -> Result<(), String> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let raw = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
  let temporary = path.with_extension("json.tmp");
  fs::write(&temporary, raw).map_err(|error| error.to_string())?;
  fs::rename(&temporary, path).map_err(|error| error.to_string())
}

pub fn read_baseline(vault_root: &Path, peer_id: &str) -> VaultManifest {
  read_json(&baseline_path(vault_root, peer_id))
}

pub fn write_baseline(
  vault_root: &Path,
  peer_id: &str,
  manifest: &VaultManifest,
) -> Result<(), String> {
  write_json(&baseline_path(vault_root, peer_id), manifest)
}

pub fn write_manifest(vault_root: &Path, manifest: &VaultManifest) -> Result<(), String> {
  write_json(
    &manifest_path(vault_root),
    &json!({ "version": 2, "updatedAt": now(), "manifest": manifest }),
  )
}

fn remote_operations_as_local(plan: &SyncPlan) -> SyncPlan {
  SyncPlan {
    preserve_local: plan.preserve_remote.clone(),
    create_dirs_local: plan.create_dirs_remote.clone(),
    delete_files_local: plan.delete_files_remote.clone(),
    delete_dirs_local: plan.delete_dirs_remote.clone(),
    ..SyncPlan::default()
  }
}

async fn connect_peer(endpoint: &Endpoint, peer: &PeerConfig) -> Result<Connection, String> {
  if let Some(address) = peer.endpoint_addr.clone() {
    if let Ok(connection) = endpoint.connect(address, ALPN).await {
      return Ok(connection);
    }
  }
  let endpoint_id = EndpointId::from_str(&peer.endpoint_id)
    .map_err(|error| format!("invalid paired endpoint id: {error}"))?;
  endpoint
    .connect(EndpointAddr::new(endpoint_id), ALPN)
    .await
    .map_err(|error| format!("failed to connect to paired Sync peer: {error}"))
}

pub async fn run_peer_session(
  endpoint: &Endpoint,
  vault_root: &Path,
  config: &SyncConfig,
  peer: &PeerConfig,
) -> Result<SessionResult, String> {
  if !peer.verified {
    return Err("Sync peer is not verified".to_string());
  }
  let local_manifest = scan_vault(vault_root)?;
  let local_baseline = read_baseline(vault_root, &peer.endpoint_id);
  let connection = connect_peer(endpoint, peer).await?;
  if connection.remote_id().to_string() != peer.endpoint_id {
    return Err("connected Iroh identity does not match paired device".to_string());
  }
  let (mut send, mut recv) = connection
    .open_bi()
    .await
    .map_err(|error| format!("failed to open sync control stream: {error}"))?;
  write_control(
    &mut send,
    &ControlMessage::SyncOpen(SyncOpen {
      folder_id: config.folder_id.clone(),
      device_name: config.folder_label.clone(),
      manifest: local_manifest.clone(),
      baseline: local_baseline.clone(),
    }),
  )
  .await?;

  let hello = match expect_control(read_control(&mut recv).await?, "syncHello")? {
    ControlMessage::SyncHello(hello) => hello,
    _ => unreachable!(),
  };
  let baseline = common_baseline(&local_baseline, &hello.baseline);
  let plan = build_plan(
    &local_manifest,
    &hello.manifest,
    &baseline,
    &endpoint.id().to_string(),
    &peer.endpoint_id,
  );
  apply_local_plan(vault_root, &plan)?;
  write_control(&mut send, &ControlMessage::SyncPlan(plan.clone())).await?;

  match expect_control(read_control(&mut recv).await?, "readyForUploads")? {
    ControlMessage::ReadyForUploads { count } if count == plan.uploads.len() => {}
    ControlMessage::ReadyForUploads { count } => {
      return Err(format!(
        "peer expected {count} uploads, plan contains {}",
        plan.uploads.len()
      ));
    }
    _ => unreachable!(),
  }

  let mut result = SessionResult {
    peer_id: peer.endpoint_id.clone(),
    peer_name: peer.name.clone(),
    conflicts: plan.conflicts.clone(),
    ..SessionResult::default()
  };
  for upload in &plan.uploads {
    result.transferred_bytes += send_file(&connection, vault_root, upload).await?;
    result.transferred_files += 1;
  }
  match expect_control(read_control(&mut recv).await?, "uploadsApplied")? {
    ControlMessage::UploadsApplied { count } if count == plan.uploads.len() => {}
    ControlMessage::UploadsApplied { count } => {
      return Err(format!(
        "peer applied {count} uploads instead of {}",
        plan.uploads.len()
      ));
    }
    _ => unreachable!(),
  }

  for download in &plan.downloads {
    let (_, bytes) = receive_file(&connection, vault_root, download).await?;
    result.transferred_bytes += bytes;
    result.transferred_files += 1;
  }
  match expect_control(read_control(&mut recv).await?, "transfersComplete")? {
    ControlMessage::TransfersComplete { count } if count == plan.downloads.len() => {}
    ControlMessage::TransfersComplete { count } => {
      return Err(format!(
        "peer sent {count} downloads instead of {}",
        plan.downloads.len()
      ));
    }
    _ => unreachable!(),
  }

  let final_manifest = scan_vault(vault_root)?;
  write_control(
    &mut send,
    &ControlMessage::SyncFinish {
      manifest: final_manifest.clone(),
    },
  )
  .await?;
  let (remote_final, acknowledged) = match expect_control(
    read_control(&mut recv).await?,
    "syncComplete",
  )? {
    ControlMessage::SyncComplete {
      manifest,
      acknowledged,
    } => (manifest, acknowledged),
    _ => unreachable!(),
  };
  if acknowledged {
    return Err("peer acknowledged before the client validated the final manifest".to_string());
  }
  if !final_manifest.content_equals(&remote_final) {
    return Err("vault manifests still differ after transfer; baseline was not advanced".to_string());
  }
  write_baseline(vault_root, &peer.endpoint_id, &final_manifest)?;
  write_manifest(vault_root, &final_manifest)?;
  write_control(
    &mut send,
    &ControlMessage::SyncComplete {
      manifest: final_manifest,
      acknowledged: true,
    },
  )
  .await?;
  send.finish().map_err(|error| error.to_string())?;
  recv
    .read_to_end(0)
    .await
    .map_err(|error| format!("sync completion stream did not close cleanly: {error}"))?;
  connection.close(0_u32.into(), b"sync-complete");
  Ok(result)
}

pub async fn run_all_sessions(
  endpoint: &Endpoint,
  vault_root: &Path,
) -> Result<Vec<SessionResult>, String> {
  let config = read_config(vault_root)
    .ok_or_else(|| "Sync is not initialized for this vault".to_string())?;
  let peers = config
    .peers
    .iter()
    .filter(|peer| peer.verified)
    .cloned()
    .collect::<Vec<_>>();
  if peers.is_empty() {
    return Err("No paired Sync peer is available".to_string());
  }
  let mut results = Vec::with_capacity(peers.len());
  for peer in peers {
    results.push(run_peer_session(endpoint, vault_root, &config, &peer).await?);
  }
  Ok(results)
}

pub async fn serve_sync_session(
  vault_root: &Path,
  local_endpoint_id: &str,
  peer_id: String,
  open: SyncOpen,
  connection: Connection,
  mut send: iroh::endpoint::SendStream,
  mut recv: iroh::endpoint::RecvStream,
) -> Result<SessionResult, String> {
  let mut config = read_config(vault_root)
    .ok_or_else(|| "Sync is not initialized for this vault".to_string())?;
  let peer = config
    .peers
    .iter()
    .find(|peer| peer.endpoint_id == peer_id && peer.verified)
    .cloned()
    .ok_or_else(|| "Iroh endpoint is not paired for this vault".to_string())?;
  if open.folder_id != config.folder_id || peer.folder_id != config.folder_id {
    return Err("Iroh endpoint is paired for another vault".to_string());
  }

  let local_manifest = scan_vault(vault_root)?;
  let local_baseline = read_baseline(vault_root, &peer_id);
  write_control(
    &mut send,
    &ControlMessage::SyncHello(SyncHello {
      device_name: config.folder_label.clone(),
      manifest: local_manifest.clone(),
      baseline: local_baseline.clone(),
    }),
  )
  .await?;
  let plan = match expect_control(read_control(&mut recv).await?, "syncPlan")? {
    ControlMessage::SyncPlan(plan) => plan,
    _ => unreachable!(),
  };
  let baseline = common_baseline(&open.baseline, &local_baseline);
  let expected_plan = build_plan(
    &open.manifest,
    &local_manifest,
    &baseline,
    &peer_id,
    local_endpoint_id,
  );
  if plan != expected_plan {
    let message = "peer sync plan does not match the independently computed plan".to_string();
    write_control(&mut send, &ControlMessage::Error { message: message.clone() }).await?;
    return Err(message);
  }

  apply_local_plan(vault_root, &remote_operations_as_local(&plan))?;
  write_control(
    &mut send,
    &ControlMessage::ReadyForUploads {
      count: plan.uploads.len(),
    },
  )
  .await?;

  let mut result = SessionResult {
    peer_id: peer_id.clone(),
    peer_name: peer.name.clone(),
    conflicts: plan.conflicts.clone(),
    ..SessionResult::default()
  };
  for upload in &plan.uploads {
    let (_, bytes) = receive_file(&connection, vault_root, upload).await?;
    result.transferred_bytes += bytes;
    result.transferred_files += 1;
  }
  write_control(
    &mut send,
    &ControlMessage::UploadsApplied {
      count: plan.uploads.len(),
    },
  )
  .await?;

  for download in &plan.downloads {
    result.transferred_bytes += send_file(&connection, vault_root, download).await?;
    result.transferred_files += 1;
  }
  write_control(
    &mut send,
    &ControlMessage::TransfersComplete {
      count: plan.downloads.len(),
    },
  )
  .await?;

  let client_final = match expect_control(read_control(&mut recv).await?, "syncFinish")? {
    ControlMessage::SyncFinish { manifest } => manifest,
    _ => unreachable!(),
  };
  let final_manifest = scan_vault(vault_root)?;
  if !final_manifest.content_equals(&client_final) {
    let message = "vault manifests differ after applying the sync plan".to_string();
    write_control(&mut send, &ControlMessage::Error { message: message.clone() }).await?;
    return Err(message);
  }
  write_baseline(vault_root, &peer_id, &final_manifest)?;
  write_manifest(vault_root, &final_manifest)?;
  write_control(
    &mut send,
    &ControlMessage::SyncComplete {
      manifest: final_manifest.clone(),
      acknowledged: false,
    },
  )
  .await?;
  let (ack_manifest, acknowledged) = match expect_control(
    read_control(&mut recv).await?,
    "syncComplete",
  )? {
    ControlMessage::SyncComplete {
      manifest,
      acknowledged,
    } => (manifest, acknowledged),
    _ => unreachable!(),
  };
  if !acknowledged || !final_manifest.content_equals(&ack_manifest) {
    return Err("peer did not acknowledge the verified final manifest".to_string());
  }

  if let Some(peer) = config.peers.iter_mut().find(|peer| peer.endpoint_id == peer_id) {
    peer.last_seen_at = now();
  }
  config.first_run_done = true;
  config.updated_at = now();
  write_config(vault_root, &config)?;
  send.finish().map_err(|error| error.to_string())?;
  connection.close(0_u32.into(), b"sync-complete");
  Ok(result)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::plan::PreserveSpec;

  #[test]
  fn peer_ids_are_confined_to_one_baseline_filename() {
    assert_eq!(safe_peer_component("../peer:id"), "peerid");
  }

  #[test]
  fn remote_operations_are_applied_through_the_local_executor() {
    let plan = SyncPlan {
      preserve_remote: vec![PreserveSpec {
        source_path: "A.md".to_string(),
        target_path: ".conflit/A.md".to_string(),
      }],
      create_dirs_remote: vec!["Remote".to_string()],
      delete_files_remote: vec!["old.md".to_string()],
      delete_dirs_remote: vec!["empty".to_string()],
      ..SyncPlan::default()
    };
    let mapped = remote_operations_as_local(&plan);
    assert_eq!(mapped.preserve_local, plan.preserve_remote);
    assert_eq!(mapped.create_dirs_local, plan.create_dirs_remote);
    assert_eq!(mapped.delete_files_local, plan.delete_files_remote);
    assert_eq!(mapped.delete_dirs_local, plan.delete_dirs_remote);
  }
}

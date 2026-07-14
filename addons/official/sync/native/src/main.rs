use elephant_sync_service::{
  conflicts::{conflict_delete, conflict_restore, conflict_settings_set, conflict_status},
  local_ops::apply_local_plan,
  manifest::{scan_vault, VaultManifest},
  pairing::{
    consume_pair_request, create_pending_invite, parse_invite, read_config, register_accepted_peer,
  },
  plan::{build_plan, SyncPlan},
  protocol::{expect_control, read_control, write_control, ControlMessage, PairRequest, ALPN},
  session::{run_all_sessions, serve_sync_session},
};
use iroh::{
  endpoint::{presets, Connection},
  protocol::{AcceptError, ProtocolHandler, Router},
  Endpoint, EndpointAddr, SecretKey, Watcher as _,
};
use iroh_mdns_address_lookup::MdnsAddressLookup;
use serde_json::{json, Value};
use std::{
  env, fmt, fs, io,
  path::{Path, PathBuf},
  time::Duration,
};
use tokio::{
  io::{self as tokio_io, AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter},
  time::timeout,
};

const SERVICE_PROTOCOL: &str = "elephant-addon-service-v1";
const ADDON_ID: &str = "elephant.sync";
const IDENTITY_FILE: &str = "iroh-endpoint.key";
const MDNS_SERVICE: &str = "elephant-sync-addon-v1";
const ENDPOINT_ADDRESS_TIMEOUT: Duration = Duration::from_secs(10);

struct SyncService {
  endpoint: Option<Endpoint>,
  router: Option<Router>,
  vault_dir: PathBuf,
  data_dir: PathBuf,
}

impl SyncService {
  fn from_environment() -> Result<Self, String> {
    let vault_dir = env::var_os("ELEPHANT_VAULT_DIR")
      .map(PathBuf::from)
      .ok_or_else(|| "ELEPHANT_VAULT_DIR is unavailable for the Sync addon service".to_string())?;
    let data_dir = env::var_os("ELEPHANT_ADDON_DATA_DIR")
      .map(PathBuf::from)
      .ok_or_else(|| "ELEPHANT_ADDON_DATA_DIR is unavailable for the Sync addon service".to_string())?;
    Ok(Self {
      endpoint: None,
      router: None,
      vault_dir,
      data_dir,
    })
  }

  #[cfg(test)]
  fn with_vault_dir(vault_dir: PathBuf) -> Self {
    let data_dir = vault_dir.join(".sync-addon-test-data");
    Self {
      endpoint: None,
      router: None,
      vault_dir,
      data_dir,
    }
  }

  fn identity_path(&self) -> PathBuf {
    self.data_dir.join(IDENTITY_FILE)
  }

  fn device_name(&self) -> String {
    self
      .vault_dir
      .file_name()
      .and_then(|value| value.to_str())
      .filter(|value| !value.trim().is_empty())
      .unwrap_or("Elephant device")
      .to_string()
  }

  async fn ensure_endpoint(&mut self) -> Result<&Endpoint, String> {
    if self.endpoint.is_none() {
      fs::create_dir_all(&self.data_dir).map_err(|error| error.to_string())?;
      let secret_key = load_or_create_secret_key(&self.identity_path())?;
      let endpoint = Endpoint::builder(presets::Minimal)
        .secret_key(secret_key)
        .address_lookup(MdnsAddressLookup::builder().service_name(MDNS_SERVICE))
        .bind()
        .await
        .map_err(|error| format!("Failed to bind Iroh endpoint: {error}"))?;
      wait_for_endpoint_addr(&endpoint).await?;
      let router = Router::builder(endpoint.clone())
        .accept(
          ALPN,
          SyncProtocol {
            endpoint: endpoint.clone(),
            vault_dir: self.vault_dir.clone(),
            device_name: self.device_name(),
          },
        )
        .spawn();
      self.router = Some(router);
      self.endpoint = Some(endpoint);
    }
    self
      .endpoint
      .as_ref()
      .ok_or_else(|| "Iroh endpoint was not initialized".to_string())
  }

  async fn status(&mut self) -> Result<Value, String> {
    let (endpoint_id, endpoint_addr) = {
      let endpoint = self.ensure_endpoint().await?;
      (endpoint.id().to_string(), endpoint.addr())
    };
    let config = read_config(&self.vault_dir);
    let peers = config
      .as_ref()
      .map(|value| serde_json::to_value(&value.peers).unwrap_or_else(|_| json!([])))
      .unwrap_or_else(|| json!([]));
    let pending_invites = config
      .as_ref()
      .map(|value| value.pending_invites.len())
      .unwrap_or_default();
    Ok(json!({
      "running": true,
      "endpointId": endpoint_id,
      "endpointAddr": endpoint_addr,
      "transport": "iroh",
      "discovery": "mdns",
      "mdnsService": MDNS_SERVICE,
      "stableIdentity": true,
      "owner": ADDON_ID,
      "vaultDir": self.vault_dir,
      "dataDir": self.data_dir,
      "peers": peers,
      "pendingInvites": pending_invites,
      "pairingState": if config.as_ref().is_some_and(|value| !value.peers.is_empty()) { "paired" } else { "not-paired" },
      "networkTransfersReady": true,
      "ownedCapabilities": [
        "endpoint",
        "identity",
        "wire-protocol",
        "pairing",
        "manifest",
        "plan",
        "local-operations",
        "file-streams",
        "sync-sessions",
        "conflict-archive"
      ]
    }))
  }

  async fn create_invite(&mut self, params: Value) -> Result<Value, String> {
    let (endpoint_id, endpoint_addr) = {
      let endpoint = self.ensure_endpoint().await?;
      (endpoint.id().to_string(), endpoint.addr())
    };
    let device_name = params
      .get("deviceName")
      .and_then(Value::as_str)
      .filter(|value| !value.trim().is_empty())
      .map(str::to_string)
      .unwrap_or_else(|| self.device_name());
    let expires_at = params.get("expiresAt").and_then(Value::as_u64);
    let created = create_pending_invite(
      &self.vault_dir,
      &endpoint_id,
      endpoint_addr,
      device_name,
      expires_at,
    )?;
    let invite = serde_json::to_value(&created.invite).map_err(|error| error.to_string())?;
    let qr_payload = created.invite.qr_payload()?;
    Ok(json!({
      "ok": true,
      "owner": ADDON_ID,
      "runtime": "physical-sync-service",
      "invite": invite,
      "qrPayload": qr_payload,
      "manualCode": qr_payload,
      "pairing": { "state": "waiting-for-peer", "userAction": "scan-qr-or-copy-code" }
    }))
  }

  async fn accept_invite(&mut self, params: Value) -> Result<Value, String> {
    let invite = parse_invite(params)?;
    let endpoint = self.ensure_endpoint().await?.clone();
    let remote_addr = invite.endpoint_addr.clone();
    let connection = endpoint
      .connect(remote_addr.clone(), ALPN)
      .await
      .map_err(|error| format!("Failed to connect to invited Iroh peer: {error}"))?;
    if connection.remote_id() != remote_addr.id {
      return Err("Iroh peer identity did not match the pairing invite".to_string());
    }
    let (mut send, mut recv) = connection
      .open_bi()
      .await
      .map_err(|error| format!("Failed to open pairing control stream: {error}"))?;
    write_control(
      &mut send,
      &ControlMessage::PairRequest(PairRequest {
        invite_id: invite.invite_id.clone(),
        invite_token: invite.invite_token.clone(),
        folder_id: invite.folder_id.clone(),
        device_name: self.device_name(),
        endpoint_addr: endpoint.addr(),
      }),
    )
    .await?;
    send
      .finish()
      .map_err(|error| format!("Failed to finish pairing request stream: {error}"))?;
    let accepted = match expect_control(read_control(&mut recv).await?, "pairAccepted")? {
      ControlMessage::PairAccepted(accepted) => accepted,
      _ => unreachable!(),
    };
    if accepted.endpoint_addr.id != connection.remote_id() {
      return Err("Paired device returned an inconsistent Iroh identity".to_string());
    }
    recv
      .read_to_end(0)
      .await
      .map_err(|error| format!("Pairing response did not close cleanly: {error}"))?;
    connection.close(0_u32.into(), b"pairing-complete");
    let config = register_accepted_peer(
      &self.vault_dir,
      &endpoint.id().to_string(),
      &invite.folder_id,
      accepted,
    )?;
    Ok(json!({
      "ok": true,
      "owner": ADDON_ID,
      "pairing": { "state": "paired", "nextAction": "sync-now" },
      "folderId": config.folder_id,
      "folderLabel": config.folder_label,
      "peers": config.peers
    }))
  }

  fn scan(&self) -> Result<Value, String> {
    let manifest = scan_vault(&self.vault_dir)?;
    Ok(json!({
      "owner": ADDON_ID,
      "vaultDir": self.vault_dir,
      "files": manifest.files.len(),
      "directories": manifest.directories.len(),
      "manifest": manifest
    }))
  }

  async fn plan(&mut self, params: Value) -> Result<Value, String> {
    let local = match params.get("localManifest").cloned() {
      Some(value) if !value.is_null() => serde_json::from_value::<VaultManifest>(value)
        .map_err(|error| format!("Invalid local Sync manifest: {error}"))?,
      _ => scan_vault(&self.vault_dir)?,
    };
    let remote = params
      .get("remoteManifest")
      .cloned()
      .ok_or_else(|| "remoteManifest is required for package-owned Sync planning".to_string())
      .and_then(|value| {
        serde_json::from_value::<VaultManifest>(value)
          .map_err(|error| format!("Invalid remote Sync manifest: {error}"))
      })?;
    let baseline = params
      .get("baseline")
      .cloned()
      .filter(|value| !value.is_null())
      .map(serde_json::from_value::<VaultManifest>)
      .transpose()
      .map_err(|error| format!("Invalid Sync baseline: {error}"))?
      .unwrap_or_default();
    let local_id = match params
      .get("localId")
      .and_then(Value::as_str)
      .filter(|value| !value.is_empty())
    {
      Some(value) => value.to_string(),
      None => self.ensure_endpoint().await?.id().to_string(),
    };
    let remote_id = params
      .get("remoteId")
      .and_then(Value::as_str)
      .filter(|value| !value.is_empty())
      .unwrap_or("remote")
      .to_string();
    let plan = build_plan(&local, &remote, &baseline, &local_id, &remote_id);
    Ok(json!({
      "owner": ADDON_ID,
      "localId": local_id,
      "remoteId": remote_id,
      "summary": {
        "uploads": plan.uploads.len(),
        "downloads": plan.downloads.len(),
        "deletes": plan.delete_files_local.len() + plan.delete_files_remote.len(),
        "conflicts": plan.conflicts.len()
      },
      "plan": plan
    }))
  }

  fn apply_local(&self, params: Value) -> Result<Value, String> {
    let plan = params
      .get("plan")
      .cloned()
      .ok_or_else(|| "plan is required for package-owned local Sync operations".to_string())
      .and_then(|value| {
        serde_json::from_value::<SyncPlan>(value)
          .map_err(|error| format!("Invalid local Sync plan: {error}"))
      })?;
    let summary = apply_local_plan(&self.vault_dir, &plan)?;
    Ok(json!({
      "owner": ADDON_ID,
      "vaultDir": self.vault_dir,
      "summary": summary
    }))
  }

  fn conflict_status(&self, perform_cleanup: bool) -> Result<Value, String> {
    conflict_status(&self.vault_dir, perform_cleanup)
  }

  fn set_conflict_retention(&self, params: &Value) -> Result<Value, String> {
    let retention_days = params
      .get("retentionDays")
      .or_else(|| params.get("conflictRetentionDays"))
      .and_then(Value::as_u64)
      .ok_or_else(|| "retentionDays is required".to_string())?;
    let retention_days = u32::try_from(retention_days)
      .map_err(|_| "retentionDays is outside the supported range".to_string())?;
    conflict_settings_set(&self.vault_dir, retention_days)
  }

  fn restore_conflict(&self, params: &Value) -> Result<Value, String> {
    let relative_path = params
      .get("relativePath")
      .or_else(|| params.get("path"))
      .and_then(Value::as_str)
      .filter(|value| !value.trim().is_empty())
      .ok_or_else(|| "relativePath is required".to_string())?;
    conflict_restore(&self.vault_dir, relative_path)
  }

  fn delete_conflict(&self, params: &Value) -> Result<Value, String> {
    let relative_path = params
      .get("relativePath")
      .or_else(|| params.get("path"))
      .and_then(Value::as_str)
      .filter(|value| !value.trim().is_empty())
      .ok_or_else(|| "relativePath is required".to_string())?;
    conflict_delete(&self.vault_dir, relative_path)
  }

  async fn run_sync(&mut self) -> Result<Value, String> {
    let endpoint = self.ensure_endpoint().await?.clone();
    let sessions = run_all_sessions(&endpoint, &self.vault_dir).await?;
    let transferred_files = sessions
      .iter()
      .map(|session| session.transferred_files)
      .sum::<u64>();
    let transferred_bytes = sessions
      .iter()
      .map(|session| session.transferred_bytes)
      .sum::<u64>();
    let conflicts = sessions
      .iter()
      .flat_map(|session| session.conflicts.iter().cloned())
      .collect::<Vec<_>>();
    Ok(json!({
      "ok": true,
      "owner": ADDON_ID,
      "state": "success",
      "runtime": "physical-sync-service",
      "sessions": sessions,
      "transferredFiles": transferred_files,
      "transferredBytes": transferred_bytes,
      "conflicts": conflicts
    }))
  }

  async fn stop(&mut self) {
    self.router.take();
    if let Some(endpoint) = self.endpoint.take() {
      endpoint.close().await;
    }
  }
}

#[derive(Clone)]
struct SyncProtocol {
  endpoint: Endpoint,
  vault_dir: PathBuf,
  device_name: String,
}

impl fmt::Debug for SyncProtocol {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    formatter.debug_struct("SyncProtocol").finish_non_exhaustive()
  }
}

impl ProtocolHandler for SyncProtocol {
  async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
    handle_incoming_connection(
      self.endpoint.clone(),
      self.vault_dir.clone(),
      self.device_name.clone(),
      connection,
    )
    .await
    .map_err(|error| AcceptError::from_err(io::Error::other(error)))
  }
}

async fn handle_incoming_connection(
  endpoint: Endpoint,
  vault_dir: PathBuf,
  device_name: String,
  connection: Connection,
) -> Result<(), String> {
  let peer_id = connection.remote_id().to_string();
  let (mut send, mut recv) = connection
    .accept_bi()
    .await
    .map_err(|error| error.to_string())?;
  match read_control(&mut recv).await? {
    ControlMessage::PairRequest(request) => {
      if request.endpoint_addr.id != connection.remote_id() {
        return Err("Pair request endpoint address does not match authenticated Iroh identity".to_string());
      }
      recv
        .read_to_end(0)
        .await
        .map_err(|error| format!("Pairing request did not close cleanly: {error}"))?;
      let accepted = consume_pair_request(&vault_dir, request, endpoint.addr(), &device_name)?;
      write_control(&mut send, &ControlMessage::PairAccepted(accepted)).await?;
      send
        .finish()
        .map_err(|error| format!("Failed to finish pairing response stream: {error}"))?;
      Ok(())
    }
    ControlMessage::SyncOpen(open) => {
      serve_sync_session(
        &vault_dir,
        &endpoint.id().to_string(),
        peer_id,
        open,
        connection,
        send,
        recv,
      )
      .await?;
      Ok(())
    }
    other => {
      let message = format!(
        "first physical Sync message must be pairRequest or syncOpen, received {}",
        elephant_sync_service::protocol::message_name(&other)
      );
      let _ = write_control(
        &mut send,
        &ControlMessage::Error {
          message: message.clone(),
        },
      )
      .await;
      Err(message)
    }
  }
}

async fn wait_for_endpoint_addr(endpoint: &Endpoint) -> Result<EndpointAddr, String> {
  let mut watcher = endpoint.watch_addr();
  timeout(ENDPOINT_ADDRESS_TIMEOUT, async {
    loop {
      let addr = watcher.get();
      if addr.ip_addrs().next().is_some() || addr.relay_urls().next().is_some() {
        return Ok(addr);
      }
      watcher
        .updated()
        .await
        .map_err(|_| "Iroh endpoint address watcher disconnected".to_string())?;
    }
  })
  .await
  .map_err(|_| "Iroh endpoint did not publish a dialable address within ten seconds".to_string())?
}

fn load_or_create_secret_key(path: &Path) -> Result<SecretKey, String> {
  if path.exists() {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let bytes: [u8; 32] = bytes
      .try_into()
      .map_err(|_| "Invalid Sync addon Iroh identity file".to_string())?;
    return Ok(SecretKey::from_bytes(&bytes));
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let key = SecretKey::generate();
  let temporary = path.with_extension("key.tmp");
  fs::write(&temporary, key.to_bytes()).map_err(|error| error.to_string())?;
  set_private_permissions(&temporary)?;
  fs::rename(&temporary, path).map_err(|error| error.to_string())?;
  set_private_permissions(path)?;
  Ok(key)
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> Result<(), String> {
  use std::os::unix::fs::PermissionsExt;
  fs::set_permissions(path, fs::Permissions::from_mode(0o600)).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> Result<(), String> {
  Ok(())
}

fn success(id: u64, result: Value) -> Value {
  json!({ "protocol": SERVICE_PROTOCOL, "id": id, "ok": true, "result": result })
}

fn failure(id: u64, message: impl Into<String>) -> Value {
  json!({ "protocol": SERVICE_PROTOCOL, "id": id, "ok": false, "error": { "message": message.into() } })
}

async fn handle(service: &mut SyncService, method: &str, params: Value) -> Result<Value, String> {
  match method {
    "service.start" | "sync.status" | "sync.endpoint" => service.status().await,
    "sync.create-invite" => service.create_invite(params).await,
    "sync.accept-invite" => service.accept_invite(params).await,
    "sync.scan" => service.scan(),
    "sync.plan" => service.plan(params).await,
    "sync.apply-local" => service.apply_local(params),
    "sync.conflicts.peek" => service.conflict_status(false),
    "sync.conflicts.get" => service.conflict_status(true),
    "sync.conflicts.set" => service.set_conflict_retention(&params),
    "sync.conflicts.restore" => service.restore_conflict(&params),
    "sync.conflicts.delete" => service.delete_conflict(&params),
    "sync.run" => service.run_sync().await,
    "service.stop" | "sync.shutdown" => {
      service.stop().await;
      Ok(json!({ "running": false, "stopped": true }))
    }
    _ => Err(format!("Unsupported Sync service method: {method}")),
  }
}

#[tokio::main]
async fn main() {
  let stdin = tokio_io::stdin();
  let stdout = tokio_io::stdout();
  let mut lines = BufReader::new(stdin).lines();
  let mut writer = BufWriter::new(stdout);
  let mut service = match SyncService::from_environment() {
    Ok(service) => service,
    Err(error) => {
      eprintln!("[SyncAddon] service:start error={error}");
      return;
    }
  };

  while let Ok(Some(line)) = lines.next_line().await {
    let request: Value = match serde_json::from_str(&line) {
      Ok(value) => value,
      Err(error) => {
        let response = failure(0, format!("Invalid service request JSON: {error}"));
        let _ = writer.write_all(format!("{response}\n").as_bytes()).await;
        let _ = writer.flush().await;
        continue;
      }
    };
    let id = request.get("id").and_then(Value::as_u64).unwrap_or(0);
    let protocol = request.get("protocol").and_then(Value::as_str).unwrap_or("");
    let addon_id = request.get("addonId").and_then(Value::as_str).unwrap_or(ADDON_ID);
    let method = request.get("method").and_then(Value::as_str).unwrap_or("");
    let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
    let response = if protocol != SERVICE_PROTOCOL {
      failure(id, format!("Unsupported service protocol: {protocol}"))
    } else if addon_id != ADDON_ID {
      failure(id, format!("Service addon id mismatch: {addon_id}"))
    } else if method.is_empty() {
      failure(id, "A service method is required")
    } else {
      match handle(&mut service, method, params).await {
        Ok(result) => success(id, result),
        Err(error) => failure(id, error),
      }
    };
    if writer.write_all(format!("{response}\n").as_bytes()).await.is_err()
      || writer.flush().await.is_err()
    {
      break;
    }
    if matches!(method, "service.stop" | "sync.shutdown") {
      break;
    }
  }
  service.stop().await;
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-sync-service-{name}-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  #[test]
  fn envelopes_use_the_versioned_service_protocol() {
    let response = success(7, json!({ "running": true }));
    assert_eq!(response["protocol"], SERVICE_PROTOCOL);
    assert_eq!(response["id"], 7);
    assert_eq!(response["ok"], true);
  }

  #[test]
  fn package_identity_is_stable_across_service_restarts() {
    let root = temp_root("identity");
    let path = root.join("data").join(IDENTITY_FILE);
    let first = load_or_create_secret_key(&path).unwrap();
    let second = load_or_create_secret_key(&path).unwrap();
    assert_eq!(first.to_bytes(), second.to_bytes());
    assert_eq!(fs::read(&path).unwrap(), first.to_bytes());
    let _ = fs::remove_dir_all(root);
  }

  #[cfg(unix)]
  #[test]
  fn package_identity_is_private_on_unix() {
    use std::os::unix::fs::PermissionsExt;
    let root = temp_root("permissions");
    let path = root.join("data").join(IDENTITY_FILE);
    load_or_create_secret_key(&path).unwrap();
    let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o600);
    let _ = fs::remove_dir_all(root);
  }

  #[tokio::test]
  async fn unknown_methods_are_rejected_without_starting_network_state() {
    let root = temp_root("unknown");
    let mut service = SyncService::with_vault_dir(root.clone());
    let error = handle(&mut service, "sync.unknown", json!({}))
      .await
      .unwrap_err();
    assert!(error.contains("Unsupported Sync service method"));
    assert!(service.endpoint.is_none());
    assert!(service.router.is_none());
    let _ = fs::remove_dir_all(root);
  }

  #[tokio::test]
  async fn scan_and_plan_are_owned_by_the_package_service() {
    let root = temp_root("plan");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("A.md"), "# A").unwrap();
    let mut service = SyncService::with_vault_dir(root.clone());
    let scanned = handle(&mut service, "sync.scan", json!({})).await.unwrap();
    assert_eq!(scanned["owner"], ADDON_ID);
    assert_eq!(scanned["files"], 1);
    let planned = handle(
      &mut service,
      "sync.plan",
      json!({
        "remoteManifest": { "files": {}, "directories": [] },
        "baseline": { "files": {}, "directories": [] },
        "localId": "local",
        "remoteId": "remote"
      }),
    )
    .await
    .unwrap();
    assert_eq!(planned["owner"], ADDON_ID);
    assert_eq!(planned["summary"]["uploads"], 1);
    let _ = fs::remove_dir_all(root);
  }

  #[tokio::test]
  async fn local_plan_operations_run_inside_the_package_service() {
    let root = temp_root("apply");
    fs::create_dir_all(root.join("Notes")).unwrap();
    fs::write(root.join("Notes/delete.md"), "delete").unwrap();
    let mut service = SyncService::with_vault_dir(root.clone());
    let applied = handle(
      &mut service,
      "sync.apply-local",
      json!({
        "plan": {
          "uploads": [], "downloads": [], "preserveLocal": [], "preserveRemote": [],
          "createDirsLocal": ["Imported"], "createDirsRemote": [],
          "deleteFilesLocal": ["Notes/delete.md"], "deleteFilesRemote": [],
          "deleteDirsLocal": [], "deleteDirsRemote": [], "conflicts": []
        }
      }),
    )
    .await
    .unwrap();
    assert_eq!(applied["summary"]["filesDeleted"], 1);
    assert!(root.join("Imported").is_dir());
    assert!(!root.join("Notes/delete.md").exists());
    let _ = fs::remove_dir_all(root);
  }

  #[tokio::test]
  async fn conflict_archive_commands_are_package_owned() {
    let root = temp_root("conflicts");
    fs::create_dir_all(root.join(".conflit/Notes")).unwrap();
    fs::write(root.join(".conflit/Notes/A.device-conflict-1.md"), "older").unwrap();
    let mut service = SyncService::with_vault_dir(root.clone());
    let status = handle(&mut service, "sync.conflicts.get", json!({}))
      .await
      .unwrap();
    assert_eq!(status["retentionDays"], 3);
    assert_eq!(status["storedFiles"], 1);
    let updated = handle(
      &mut service,
      "sync.conflicts.set",
      json!({ "retentionDays": 12 }),
    )
    .await
    .unwrap();
    assert_eq!(updated["retentionDays"], 12);
    let deleted = handle(
      &mut service,
      "sync.conflicts.delete",
      json!({ "relativePath": ".conflit/Notes/A.device-conflict-1.md" }),
    )
    .await
    .unwrap();
    assert_eq!(deleted["storedFiles"], 0);
    let _ = fs::remove_dir_all(root);
  }
}

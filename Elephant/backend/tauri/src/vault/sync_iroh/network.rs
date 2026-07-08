use crate::sync::logging::{log_global, log_global_error, short_peer_id, SyncLogger};
use crate::sync::transfer::{
  create_directories_logged, delete_directories_logged, delete_files_logged,
  preserve_paths_logged, receive_file_logged, send_file_logged,
};

fn quoted(value: &str) -> String {
  serde_json::to_string(value).unwrap_or_else(|_| "\"<invalid>\"".to_string())
}

fn conflict_archive_path<'a>(plan: &'a SyncPlan, path: &str) -> Option<&'a str> {
  plan
    .preserve_local
    .iter()
    .chain(plan.preserve_remote.iter())
    .find(|item| item.source_path == path)
    .map(|item| item.target_path.as_str())
    .or_else(|| {
      plan
        .uploads
        .iter()
        .chain(plan.downloads.iter())
        .find(|item| item.target_path.starts_with(".conflit/") && item.source_path.contains(path))
        .map(|item| item.target_path.as_str())
    })
}

fn log_conflicts(logger: &SyncLogger, plan: &SyncPlan) {
  for path in &plan.conflicts {
    logger.conflict(path, conflict_archive_path(plan, path));
  }
}

pub async fn sync_create_invite(
  vault: VaultDescriptor,
  payload: Option<Value>,
  runtime: Arc<IrohRuntime>,
) -> R<Value> {
  let payload = normalize_payload(payload);
  let cwd = PathBuf::from(&vault.path);
  let endpoint_id = runtime.endpoint_id().to_string();
  let mut config = ensure_sync_files(&vault, &endpoint_id)?;
  let invite_id = format!("invite-{}", hex_encode(&iroh::SecretKey::generate().to_bytes()[..8]));
  let token = random_token();
  let expires_at = payload
    .get("expiresAt")
    .and_then(Value::as_u64)
    .unwrap_or_else(|| epoch_seconds() + INVITE_LIFETIME_SECONDS);
  config.pending_invites.push(PendingInvite {
    id: invite_id.clone(),
    token_hash: token_hash(&token),
    expires_at,
  });
  config.pending_invites.retain(|invite| invite.expires_at > epoch_seconds());
  config.updated_at = now();
  write_config(&cwd, &config)?;

  let device_name = payload
    .get("deviceName")
    .and_then(Value::as_str)
    .filter(|value| !value.trim().is_empty())
    .unwrap_or(&vault.name);
  log_global(
    "invite:create",
    format!(
      "invite_id={} vault={} device={} expires_at={} endpoint_id={}",
      invite_id,
      quoted(&vault.name),
      quoted(device_name),
      expires_at,
      short_peer_id(&endpoint_id)
    ),
  );
  let invite = json!({
    "protocol": PROTOCOL_NAME,
    "version": 1,
    "backend": BACKEND_IROH,
    "transport": "iroh-quic-mdns",
    "inviteId": invite_id,
    "inviteToken": token,
    "expiresAt": expires_at,
    "folderId": config.folder_id.as_str(),
    "folderLabel": config.folder_label,
    "deviceName": device_name,
    "endpointAddr": runtime.endpoint_addr(),
    "security": security_value()
  });
  let qr_payload = serde_json::to_string(&invite).map_err(|error| error.to_string())?;
  Ok(json!({
    "ok": true,
    "runtime": "tauri-rust-iroh",
    "backend": BACKEND_IROH,
    "invite": invite,
    "qrPayload": qr_payload,
    "manualCode": qr_payload,
    "pairing": { "state": "waiting-for-peer", "userAction": "scan-qr-or-copy-code" },
    "instructions": [
      "Keep ElephantNote open on this device",
      "Open Sync on the second device",
      "Scan the QR code or paste the manual code within ten minutes",
      "Run Sync now after both devices show as paired"
    ],
    "security": security_value()
  }))
}

pub async fn sync_accept_invite(
  vault: VaultDescriptor,
  invite_payload: Value,
  runtime: Arc<IrohRuntime>,
) -> R<Value> {
  let invite = parse_invite(invite_payload)?;
  if invite.get("protocol").and_then(Value::as_str) != Some(PROTOCOL_NAME) {
    return Err("This is not an ElephantNote Iroh sync invite.".to_string());
  }
  let expires_at = invite
    .get("expiresAt")
    .and_then(Value::as_u64)
    .ok_or_else(|| "Pairing invite has no expiration.".to_string())?;
  if expires_at <= epoch_seconds() {
    return Err("This ElephantNote pairing invite has expired.".to_string());
  }
  let invite_id = invite
    .get("inviteId")
    .and_then(Value::as_str)
    .ok_or_else(|| "Pairing invite has no invite id.".to_string())?;
  let invite_token = invite
    .get("inviteToken")
    .and_then(Value::as_str)
    .ok_or_else(|| "Pairing invite has no one-time token.".to_string())?;
  let folder_id = invite
    .get("folderId")
    .and_then(Value::as_str)
    .ok_or_else(|| "Pairing invite has no vault id.".to_string())?;
  let folder_label = invite
    .get("folderLabel")
    .and_then(Value::as_str)
    .unwrap_or(&vault.name);
  let remote_addr: EndpointAddr = serde_json::from_value(
    invite
      .get("endpointAddr")
      .cloned()
      .ok_or_else(|| "Pairing invite has no Iroh endpoint address.".to_string())?,
  )
  .map_err(|error| format!("invalid Iroh endpoint address: {error}"))?;

  log_global(
    "pairing:start",
    format!(
      "invite_id={} vault={} peer_id={}",
      invite_id,
      quoted(&vault.name),
      short_peer_id(&remote_addr.id.to_string())
    ),
  );
  let connection = runtime.connect(remote_addr.clone()).await?;
  if connection.remote_id() != remote_addr.id {
    return Err("Iroh peer identity did not match the invite.".to_string());
  }
  let (mut send, mut recv) = connection
    .open_bi()
    .await
    .map_err(|error| format!("failed to open pairing control stream: {error}"))?;
  log_global("pairing:request", format!("invite_id={invite_id}"));
  write_control(
    &mut send,
    &ControlMessage::PairRequest(PairRequest {
      invite_id: invite_id.to_string(),
      invite_token: invite_token.to_string(),
      folder_id: folder_id.to_string(),
      device_name: vault.name.clone(),
      endpoint_addr: runtime.endpoint_addr(),
    }),
  )
  .await?;

  let accepted = match expect_control(read_control(&mut recv).await?, "pairAccepted")? {
    ControlMessage::PairAccepted(accepted) => accepted,
    _ => unreachable!(),
  };
  if accepted.folder_id != folder_id {
    return Err("Paired device returned a different vault id.".to_string());
  }
  if accepted.endpoint_addr.id != connection.remote_id() {
    return Err("Paired device returned an inconsistent Iroh identity.".to_string());
  }
  send.finish().map_err(|error| error.to_string())?;
  recv
    .read_to_end(0)
    .await
    .map_err(|error| format!("pairing response did not close cleanly: {error}"))?;
  connection.close(0_u32.into(), b"pairing-complete");

  let cwd = PathBuf::from(&vault.path);
  let mut config = ensure_sync_files(&vault, &runtime.endpoint_id().to_string())?;
  config.folder_id = folder_id.to_string();
  config.folder_label = folder_label.to_string();
  let peer_name = accepted.device_name.clone();
  let peer_id = accepted.endpoint_addr.id.to_string();
  upsert_peer(
    &mut config.peers,
    peer_from_pair(
      accepted.endpoint_addr,
      accepted.device_name,
      folder_id.to_string(),
    ),
  );
  config.updated_at = now();
  write_config(&cwd, &config)?;
  log_global(
    "pairing:complete",
    format!(
      "vault={} peer={} peer_id={}",
      quoted(&vault.name),
      quoted(&peer_name),
      short_peer_id(&peer_id)
    ),
  );
  Ok(json!({
    "ok": true,
    "runtime": "tauri-rust-iroh",
    "pairing": { "state": "paired", "nextAction": "sync-now" },
    "status": status_value(&vault, &read_queue(&cwd), &read_history(&cwd), &read_state(&cwd), &config),
    "security": security_value()
  }))
}

async fn client_sync_peer(
  vault: &VaultDescriptor,
  config: &SyncConfig,
  peer: &PeerConfig,
  runtime: &IrohRuntime,
) -> R<SessionResult> {
  let logger = SyncLogger::start("client", &peer.name, &peer.endpoint_id, &vault.name);
  let result = client_sync_peer_logged(vault, config, peer, runtime, &logger).await;
  match &result {
    Ok(summary) => logger.complete(
      summary.transferred_files,
      summary.transferred_bytes,
      summary.conflicts.len(),
    ),
    Err(error) => logger.error("session:error", error, format!("duration_ms={}", logger.elapsed_ms())),
  }
  result
}

async fn client_sync_peer_logged(
  vault: &VaultDescriptor,
  config: &SyncConfig,
  peer: &PeerConfig,
  runtime: &IrohRuntime,
  logger: &SyncLogger,
) -> R<SessionResult> {
  let cwd = PathBuf::from(&vault.path);
  logger.event("scan:start", "side=local");
  let local_manifest = scan(cwd.clone()).await?;
  logger.manifest("local", &local_manifest);
  let local_baseline = read_baseline(&cwd, &peer.endpoint_id);
  logger.baseline(&local_baseline);
  logger.event("connect:start", format!("peer={}", quoted(&peer.name)));
  let connection = connect_peer(runtime, peer).await?;
  if connection.remote_id().to_string() != peer.endpoint_id {
    return Err("connected Iroh identity does not match paired device".to_string());
  }
  logger.event(
    "connect:complete",
    format!("peer_id={}", short_peer_id(&peer.endpoint_id)),
  );
  let (mut send, mut recv) = connection
    .open_bi()
    .await
    .map_err(|error| format!("failed to open sync control stream: {error}"))?;
  logger.event("control:send", "type=syncOpen");
  write_control(
    &mut send,
    &ControlMessage::SyncOpen(SyncOpen {
      folder_id: config.folder_id.clone(),
      device_name: vault.name.clone(),
      manifest: local_manifest.clone(),
      baseline: local_baseline.clone(),
    }),
  )
  .await?;

  let hello = match expect_control(read_control(&mut recv).await?, "syncHello")? {
    ControlMessage::SyncHello(hello) => hello,
    _ => unreachable!(),
  };
  logger.event("control:receive", "type=syncHello");
  logger.manifest("remote", &hello.manifest);
  let baseline = common_baseline(&local_baseline, &hello.baseline);
  logger.event(
    "baseline:common",
    format!(
      "files={} directories={}",
      baseline.files.len(),
      baseline.directories.len()
    ),
  );
  let plan = build_plan(
    &local_manifest,
    &hello.manifest,
    &baseline,
    &runtime.endpoint_id().to_string(),
    &peer.endpoint_id,
  );
  logger.plan(&plan);
  log_conflicts(logger, &plan);

  preserve_paths_logged(&cwd, &plan.preserve_local, Some(logger), "local")?;
  create_directories_logged(&cwd, &plan.create_dirs_local, Some(logger), "local")?;
  delete_files_logged(&cwd, &plan.delete_files_local, Some(logger), "local")?;
  delete_directories_logged(&cwd, &plan.delete_dirs_local, Some(logger), "local")?;
  logger.event("control:send", "type=syncPlan");
  write_control(&mut send, &ControlMessage::SyncPlan(plan.clone())).await?;

  match expect_control(read_control(&mut recv).await?, "readyForUploads")? {
    ControlMessage::ReadyForUploads { count } if count == plan.uploads.len() => {
      logger.event("control:receive", format!("type=readyForUploads count={count}"));
    }
    ControlMessage::ReadyForUploads { count } => {
      return Err(format!("peer expected {count} uploads, plan contains {}", plan.uploads.len()));
    }
    _ => unreachable!(),
  }

  let mut result = SessionResult {
    conflicts: plan.conflicts.clone(),
    ..SessionResult::default()
  };
  for upload in &plan.uploads {
    match send_file_logged(&connection, &cwd, upload, Some(logger), "upload").await {
      Ok(bytes) => {
        result.transferred_bytes += bytes;
        result.transferred_files += 1;
      }
      Err(error) => {
        logger.error("upload:error", &error, format!("path={}", quoted(&upload.source_path)));
        return Err(error);
      }
    }
  }

  match expect_control(read_control(&mut recv).await?, "uploadsApplied")? {
    ControlMessage::UploadsApplied { count } if count == plan.uploads.len() => {
      logger.event("control:receive", format!("type=uploadsApplied count={count}"));
    }
    ControlMessage::UploadsApplied { count } => {
      return Err(format!("peer applied {count} uploads instead of {}", plan.uploads.len()));
    }
    _ => unreachable!(),
  }

  for download in &plan.downloads {
    match receive_file_logged(&connection, &cwd, download, Some(logger), "download").await {
      Ok((_, bytes)) => {
        result.transferred_bytes += bytes;
        result.transferred_files += 1;
      }
      Err(error) => {
        logger.error(
          "download:error",
          &error,
          format!("path={}", quoted(&download.target_path)),
        );
        return Err(error);
      }
    }
  }
  match expect_control(read_control(&mut recv).await?, "transfersComplete")? {
    ControlMessage::TransfersComplete { count } if count == plan.downloads.len() => {
      logger.event("control:receive", format!("type=transfersComplete count={count}"));
    }
    ControlMessage::TransfersComplete { count } => {
      return Err(format!("peer sent {count} downloads instead of {}", plan.downloads.len()));
    }
    _ => unreachable!(),
  }

  logger.event("scan:start", "side=final-local");
  let final_manifest = scan(cwd.clone()).await?;
  logger.manifest("final-local", &final_manifest);
  logger.event("control:send", "type=syncFinish");
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
  logger.event("control:receive", "type=syncComplete acknowledged=false");
  logger.manifest("final-remote", &remote_final);
  if acknowledged {
    return Err("peer sent a final acknowledgement before the client validated the manifest".to_string());
  }
  if !final_manifest.content_equals(&remote_final) {
    return Err("vault manifests still differ after transfer; no baseline was advanced".to_string());
  }
  logger.event("verify:manifest", "status=ok");
  write_baseline(&cwd, &peer.endpoint_id, &final_manifest)?;
  write_manifest(&cwd, &final_manifest)?;
  logger.event(
    "baseline:saved",
    format!("files={} peer_id={}", final_manifest.files.len(), short_peer_id(&peer.endpoint_id)),
  );
  logger.event("control:send", "type=syncComplete acknowledged=true");
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
  logger.event("connection:closed", "reason=sync-complete");
  Ok(result)
}

async fn server_sync_session(
  vault: VaultDescriptor,
  peer_id: String,
  open: SyncOpen,
  connection: Connection,
  send: iroh::endpoint::SendStream,
  recv: iroh::endpoint::RecvStream,
) -> R<()> {
  let cwd = PathBuf::from(&vault.path);
  let config = ensure_sync_files(&vault, "")?;
  let peer = config
    .peers
    .iter()
    .find(|peer| peer.endpoint_id == peer_id && peer.verified)
    .cloned()
    .ok_or_else(|| "Iroh endpoint is not paired for this vault.".to_string())?;
  if open.folder_id != config.folder_id || peer.folder_id != config.folder_id {
    return Err("Iroh endpoint is paired for another vault.".to_string());
  }
  let logger = SyncLogger::start("server", &open.device_name, &peer_id, &vault.name);
  let result = server_sync_session_logged(
    vault,
    peer_id,
    open,
    connection,
    send,
    recv,
    config,
    &logger,
  )
  .await;
  match &result {
    Ok(summary) => logger.complete(
      summary.transferred_files,
      summary.transferred_bytes,
      summary.conflicts.len(),
    ),
    Err(error) => logger.error("session:error", error, format!("duration_ms={}", logger.elapsed_ms())),
  }
  result.map(|_| ())
}

async fn server_sync_session_logged(
  vault: VaultDescriptor,
  peer_id: String,
  open: SyncOpen,
  connection: Connection,
  mut send: iroh::endpoint::SendStream,
  mut recv: iroh::endpoint::RecvStream,
  mut config: SyncConfig,
  logger: &SyncLogger,
) -> R<SessionResult> {
  let cwd = PathBuf::from(&vault.path);
  logger.manifest("remote-open", &open.manifest);
  logger.event("scan:start", "side=local");
  let local_manifest = scan(cwd.clone()).await?;
  logger.manifest("local", &local_manifest);
  let local_baseline = read_baseline(&cwd, &peer_id);
  logger.baseline(&local_baseline);
  logger.event("control:send", "type=syncHello");
  write_control(
    &mut send,
    &ControlMessage::SyncHello(SyncHello {
      device_name: vault.name.clone(),
      manifest: local_manifest.clone(),
      baseline: local_baseline.clone(),
    }),
  )
  .await?;
  let plan = match expect_control(read_control(&mut recv).await?, "syncPlan")? {
    ControlMessage::SyncPlan(plan) => plan,
    _ => unreachable!(),
  };
  logger.event("control:receive", "type=syncPlan");
  let baseline = common_baseline(&open.baseline, &local_baseline);
  let expected_plan = build_plan(
    &open.manifest,
    &local_manifest,
    &baseline,
    &peer_id,
    &config.device_id,
  );
  if plan != expected_plan {
    logger.error("plan:rejected", "peer plan differs from independently computed plan", "");
    write_control(
      &mut send,
      &ControlMessage::Error {
        message: "peer sync plan does not match the independently computed plan".to_string(),
      },
    )
    .await?;
    return Err("peer sync plan does not match the independently computed plan".to_string());
  }
  logger.event("plan:verified", "status=ok");
  logger.plan(&plan);
  log_conflicts(logger, &plan);

  preserve_paths_logged(&cwd, &plan.preserve_remote, Some(logger), "local")?;
  create_directories_logged(&cwd, &plan.create_dirs_remote, Some(logger), "local")?;
  delete_files_logged(&cwd, &plan.delete_files_remote, Some(logger), "local")?;
  delete_directories_logged(&cwd, &plan.delete_dirs_remote, Some(logger), "local")?;
  logger.event(
    "control:send",
    format!("type=readyForUploads count={}", plan.uploads.len()),
  );
  write_control(
    &mut send,
    &ControlMessage::ReadyForUploads {
      count: plan.uploads.len(),
    },
  )
  .await?;

  let mut transferred_bytes = 0_u64;
  for upload in &plan.uploads {
    match receive_file_logged(&connection, &cwd, upload, Some(logger), "receive-upload").await {
      Ok((_, bytes)) => transferred_bytes += bytes,
      Err(error) => {
        logger.error(
          "receive-upload:error",
          &error,
          format!("path={}", quoted(&upload.target_path)),
        );
        return Err(error);
      }
    }
  }
  logger.event(
    "control:send",
    format!("type=uploadsApplied count={}", plan.uploads.len()),
  );
  write_control(
    &mut send,
    &ControlMessage::UploadsApplied {
      count: plan.uploads.len(),
    },
  )
  .await?;

  for download in &plan.downloads {
    match send_file_logged(&connection, &cwd, download, Some(logger), "send-download").await {
      Ok(bytes) => transferred_bytes += bytes,
      Err(error) => {
        logger.error(
          "send-download:error",
          &error,
          format!("path={}", quoted(&download.source_path)),
        );
        return Err(error);
      }
    }
  }
  logger.event(
    "control:send",
    format!("type=transfersComplete count={}", plan.downloads.len()),
  );
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
  logger.event("control:receive", "type=syncFinish");
  logger.manifest("final-remote", &client_final);
  logger.event("scan:start", "side=final-local");
  let final_manifest = scan(cwd.clone()).await?;
  logger.manifest("final-local", &final_manifest);
  if !final_manifest.content_equals(&client_final) {
    logger.error("verify:manifest", "vault manifests differ after applying the sync plan", "status=failed");
    write_control(
      &mut send,
      &ControlMessage::Error {
        message: "vault manifests differ after applying the sync plan".to_string(),
      },
    )
    .await?;
    return Err("vault manifests differ after applying the sync plan".to_string());
  }
  logger.event("verify:manifest", "status=ok");
  write_baseline(&cwd, &peer_id, &final_manifest)?;
  write_manifest(&cwd, &final_manifest)?;
  logger.event(
    "baseline:saved",
    format!("files={} peer_id={}", final_manifest.files.len(), short_peer_id(&peer_id)),
  );
  logger.event("control:send", "type=syncComplete acknowledged=false");
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
  logger.event(
    "control:receive",
    format!("type=syncComplete acknowledged={acknowledged}"),
  );
  if !acknowledged || !final_manifest.content_equals(&ack_manifest) {
    return Err("peer did not acknowledge the verified final manifest".to_string());
  }
  logger.event("verify:acknowledgement", "status=ok");

  if let Some(peer) = config.peers.iter_mut().find(|peer| peer.endpoint_id == peer_id) {
    peer.last_seen_at = now();
  }
  config.first_run_done = true;
  config.updated_at = now();
  write_config(&cwd, &config)?;
  let mut state = read_state(&cwd);
  state.last_run_at = now();
  state.last_error.clear();
  state.transferred_files = (plan.uploads.len() + plan.downloads.len()) as u64;
  state.transferred_bytes = transferred_bytes;
  state.conflicts = plan
    .conflicts
    .iter()
    .map(|path| json!({ "path": path, "resolution": "preserve-both" }))
    .collect();
  write_state(&cwd, &state)?;
  let mut history = read_history(&cwd);
  history.push(SyncHistoryRecord {
    id: format!("incoming-{}", now()),
    operation: "incoming-sync".to_string(),
    status: STATUS_DONE.to_string(),
    updated_at: now(),
    error: String::new(),
  });
  write_history(&cwd, &history)?;

  send.finish().map_err(|error| error.to_string())?;
  connection.closed().await;
  logger.event("connection:closed", "reason=peer-closed-after-ack");
  Ok(SessionResult {
    conflicts: plan.conflicts,
    transferred_files: (plan.uploads.len() + plan.downloads.len()) as u64,
    transferred_bytes,
  })
}

async fn handle_pair_request(
  app: &AppHandle,
  connection: Connection,
  request: PairRequest,
  mut send: iroh::endpoint::SendStream,
) -> R<()> {
  log_global(
    "pairing:incoming",
    format!(
      "invite_id={} peer={} peer_id={}",
      request.invite_id,
      quoted(&request.device_name),
      short_peer_id(&connection.remote_id().to_string())
    ),
  );
  if request.endpoint_addr.id != connection.remote_id() {
    return Err("pair request endpoint address does not match authenticated Iroh identity".to_string());
  }
  let vaults = super::config::read_config(app)?.vaults;
  let mut selected = None;
  for vault in vaults {
    let cwd = PathBuf::from(&vault.path);
    let Some(config) = read_config(&cwd) else {
      continue;
    };
    if config.folder_id != request.folder_id {
      continue;
    }
    if config.pending_invites.iter().any(|invite| {
      invite.id == request.invite_id
        && invite.expires_at > epoch_seconds()
        && invite.token_hash == token_hash(&request.invite_token)
    }) {
      selected = Some((vault, config));
      break;
    }
  }
  let (vault, mut config) = selected.ok_or_else(|| "pairing invite is invalid or expired".to_string())?;
  let cwd = PathBuf::from(&vault.path);
  config.pending_invites.retain(|invite| invite.id != request.invite_id);
  let paired_folder_id = config.folder_id.clone();
  let peer_name = request.device_name.clone();
  let peer_id = request.endpoint_addr.id.to_string();
  upsert_peer(
    &mut config.peers,
    peer_from_pair(
      request.endpoint_addr,
      request.device_name,
      paired_folder_id,
    ),
  );
  config.updated_at = now();
  write_config(&cwd, &config)?;

  let state = app.state::<IrohSyncState>();
  let runtime = state.runtime(app).await?;
  write_control(
    &mut send,
    &ControlMessage::PairAccepted(PairAccepted {
      folder_id: config.folder_id,
      folder_label: config.folder_label,
      device_name: vault.name.clone(),
      endpoint_addr: runtime.endpoint_addr(),
    }),
  )
  .await?;
  send.finish().map_err(|error| error.to_string())?;
  connection.closed().await;
  log_global(
    "pairing:accepted",
    format!(
      "vault={} peer={} peer_id={}",
      quoted(&vault.name),
      quoted(&peer_name),
      short_peer_id(&peer_id)
    ),
  );
  Ok(())
}

pub async fn handle_incoming_connection(app: AppHandle, connection: Connection) -> R<()> {
  let state = app.state::<IrohSyncState>();
  let _operation = state.try_lock_operation()?;
  let (send, mut recv) = connection
    .accept_bi()
    .await
    .map_err(|error| error.to_string())?;
  let first = read_control(&mut recv).await?;
  match first {
    ControlMessage::PairRequest(request) => {
      log_global("incoming:dispatch", "type=pairRequest");
      handle_pair_request(&app, connection, request, send).await
    }
    ControlMessage::SyncOpen(open) => {
      let peer_id = connection.remote_id().to_string();
      log_global(
        "incoming:dispatch",
        format!(
          "type=syncOpen peer={} peer_id={}",
          quoted(&open.device_name),
          short_peer_id(&peer_id)
        ),
      );
      let vault = super::config::read_config(&app)?
        .vaults
        .into_iter()
        .find(|vault| {
          read_config(Path::new(&vault.path))
            .is_some_and(|config| config.folder_id == open.folder_id)
        })
        .ok_or_else(|| "No local vault matches this sync request.".to_string())?;
      server_sync_session(vault, peer_id, open, connection, send, recv).await
    }
    _ => {
      let error = "first ElephantNote Iroh message must be pairRequest or syncOpen".to_string();
      log_global_error("incoming:rejected", &error);
      Err(error)
    }
  }
}

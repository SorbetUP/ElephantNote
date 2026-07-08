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

  let connection = runtime.connect(remote_addr.clone()).await?;
  if connection.remote_id() != remote_addr.id {
    return Err("Iroh peer identity did not match the invite.".to_string());
  }
  let (mut send, mut recv) = connection
    .open_bi()
    .await
    .map_err(|error| error.to_string())?;
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

  let cwd = PathBuf::from(&vault.path);
  let mut config = ensure_sync_files(&vault, &runtime.endpoint_id().to_string())?;
  config.folder_id = folder_id.to_string();
  config.folder_label = folder_label.to_string();
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
  let cwd = PathBuf::from(&vault.path);
  let local_manifest = scan(cwd.clone()).await?;
  let local_baseline = read_baseline(&cwd, &peer.endpoint_id);
  let connection = connect_peer(runtime, peer).await?;
  if connection.remote_id().to_string() != peer.endpoint_id {
    return Err("connected Iroh identity does not match paired device".to_string());
  }
  let (mut send, mut recv) = connection
    .open_bi()
    .await
    .map_err(|error| error.to_string())?;
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
  let baseline = common_baseline(&local_baseline, &hello.baseline);
  let plan = build_plan(
    &local_manifest,
    &hello.manifest,
    &baseline,
    &runtime.endpoint_id().to_string(),
    &peer.endpoint_id,
  );

  preserve_paths(&cwd, &plan.preserve_local)?;
  create_directories(&cwd, &plan.create_dirs_local)?;
  delete_files(&cwd, &plan.delete_files_local)?;
  delete_directories(&cwd, &plan.delete_dirs_local)?;
  write_control(&mut send, &ControlMessage::SyncPlan(plan.clone())).await?;

  match expect_control(read_control(&mut recv).await?, "readyForUploads")? {
    ControlMessage::ReadyForUploads { count } if count == plan.uploads.len() => {}
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
    result.transferred_bytes += send_file(&connection, &cwd, upload).await?;
    result.transferred_files += 1;
  }

  match expect_control(read_control(&mut recv).await?, "uploadsApplied")? {
    ControlMessage::UploadsApplied { count } if count == plan.uploads.len() => {}
    ControlMessage::UploadsApplied { count } => {
      return Err(format!("peer applied {count} uploads instead of {}", plan.uploads.len()));
    }
    _ => unreachable!(),
  }

  for _ in 0..plan.downloads.len() {
    let (_, bytes) = receive_file(&connection, &cwd).await?;
    result.transferred_bytes += bytes;
    result.transferred_files += 1;
  }
  match expect_control(read_control(&mut recv).await?, "transfersComplete")? {
    ControlMessage::TransfersComplete { count } if count == plan.downloads.len() => {}
    ControlMessage::TransfersComplete { count } => {
      return Err(format!("peer sent {count} downloads instead of {}", plan.downloads.len()));
    }
    _ => unreachable!(),
  }

  let final_manifest = scan(cwd.clone()).await?;
  write_control(
    &mut send,
    &ControlMessage::SyncFinish {
      manifest: final_manifest.clone(),
    },
  )
  .await?;
  let remote_final = match expect_control(read_control(&mut recv).await?, "syncComplete")? {
    ControlMessage::SyncComplete { manifest } => manifest,
    _ => unreachable!(),
  };
  if !final_manifest.content_equals(&remote_final) {
    return Err("vault manifests still differ after transfer; no baseline was advanced".to_string());
  }
  write_baseline(&cwd, &peer.endpoint_id, &final_manifest)?;
  write_manifest(&cwd, &final_manifest)?;
  send.finish().map_err(|error| error.to_string())?;
  Ok(result)
}

async fn server_sync_session(
  vault: VaultDescriptor,
  peer_id: String,
  open: SyncOpen,
  connection: Connection,
  mut send: iroh::endpoint::SendStream,
  mut recv: iroh::endpoint::RecvStream,
) -> R<()> {
  let cwd = PathBuf::from(&vault.path);
  let mut config = ensure_sync_files(&vault, "")?;
  let peer = config
    .peers
    .iter()
    .find(|peer| peer.endpoint_id == peer_id && peer.verified)
    .cloned()
    .ok_or_else(|| "Iroh endpoint is not paired for this vault.".to_string())?;
  if open.folder_id != config.folder_id || peer.folder_id != config.folder_id {
    return Err("Iroh endpoint is paired for another vault.".to_string());
  }

  let local_manifest = scan(cwd.clone()).await?;
  let local_baseline = read_baseline(&cwd, &peer_id);
  write_control(
    &mut send,
    &ControlMessage::SyncHello(SyncHello {
      device_name: vault.name.clone(),
      manifest: local_manifest,
      baseline: local_baseline,
    }),
  )
  .await?;
  let plan = match expect_control(read_control(&mut recv).await?, "syncPlan")? {
    ControlMessage::SyncPlan(plan) => plan,
    _ => unreachable!(),
  };

  preserve_paths(&cwd, &plan.preserve_remote)?;
  create_directories(&cwd, &plan.create_dirs_remote)?;
  delete_files(&cwd, &plan.delete_files_remote)?;
  delete_directories(&cwd, &plan.delete_dirs_remote)?;
  write_control(
    &mut send,
    &ControlMessage::ReadyForUploads {
      count: plan.uploads.len(),
    },
  )
  .await?;

  let mut transferred_bytes = 0_u64;
  for _ in 0..plan.uploads.len() {
    let (_, bytes) = receive_file(&connection, &cwd).await?;
    transferred_bytes += bytes;
  }
  write_control(
    &mut send,
    &ControlMessage::UploadsApplied {
      count: plan.uploads.len(),
    },
  )
  .await?;

  for download in &plan.downloads {
    transferred_bytes += send_file(&connection, &cwd, download).await?;
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
  let final_manifest = scan(cwd.clone()).await?;
  if !final_manifest.content_equals(&client_final) {
    write_control(
      &mut send,
      &ControlMessage::Error {
        message: "vault manifests differ after applying the sync plan".to_string(),
      },
    )
    .await?;
    return Err("vault manifests differ after applying the sync plan".to_string());
  }
  write_baseline(&cwd, &peer_id, &final_manifest)?;
  write_manifest(&cwd, &final_manifest)?;
  write_control(
    &mut send,
    &ControlMessage::SyncComplete {
      manifest: final_manifest,
    },
  )
  .await?;
  send.finish().map_err(|error| error.to_string())?;

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
  write_history(&cwd, &history)
}

async fn handle_pair_request(
  app: &AppHandle,
  connection: Connection,
  request: PairRequest,
  mut send: iroh::endpoint::SendStream,
) -> R<()> {
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
      device_name: vault.name,
      endpoint_addr: runtime.endpoint_addr(),
    }),
  )
  .await?;
  send.finish().map_err(|error| error.to_string())
}

pub async fn handle_incoming_connection(app: AppHandle, connection: Connection) -> R<()> {
  let state = app.state::<IrohSyncState>();
  let _operation = state.lock_operation().await;
  let (send, mut recv) = connection
    .accept_bi()
    .await
    .map_err(|error| error.to_string())?;
  let first = read_control(&mut recv).await?;
  match first {
    ControlMessage::PairRequest(request) => {
      handle_pair_request(&app, connection, request, send).await
    }
    ControlMessage::SyncOpen(open) => {
      let peer_id = connection.remote_id().to_string();
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
    _ => Err("first ElephantNote Iroh message must be pairRequest or syncOpen".to_string()),
  }
}


pub fn sync_status_iroh(vault: Option<VaultDescriptor>, endpoint_id: &str) -> R<Value> {
  let Some(vault) = vault else {
    return Ok(no_active_status(endpoint_id));
  };
  let cwd = PathBuf::from(&vault.path);
  let config = ensure_sync_files(&vault, endpoint_id)?;
  Ok(status_value(
    &vault,
    &read_queue(&cwd),
    &read_history(&cwd),
    &read_state(&cwd),
    &config,
  ))
}

pub fn sync_enqueue_iroh(
  vault: VaultDescriptor,
  endpoint_id: &str,
  operation: String,
  payload: Option<Value>,
) -> R<Value> {
  if !valid_operation(&operation) {
    return Err(format!("Unknown sync operation: {operation}."));
  }
  let cwd = PathBuf::from(&vault.path);
  let config = ensure_sync_files(&vault, endpoint_id)?;
  let mut queue = read_queue(&cwd);
  queue.retain(|item| item.status == STATUS_QUEUED);
  queue.push(queue_item(
    &operation,
    normalize_payload(payload),
    queue.len(),
  ));
  write_queue(&cwd, &queue)?;
  crate::sync::logging::log_global(
    "queue:add",
    format!(
      "vault={} operation={} queued={}",
      serde_json::to_string(&vault.name).unwrap_or_default(),
      operation,
      queue.len()
    ),
  );
  Ok(status_value(
    &vault,
    &queue,
    &read_history(&cwd),
    &read_state(&cwd),
    &config,
  ))
}

async fn run_operation(
  operation: &str,
  vault: &VaultDescriptor,
  cwd: &Path,
  config: &mut SyncConfig,
  runtime: &IrohRuntime,
) -> R<SessionResult> {
  match operation {
    OPERATION_INIT | OPERATION_SNAPSHOT => {
      let manifest = scan(cwd.to_path_buf()).await?;
      crate::sync::logging::log_global(
        "snapshot",
        format!(
          "operation={operation} files={} directories={} bytes={}",
          manifest.files.len(),
          manifest.directories.len(),
          manifest.files.values().map(|record| record.size).sum::<u64>()
        ),
      );
      write_manifest(cwd, &manifest)?;
      Ok(SessionResult::default())
    }
    OPERATION_PULL | OPERATION_PUSH | OPERATION_SYNC => {
      if config.peers.is_empty() {
        return Err("No paired Iroh device. Create or accept a sync invite first.".to_string());
      }
      let mut aggregate = SessionResult::default();
      for peer in config.peers.clone() {
        crate::sync::logging::log_global(
          "peer:start",
          format!(
            "operation={operation} peer={} peer_id={}",
            serde_json::to_string(&peer.name).unwrap_or_default(),
            crate::sync::logging::short_peer_id(&peer.endpoint_id)
          ),
        );
        let session = client_sync_peer(vault, config, &peer, runtime).await?;
        crate::sync::logging::log_global(
          "peer:complete",
          format!(
            "operation={operation} peer={} files={} bytes={} conflicts={}",
            serde_json::to_string(&peer.name).unwrap_or_default(),
            session.transferred_files,
            session.transferred_bytes,
            session.conflicts.len()
          ),
        );
        aggregate.conflicts.extend(session.conflicts);
        aggregate.transferred_files += session.transferred_files;
        aggregate.transferred_bytes += session.transferred_bytes;
        if let Some(saved_peer) = config
          .peers
          .iter_mut()
          .find(|saved_peer| saved_peer.endpoint_id == peer.endpoint_id)
        {
          saved_peer.last_seen_at = now();
        }
      }
      Ok(aggregate)
    }
    _ => Err(format!("Unknown sync operation: {operation}.")),
  }
}

pub async fn sync_run_iroh(
  vault: VaultDescriptor,
  payload_by_operation: Option<Value>,
  runtime: Arc<IrohRuntime>,
) -> R<Value> {
  let run_started = std::time::Instant::now();
  let cwd = PathBuf::from(&vault.path);
  let endpoint_id = runtime.endpoint_id().to_string();
  let mut config = ensure_sync_files(&vault, &endpoint_id)?;
  let payload = normalize_payload(payload_by_operation);
  let mut queue = read_queue(&cwd);
  queue.retain(|item| item.status == STATUS_QUEUED);
  if queue.is_empty() {
    for operation in planned_operations(&payload, !config.peers.is_empty()) {
      let item_payload = operation_payload(&payload, &operation);
      queue.push(queue_item(&operation, item_payload, queue.len()));
    }
  }

  crate::sync::logging::log_global(
    "run:start",
    format!(
      "vault={} device_id={} peers={} operations={}",
      serde_json::to_string(&vault.name).unwrap_or_default(),
      crate::sync::logging::short_peer_id(&endpoint_id),
      config.peers.len(),
      queue
        .iter()
        .map(|item| item.operation.as_str())
        .collect::<Vec<_>>()
        .join(",")
    ),
  );

  let mut history = read_history(&cwd);
  let mut state = read_state(&cwd);
  let pending = std::mem::take(&mut queue);
  let mut remaining = Vec::new();
  let mut all_conflicts = Vec::new();
  let mut total_files = 0_u64;
  let mut total_bytes = 0_u64;
  let mut last_error = String::new();

  for mut item in pending {
    if item.status != STATUS_QUEUED {
      continue;
    }
    let operation_started = std::time::Instant::now();
    crate::sync::logging::log_global(
      "operation:start",
      format!("id={} operation={}", item.id, item.operation),
    );
    let result = run_operation(
      &item.operation,
      &vault,
      &cwd,
      &mut config,
      &runtime,
    )
    .await;

    item.updated_at = now();
    match result {
      Ok(session) => {
        item.status = STATUS_DONE.to_string();
        item.error.clear();
        crate::sync::logging::log_global(
          "operation:complete",
          format!(
            "id={} operation={} files={} bytes={} conflicts={} duration_ms={}",
            item.id,
            item.operation,
            session.transferred_files,
            session.transferred_bytes,
            session.conflicts.len(),
            operation_started.elapsed().as_millis()
          ),
        );
        all_conflicts.extend(session.conflicts);
        total_files += session.transferred_files;
        total_bytes += session.transferred_bytes;
      }
      Err(error) => {
        item.status = STATUS_ERROR.to_string();
        item.error = error.clone();
        crate::sync::logging::log_global_error(
          "operation:error",
          format!(
            "id={} operation={} duration_ms={} error={}",
            item.id,
            item.operation,
            operation_started.elapsed().as_millis(),
            serde_json::to_string(&error).unwrap_or_default()
          ),
        );
        last_error = error;
      }
    }
    history.push(SyncHistoryRecord {
      id: item.id.clone(),
      operation: item.operation.clone(),
      status: item.status.clone(),
      updated_at: item.updated_at.clone(),
      error: item.error.clone(),
    });
    if item.status != STATUS_DONE {
      remaining.push(item);
    }
  }

  config.first_run_done = last_error.is_empty();
  config.updated_at = now();
  state.last_run_at = now();
  state.transferred_files = total_files;
  state.transferred_bytes = total_bytes;
  state.conflicts = all_conflicts
    .iter()
    .map(|path| json!({ "path": path, "resolution": "preserve-both" }))
    .collect();
  // Preserved conflicts are a successful, lossless result and are reported
  // separately through `conflicts`. Only an actual failed operation belongs in
  // `lastError`, which drives the toolbar's red error indicator.
  state.last_error = last_error;
  write_config(&cwd, &config)?;
  write_queue(&cwd, &remaining)?;
  write_history(&cwd, &history)?;
  write_state(&cwd, &state)?;
  let status = if state.last_error.is_empty() { "ok" } else { "error" };
  crate::sync::logging::log_global(
    "run:complete",
    format!(
      "vault={} status={status} files={total_files} bytes={total_bytes} conflicts={} remaining={} duration_ms={}",
      serde_json::to_string(&vault.name).unwrap_or_default(),
      all_conflicts.len(),
      remaining.len(),
      run_started.elapsed().as_millis()
    ),
  );
  Ok(status_value(&vault, &remaining, &history, &state, &config))
}

pub fn sync_status(vault: Option<VaultDescriptor>) -> R<Value> {
  sync_status_iroh(vault, "")
}

pub fn sync_enqueue(
  vault: VaultDescriptor,
  operation: String,
  payload: Option<Value>,
) -> R<Value> {
  sync_enqueue_iroh(vault, "", operation, payload)
}

pub fn sync_run(vault: VaultDescriptor, _payload_by_operation: Option<Value>) -> R<Value> {
  let cwd = PathBuf::from(&vault.path);
  let config = ensure_sync_files(&vault, "")?;
  let mut state = read_state(&cwd);
  state.last_error = "The Iroh sync command must be called through the Tauri async runtime.".to_string();
  write_state(&cwd, &state)?;
  Ok(status_value(
    &vault,
    &read_queue(&cwd),
    &read_history(&cwd),
    &state,
    &config,
  ))
}

pub fn create_sync_plan_value(payload_by_operation: Value) -> Value {
  let payload = payload_by_operation
    .is_object()
    .then_some(payload_by_operation)
    .unwrap_or_else(|| json!({}));
  let operations = planned_operations(&payload, false);
  json!({
    "backend": BACKEND_IROH,
    "externalDependencyFree": true,
    "requiresExternalBinary": false,
    "operations": operations,
    "interaction": { "primaryAction": "prepare-iroh-sync", "userFriendly": true, "cloudRequired": false }
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_dir(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-iroh-sync-{name}-{}-{}",
      std::process::id(),
      SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  fn vault(path: &Path) -> VaultDescriptor {
    VaultDescriptor {
      id: "test".to_string(),
      name: "Test".to_string(),
      path: path.to_string_lossy().to_string(),
      icon: String::new(),
      last_opened_at: "0".to_string(),
    }
  }

  #[test]
  fn config_stores_only_invite_hash() {
    let root = temp_dir("invite-hash");
    fs::create_dir_all(&root).unwrap();
    let mut config = ensure_sync_files(&vault(&root), "endpoint").unwrap();
    let token = random_token();
    config.pending_invites.push(PendingInvite {
      id: "invite".to_string(),
      token_hash: token_hash(&token),
      expires_at: epoch_seconds() + 60,
    });
    write_config(&root, &config).unwrap();
    let raw = fs::read_to_string(sync_path(&root, SYNC_CONFIG_FILE)).unwrap();
    assert!(!raw.contains(&token));
    assert!(raw.contains(&token_hash(&token)));
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn status_reports_iroh_backend() {
    let root = temp_dir("status");
    fs::create_dir_all(&root).unwrap();
    let status = sync_status_iroh(Some(vault(&root)), "endpoint").unwrap();
    assert_eq!(status["backend"], BACKEND_IROH);
    assert_eq!(status["capabilities"]["peerToPeer"], true);
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn enqueue_discards_terminal_queue_entries_but_keeps_history_separate() {
    let root = temp_dir("queue-cleanup");
    fs::create_dir_all(&root).unwrap();
    let descriptor = vault(&root);
    ensure_sync_files(&descriptor, "endpoint").unwrap();
    let mut queue = vec![queue_item(OPERATION_SYNC, json!({}), 0)];
    queue[0].status = STATUS_ERROR.to_string();
    queue[0].error = "old failure".to_string();
    write_queue(&root, &queue).unwrap();

    let status = sync_enqueue_iroh(
      descriptor,
      "endpoint",
      OPERATION_SYNC.to_string(),
      Some(json!({})),
    )
    .unwrap();
    let saved = read_queue(&root);
    assert_eq!(saved.len(), 1);
    assert_eq!(saved[0].status, STATUS_QUEUED);
    assert_eq!(status["queued"].as_u64(), Some(1));
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn sync_plan_is_external_binary_free() {
    let plan = create_sync_plan_value(json!({}));
    assert_eq!(plan["backend"], BACKEND_IROH);
    assert_eq!(plan["requiresExternalBinary"], false);
  }
}

#[cfg(test)]
mod iroh_two_endpoint_tests {
  use super::*;
  use iroh::endpoint::{presets, Accepting, Connection};
  use iroh::protocol::{AcceptError, ProtocolHandler, Router};
  use iroh::{Endpoint, EndpointAddr};
  use std::fmt;
  use std::io;
  use std::path::{Path, PathBuf};
  use std::sync::{Arc, Mutex};
  use std::time::Duration;

  #[derive(Clone)]
  struct TestVaultProtocol {
    vault: VaultDescriptor,
    events: Arc<Mutex<Vec<String>>>,
  }

  impl fmt::Debug for TestVaultProtocol {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
      formatter
        .debug_struct("TestVaultProtocol")
        .field("vault", &self.vault.path)
        .finish()
    }
  }

  impl TestVaultProtocol {
    fn record(&self, event: impl Into<String>) {
      self.events.lock().unwrap().push(event.into());
    }

    async fn handle(&self, connection: Connection) -> Result<(), String> {
      self.record("accept:start");
      let peer_id = connection.remote_id().to_string();
      let (send, mut recv) = connection
        .accept_bi()
        .await
        .map_err(|error| format!("accept_bi failed: {error}"))?;
      self.record("accept_bi:ok");
      let first = read_control(&mut recv)
        .await
        .map_err(|error| format!("read first control failed: {error}"))?;
      self.record("sync_open:read");
      let ControlMessage::SyncOpen(open) = first else {
        return Err("test server expected syncOpen".to_string());
      };
      server_sync_session(
        self.vault.clone(),
        peer_id,
        open,
        connection,
        send,
        recv,
      )
      .await
      .map_err(|error| format!("server sync session failed: {error}"))
    }
  }

  impl ProtocolHandler for TestVaultProtocol {
    async fn on_accepting(&self, accepting: Accepting) -> Result<Connection, AcceptError> {
      self.record("on_accepting:start");
      match accepting.await {
        Ok(connection) => {
          self.record("on_accepting:ok");
          Ok(connection)
        }
        Err(error) => {
          self.record(format!("on_accepting:error:{error}"));
          Err(error.into())
        }
      }
    }

    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
      match self.handle(connection).await {
        Ok(()) => {
          self.record("accept:done");
          Ok(())
        }
        Err(error) => {
          self.record(format!("accept:error:{error}"));
          Err(AcceptError::from_err(io::Error::other(error)))
        }
      }
    }
  }

  fn temp_root() -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-iroh-two-endpoint-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  fn descriptor(path: &Path, name: &str) -> VaultDescriptor {
    VaultDescriptor {
      id: "shared-smoke-vault".to_string(),
      name: name.to_string(),
      path: path.to_string_lossy().to_string(),
      icon: String::new(),
      last_opened_at: "0".to_string(),
    }
  }

  fn configure_peer(
    vault: &VaultDescriptor,
    local_endpoint: &Endpoint,
    remote_addr: EndpointAddr,
    remote_name: &str,
  ) -> SyncConfig {
    let cwd = PathBuf::from(&vault.path);
    let mut config = ensure_sync_files(vault, &local_endpoint.id().to_string()).unwrap();
    config.folder_id = "vault-shared-smoke-vault".to_string();
    config.peers = vec![PeerConfig {
      endpoint_id: remote_addr.id.to_string(),
      endpoint_addr: Some(remote_addr),
      name: remote_name.to_string(),
      folder_id: config.folder_id.clone(),
      verified: true,
      paired_at: now(),
      last_seen_at: String::new(),
    }];
    write_config(&cwd, &config).unwrap();
    config
  }

  async fn run_client_session(
    vault: &VaultDescriptor,
    config: &SyncConfig,
    runtime: &IrohRuntime,
  ) -> Result<SessionResult, String> {
    tokio::time::timeout(
      Duration::from_secs(20),
      client_sync_peer(vault, config, &config.peers[0], runtime),
    )
    .await
    .map_err(|_| "Iroh synchronization timed out".to_string())?
  }

  fn expect_session(
    result: Result<SessionResult, String>,
    server_events: &Arc<Mutex<Vec<String>>>,
  ) -> SessionResult {
    match result {
      Ok(result) => result,
      Err(error) => {
        std::thread::sleep(Duration::from_millis(100));
        let events = server_events.lock().unwrap().clone();
        panic!("Iroh synchronization failed: {error}; server events: {events:?}");
      }
    }
  }

  async fn loopback_endpoint() -> Endpoint {
    Endpoint::builder(presets::Minimal)
      .bind_addr("127.0.0.1:0")
      .unwrap()
      .bind()
      .await
      .unwrap()
  }

  fn collect_archive_contents(directory: &Path, contents: &mut Vec<String>) {
    if !directory.exists() {
      return;
    }
    for entry in std::fs::read_dir(directory).unwrap() {
      let path = entry.unwrap().path();
      let metadata = std::fs::symlink_metadata(&path).unwrap();
      if metadata.is_dir() && !metadata.file_type().is_symlink() {
        collect_archive_contents(&path, contents);
      } else if metadata.is_file() {
        contents.push(std::fs::read_to_string(path).unwrap());
      }
    }
  }

  fn archive_contents(root: &Path) -> Vec<String> {
    let mut contents = Vec::new();
    collect_archive_contents(&root.join(CONFLICT_ARCHIVE_DIR), &mut contents);
    contents.sort();
    contents
  }

  #[tokio::test(flavor = "multi_thread", worker_threads = 4)]
  async fn two_real_iroh_endpoints_exchange_modify_and_delete_vault_content() {
    let root = temp_root();
    let root_a = root.join("device-a");
    let root_b = root.join("device-b");
    std::fs::create_dir_all(root_a.join(".config/provider")).unwrap();
    std::fs::create_dir_all(root_b.join(".config/provider")).unwrap();
    std::fs::write(root_a.join("A.md"), "from device A").unwrap();
    std::fs::write(root_b.join("B.md"), "from device B").unwrap();
    std::fs::write(
      root_a.join(".config/provider/provider.json"),
      "device-a-config",
    )
    .unwrap();
    std::fs::write(
      root_b.join(".config/provider/provider.json"),
      "device-b-config",
    )
    .unwrap();

    let vault_a = descriptor(&root_a, "Device A");
    let vault_b = descriptor(&root_b, "Device B");
    let endpoint_a = loopback_endpoint().await;
    let endpoint_b = loopback_endpoint().await;
    let addr_a = crate::sync::wait_for_endpoint_addr(&endpoint_a).await.unwrap();
    let addr_b = crate::sync::wait_for_endpoint_addr(&endpoint_b).await.unwrap();
    let server_events = Arc::new(Mutex::new(Vec::new()));
    let client_events = Arc::new(Mutex::new(Vec::new()));

    let server_router = Router::builder(endpoint_b.clone())
      .accept(
        crate::sync::protocol::ALPN,
        TestVaultProtocol {
          vault: vault_b.clone(),
          events: server_events.clone(),
        },
      )
      .spawn();
    let client_router = Router::builder(endpoint_a.clone())
      .accept(
        crate::sync::protocol::ALPN,
        TestVaultProtocol {
          vault: vault_a.clone(),
          events: client_events,
        },
      )
      .spawn();
    tokio::task::yield_now().await;
    assert!(!server_router.is_shutdown());
    assert!(!client_router.is_shutdown());
    let runtime_a = Arc::new(IrohRuntime::from_test_parts(endpoint_a.clone(), client_router));

    configure_peer(&vault_a, &endpoint_a, addr_b, "Device B");
    let _config_b = configure_peer(&vault_b, &endpoint_b, addr_a, "Device A");

    // Exercise the exact async command path used by Settings and the toolbar,
    // including run/operation logs, queue handling, state persistence, and the
    // real Iroh client/server exchange.
    let first_status = tokio::time::timeout(
      Duration::from_secs(20),
      sync_run_iroh(
        vault_a.clone(),
        Some(json!({ "sync": {} })),
        runtime_a.clone(),
      ),
    )
    .await
    .expect("application sync command timed out")
    .expect("application sync command failed");
    assert_eq!(first_status["transferredFiles"].as_u64(), Some(2));
    assert_eq!(first_status["transferredBytes"].as_u64(), Some(26));
    assert_eq!(first_status["lastError"].as_str(), Some(""));

    let config_a = read_config(&root_a).unwrap();
    assert_eq!(std::fs::read_to_string(root_a.join("B.md")).unwrap(), "from device B");
    assert_eq!(std::fs::read_to_string(root_b.join("A.md")).unwrap(), "from device A");
    assert_eq!(
      std::fs::read_to_string(root_a.join(".config/provider/provider.json")).unwrap(),
      "device-a-config"
    );
    assert_eq!(
      std::fs::read_to_string(root_b.join(".config/provider/provider.json")).unwrap(),
      "device-b-config"
    );

    std::fs::write(root_a.join("A.md"), "updated on device A").unwrap();
    let second = expect_session(
      run_client_session(&vault_a, &config_a, runtime_a.as_ref()).await,
      &server_events,
    );
    assert_eq!(second.transferred_files, 1);
    assert_eq!(
      std::fs::read_to_string(root_b.join("A.md")).unwrap(),
      "updated on device A"
    );

    std::fs::remove_file(root_a.join("B.md")).unwrap();
    let third = expect_session(
      run_client_session(&vault_a, &config_a, runtime_a.as_ref()).await,
      &server_events,
    );
    assert_eq!(third.transferred_files, 0);
    assert!(!root_b.join("B.md").exists());

    std::fs::write(root_a.join("A.md"), "concurrent version A").unwrap();
    std::fs::write(root_b.join("A.md"), "concurrent version B").unwrap();
    let fourth = expect_session(
      run_client_session(&vault_a, &config_a, runtime_a.as_ref()).await,
      &server_events,
    );
    assert_eq!(fourth.conflicts, vec!["A.md"]);
    assert_eq!(fourth.transferred_files, 2);

    let main_a = std::fs::read_to_string(root_a.join("A.md")).unwrap();
    let main_b = std::fs::read_to_string(root_b.join("A.md")).unwrap();
    assert_eq!(main_a, main_b);
    let archived_a = archive_contents(&root_a);
    let archived_b = archive_contents(&root_b);
    assert_eq!(archived_a, archived_b);
    assert_eq!(archived_a.len(), 1);
    let mut preserved_versions = vec![main_a, archived_a[0].clone()];
    preserved_versions.sort();
    assert_eq!(
      preserved_versions,
      vec![
        "concurrent version A".to_string(),
        "concurrent version B".to_string(),
      ]
    );

    let manifest_a = scan_vault(&root_a).unwrap();
    let manifest_b = scan_vault(&root_b).unwrap();
    assert!(manifest_a.content_equals(&manifest_b));
    assert!(!manifest_a.files.contains_key(".config/provider/provider.json"));
    assert!(!manifest_a.files.keys().any(|path| path.starts_with(".conflit/")));

    drop(runtime_a);
    server_router.shutdown().await.unwrap();
    let _ = std::fs::remove_dir_all(root);
  }
}

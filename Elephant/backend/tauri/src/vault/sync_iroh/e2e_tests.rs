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
    let runtime_a = IrohRuntime::from_test_parts(endpoint_a.clone(), client_router);

    let config_a = configure_peer(&vault_a, &endpoint_a, addr_b, "Device B");
    let _config_b = configure_peer(&vault_b, &endpoint_b, addr_a, "Device A");

    let first = expect_session(
      run_client_session(&vault_a, &config_a, &runtime_a).await,
      &server_events,
    );
    assert_eq!(first.transferred_files, 2);
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
      run_client_session(&vault_a, &config_a, &runtime_a).await,
      &server_events,
    );
    assert_eq!(second.transferred_files, 1);
    assert_eq!(
      std::fs::read_to_string(root_b.join("A.md")).unwrap(),
      "updated on device A"
    );

    std::fs::remove_file(root_a.join("B.md")).unwrap();
    let third = expect_session(
      run_client_session(&vault_a, &config_a, &runtime_a).await,
      &server_events,
    );
    assert_eq!(third.transferred_files, 0);
    assert!(!root_b.join("B.md").exists());

    let manifest_a = scan_vault(&root_a).unwrap();
    let manifest_b = scan_vault(&root_b).unwrap();
    assert!(manifest_a.content_equals(&manifest_b));
    assert!(!manifest_a.files.contains_key(".config/provider/provider.json"));

    drop(runtime_a);
    server_router.shutdown().await.unwrap();
    let _ = std::fs::remove_dir_all(root);
  }
}

#[cfg(test)]
mod iroh_two_endpoint_tests {
  use super::*;
  use iroh::endpoint::{presets, Connection};
  use iroh::protocol::{AcceptError, ProtocolHandler, Router};
  use iroh::Endpoint;
  use std::fmt;
  use std::io;
  use std::path::{Path, PathBuf};
  use std::time::Duration;

  #[derive(Clone)]
  struct TestVaultProtocol {
    vault: VaultDescriptor,
  }

  impl fmt::Debug for TestVaultProtocol {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
      formatter
        .debug_struct("TestVaultProtocol")
        .field("vault", &self.vault.path)
        .finish()
    }
  }

  impl ProtocolHandler for TestVaultProtocol {
    async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
      let peer_id = connection.remote_id().to_string();
      let (send, mut recv) = connection
        .accept_bi()
        .await
        .map_err(|error| AcceptError::from_err(io::Error::other(error.to_string())))?;
      let first = read_control(&mut recv)
        .await
        .map_err(|error| AcceptError::from_err(io::Error::other(error)))?;
      let ControlMessage::SyncOpen(open) = first else {
        return Err(AcceptError::from_err(io::Error::other(
          "test server expected syncOpen",
        )));
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
      .map_err(|error| AcceptError::from_err(io::Error::other(error)))
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
    remote_endpoint: &Endpoint,
    remote_name: &str,
  ) -> SyncConfig {
    let cwd = PathBuf::from(&vault.path);
    let mut config = ensure_sync_files(vault, &local_endpoint.id().to_string()).unwrap();
    config.folder_id = "vault-shared-smoke-vault".to_string();
    config.peers = vec![PeerConfig {
      endpoint_id: remote_endpoint.id().to_string(),
      endpoint_addr: Some(remote_endpoint.addr()),
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
  ) -> SessionResult {
    tokio::time::timeout(
      Duration::from_secs(20),
      client_sync_peer(vault, config, &config.peers[0], runtime),
    )
    .await
    .expect("Iroh synchronization timed out")
    .expect("Iroh synchronization failed")
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
    let endpoint_a = Endpoint::builder(presets::Minimal).bind().await.unwrap();
    let endpoint_b = Endpoint::builder(presets::Minimal).bind().await.unwrap();

    let server_router = Router::builder(endpoint_b.clone())
      .accept(
        crate::sync::protocol::ALPN,
        TestVaultProtocol {
          vault: vault_b.clone(),
        },
      )
      .spawn();
    // A Router owns the endpoint's accept loop. Register the same production
    // ALPN on the initiating endpoint too, exactly as the application does,
    // so its router remains alive while it opens outgoing sessions.
    let client_router = Router::builder(endpoint_a.clone())
      .accept(
        crate::sync::protocol::ALPN,
        TestVaultProtocol {
          vault: vault_a.clone(),
        },
      )
      .spawn();
    let runtime_a = IrohRuntime::from_test_parts(endpoint_a.clone(), client_router);

    let config_a = configure_peer(&vault_a, &endpoint_a, &endpoint_b, "Device B");
    let _config_b = configure_peer(&vault_b, &endpoint_b, &endpoint_a, "Device A");

    let first = run_client_session(&vault_a, &config_a, &runtime_a).await;
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
    let second = run_client_session(&vault_a, &config_a, &runtime_a).await;
    assert_eq!(second.transferred_files, 1);
    assert_eq!(
      std::fs::read_to_string(root_b.join("A.md")).unwrap(),
      "updated on device A"
    );

    std::fs::remove_file(root_a.join("B.md")).unwrap();
    let third = run_client_session(&vault_a, &config_a, &runtime_a).await;
    assert_eq!(third.transferred_files, 0);
    assert!(!root_b.join("B.md").exists());

    let manifest_a = scan_vault(&root_a).unwrap();
    let manifest_b = scan_vault(&root_b).unwrap();
    assert!(manifest_a.content_equals(&manifest_b));
    assert!(!manifest_a.files.contains_key(".config/provider/provider.json"));

    drop(runtime_a);
    drop(server_router);
    let _ = std::fs::remove_dir_all(root);
  }
}

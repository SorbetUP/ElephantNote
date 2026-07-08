use iroh::endpoint::{presets, Connection};
use iroh::protocol::{AcceptError, ProtocolHandler, Router};
use iroh::{Endpoint, EndpointAddr, EndpointId, SecretKey};
use iroh_mdns_address_lookup::MdnsAddressLookup;
use std::fmt;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::{Mutex, MutexGuard};

pub mod manifest;
pub mod plan;
pub mod protocol;
pub mod transfer;

const IDENTITY_FILE: &str = "iroh-endpoint.key";
const MDNS_SERVICE: &str = "elephantnote-v1";

pub struct SyncActivityGuard<'a> {
  running: &'a AtomicBool,
}

impl Drop for SyncActivityGuard<'_> {
  fn drop(&mut self) {
    self.running.store(false, Ordering::Release);
  }
}

pub struct IrohSyncState {
  runtime: Mutex<Option<Arc<IrohRuntime>>>,
  operation: Mutex<()>,
  running: AtomicBool,
}

impl IrohSyncState {
  pub fn new() -> Self {
    Self {
      runtime: Mutex::new(None),
      operation: Mutex::new(()),
      running: AtomicBool::new(false),
    }
  }

  pub async fn lock_operation(&self) -> MutexGuard<'_, ()> {
    self.operation.lock().await
  }

  pub fn try_lock_operation(&self) -> Result<MutexGuard<'_, ()>, String> {
    self.operation
      .try_lock()
      .map_err(|_| "Another ElephantNote synchronization is already running on this device.".to_string())
  }

  pub fn begin_activity(&self) -> Result<SyncActivityGuard<'_>, String> {
    self
      .running
      .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
      .map_err(|_| "Another ElephantNote synchronization is already running on this device.".to_string())?;
    Ok(SyncActivityGuard {
      running: &self.running,
    })
  }

  pub fn is_running(&self) -> bool {
    self.running.load(Ordering::Acquire)
  }

  pub async fn runtime(&self, app: &AppHandle) -> Result<Arc<IrohRuntime>, String> {
    let mut guard = self.runtime.lock().await;
    if let Some(runtime) = guard.as_ref() {
      return Ok(runtime.clone());
    }

    let runtime = Arc::new(IrohRuntime::start(app.clone()).await?);
    *guard = Some(runtime.clone());
    Ok(runtime)
  }
}

impl Default for IrohSyncState {
  fn default() -> Self {
    Self::new()
  }
}

pub struct IrohRuntime {
  endpoint: Endpoint,
  #[allow(dead_code)]
  router: Router,
}

impl IrohRuntime {
  async fn start(app: AppHandle) -> Result<Self, String> {
    let key_path = identity_path(&app)?;
    let secret_key = load_or_create_secret_key(&key_path)?;
    let endpoint = Endpoint::builder(presets::Minimal)
      .secret_key(secret_key)
      .address_lookup(MdnsAddressLookup::builder().service_name(MDNS_SERVICE))
      .bind()
      .await
      .map_err(|error| format!("failed to start Iroh endpoint: {error}"))?;

    let router = Router::builder(endpoint.clone())
      .accept(protocol::ALPN, VaultSyncProtocol { app })
      .spawn();

    Ok(Self { endpoint, router })
  }

  #[cfg(test)]
  pub(crate) fn from_test_parts(endpoint: Endpoint, router: Router) -> Self {
    Self { endpoint, router }
  }

  pub fn endpoint(&self) -> &Endpoint {
    &self.endpoint
  }

  pub fn endpoint_id(&self) -> EndpointId {
    self.endpoint.id()
  }

  pub fn endpoint_addr(&self) -> EndpointAddr {
    self.endpoint.addr()
  }

  pub async fn connect(&self, addr: EndpointAddr) -> Result<Connection, String> {
    self.endpoint
      .connect(addr, protocol::ALPN)
      .await
      .map_err(|error| format!("failed to connect to Iroh peer: {error}"))
  }
}

fn identity_path(app: &AppHandle) -> Result<PathBuf, String> {
  let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
  Ok(directory.join(IDENTITY_FILE))
}

fn load_or_create_secret_key(path: &Path) -> Result<SecretKey, String> {
  if path.exists() {
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    let bytes: [u8; 32] = bytes
      .try_into()
      .map_err(|_| "invalid ElephantNote Iroh identity file".to_string())?;
    return Ok(SecretKey::from_bytes(&bytes));
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
  let permissions = fs::Permissions::from_mode(0o600);
  fs::set_permissions(path, permissions).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> Result<(), String> {
  Ok(())
}

#[derive(Clone)]
struct VaultSyncProtocol {
  app: AppHandle,
}

impl fmt::Debug for VaultSyncProtocol {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    formatter.debug_struct("VaultSyncProtocol").finish_non_exhaustive()
  }
}

impl ProtocolHandler for VaultSyncProtocol {
  async fn accept(&self, connection: Connection) -> Result<(), AcceptError> {
    if let Ok(config) = crate::vault::config::read_config(&self.app) {
      for vault in config.vaults {
        // Cleanup is best-effort per vault. An unavailable secondary vault
        // must never prevent another paired vault from accepting a session.
        let _ = crate::vault::sync::cleanup_conflicts_for_vault(&vault);
      }
    }
    crate::vault::sync::handle_incoming_connection(self.app.clone(), connection)
      .await
      .map_err(|error| AcceptError::from_err(io::Error::other(error)))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn persisted_secret_key_round_trips() {
    let root = std::env::temp_dir().join(format!(
      "elephant-iroh-key-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    let path = root.join(IDENTITY_FILE);
    let first = load_or_create_secret_key(&path).unwrap();
    let second = load_or_create_secret_key(&path).unwrap();
    assert_eq!(first.public(), second.public());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn activity_guard_resets_running_state_on_drop() {
    let state = IrohSyncState::new();
    assert!(!state.is_running());
    {
      let _activity = state.begin_activity().unwrap();
      assert!(state.is_running());
      assert!(state.begin_activity().is_err());
    }
    assert!(!state.is_running());
  }
}

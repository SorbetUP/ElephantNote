use serde::Serialize;
use serde_json::{json, Value};
use std::{
  collections::HashMap,
  fs,
  path::{Component, Path, PathBuf},
  process::Stdio,
  sync::atomic::{AtomicU64, Ordering},
};
use tauri::{AppHandle, State};
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter},
  process::{Child, ChildStdin, ChildStdout, Command},
  sync::Mutex,
  time::{timeout, Duration},
};

use crate::addon_runtime_access;
use crate::vault::config as vault_config;
use crate::vault_layout;

type R<T> = Result<T, String>;

const SERVICE_PROTOCOL: &str = "elephant-addon-service-v1";
const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const MAX_TIMEOUT_MS: u64 = 120_000;
const START_TIMEOUT_MS: u64 = 20_000;
const STOP_TIMEOUT_MS: u64 = 5_000;
const MAX_RESPONSE_BYTES: usize = 16 * 1024 * 1024;

struct ResolvedService {
  executable: PathBuf,
  package_dir: PathBuf,
  data_dir: PathBuf,
  vault_dir: PathBuf,
  relative_path: String,
  platform: String,
}

struct ServiceProcess {
  child: Child,
  stdin: BufWriter<ChildStdin>,
  stdout: BufReader<ChildStdout>,
  platform: String,
  relative_path: String,
}

impl ServiceProcess {
  fn is_running(&mut self) -> bool {
    matches!(self.child.try_wait(), Ok(None))
  }
}

pub struct AddonServiceState {
  services: Mutex<HashMap<String, ServiceProcess>>,
  request_id: AtomicU64,
}

impl AddonServiceState {
  pub fn new() -> Self {
    Self {
      services: Mutex::new(HashMap::new()),
      request_id: AtomicU64::new(1),
    }
  }

  fn next_request_id(&self) -> u64 {
    self.request_id.fetch_add(1, Ordering::Relaxed)
  }
}

impl Default for AddonServiceState {
  fn default() -> Self {
    Self::new()
  }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AddonServiceStatus {
  pub running: bool,
  pub addon_id: String,
  pub platform: String,
  pub relative_path: String,
  pub protocol: &'static str,
  pub error: Option<String>,
}

fn platform_key() -> String {
  let os = match std::env::consts::OS {
    "macos" => "macos",
    "windows" => "windows",
    "linux" => "linux",
    "android" => "android",
    "ios" => "ios",
    other => other,
  };
  let arch = match std::env::consts::ARCH {
    "aarch64" => "aarch64",
    "x86_64" => "x86_64",
    "arm" => "armv7",
    "x86" => "i686",
    other => other,
  };
  format!("{os}-{arch}")
}

fn services_supported_on(os: &str) -> bool {
  !matches!(os, "android" | "ios")
}

fn ensure_services_supported() -> R<()> {
  if services_supported_on(std::env::consts::OS) {
    Ok(())
  } else {
    Err(format!(
      "Persistent process addon services are not supported on {}. Install a package-owned mobile adapter instead.",
      std::env::consts::OS
    ))
  }
}

fn safe_relative_path(value: &str) -> R<PathBuf> {
  let path = Path::new(value);
  if value.trim().is_empty() || path.is_absolute() {
    return Err("A safe relative addon service path is required".to_string());
  }
  let mut normalized = PathBuf::new();
  for component in path.components() {
    match component {
      Component::Normal(part) => normalized.push(part),
      Component::CurDir => {}
      Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
        return Err(format!("Path traversal is not allowed: {value}"));
      }
    }
  }
  if normalized.as_os_str().is_empty() {
    return Err("A safe relative addon service path is required".to_string());
  }
  Ok(normalized)
}

fn read_manifest(package_dir: &Path, addon_id: &str) -> R<Value> {
  let path = package_dir.join("manifest.json");
  let raw = fs::read_to_string(&path)
    .map_err(|error| format!("Failed to read installed addon manifest for {addon_id}: {error}"))?;
  let manifest: Value = serde_json::from_str(&raw)
    .map_err(|error| format!("Invalid installed addon manifest for {addon_id}: {error}"))?;
  if manifest.get("id").and_then(Value::as_str) != Some(addon_id) {
    return Err(format!("Installed addon manifest id mismatch: {addon_id}"));
  }
  Ok(manifest)
}

fn resolve_service(app: &AppHandle, addon_id: &str) -> R<ResolvedService> {
  ensure_services_supported()?;
  addon_runtime_access::read_enabled_addon(app, addon_id)?;

  let vault = vault_config::get_active_vault(app)?;
  let vault_dir = fs::canonicalize(&vault.path)
    .map_err(|error| format!("Active vault is unavailable: {error}"))?;
  let addons_root = vault_layout::addons_dir(&vault.path);
  let package_dir = addons_root.join("packages").join(addon_id);
  let data_dir = addons_root.join("data").join(addon_id);
  fs::create_dir_all(&data_dir).map_err(|error| error.to_string())?;

  let manifest = read_manifest(&package_dir, addon_id)?;
  if manifest
    .get("permissions")
    .and_then(|value| value.get("native"))
    .and_then(Value::as_bool)
    != Some(true)
  {
    return Err(format!("Addon native permission was not granted: {addon_id}"));
  }
  let native = manifest
    .get("native")
    .and_then(Value::as_object)
    .ok_or_else(|| format!("Addon does not declare a native runtime: {addon_id}"))?;
  let runner = native.get("runner").and_then(Value::as_str).unwrap_or("");
  if runner != "service" {
    return Err(format!(
      "Addon native runner must be service for persistent calls: {addon_id} declares {runner:?}"
    ));
  }

  let platform = platform_key();
  let relative = native
    .get("sidecars")
    .and_then(Value::as_object)
    .and_then(|sidecars| sidecars.get(&platform).or_else(|| sidecars.get(std::env::consts::OS)))
    .and_then(Value::as_str)
    .ok_or_else(|| format!("Addon has no service executable for platform {platform}: {addon_id}"))?;
  let relative_path = safe_relative_path(relative)?;

  let canonical_package = fs::canonicalize(&package_dir)
    .map_err(|error| format!("Addon package directory is unavailable for {addon_id}: {error}"))?;
  let executable = fs::canonicalize(package_dir.join(&relative_path))
    .map_err(|error| format!("Addon service executable is unavailable for {addon_id}: {error}"))?;
  if !executable.starts_with(&canonical_package) {
    return Err(format!("Addon service executable escapes its package directory: {addon_id}"));
  }
  let metadata = fs::metadata(&executable).map_err(|error| error.to_string())?;
  if !metadata.is_file() {
    return Err(format!("Addon service executable is not a regular file: {addon_id}"));
  }

  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    let mut permissions = metadata.permissions();
    let mode = permissions.mode();
    if mode & 0o100 == 0 {
      permissions.set_mode(mode | 0o700);
      fs::set_permissions(&executable, permissions)
        .map_err(|error| format!("Failed to mark addon service executable: {error}"))?;
    }
  }

  Ok(ResolvedService {
    executable,
    package_dir: canonical_package,
    data_dir,
    vault_dir,
    relative_path: relative_path.to_string_lossy().replace('\\', "/"),
    platform,
  })
}

async fn send_request(
  process: &mut ServiceProcess,
  addon_id: &str,
  request_id: u64,
  method: &str,
  params: Value,
  timeout_ms: u64,
) -> R<Value> {
  let mut request = serde_json::to_vec(&json!({
    "protocol": SERVICE_PROTOCOL,
    "id": request_id,
    "addonId": addon_id,
    "method": method,
    "params": params
  }))
  .map_err(|error| error.to_string())?;
  request.push(b'\n');
  process
    .stdin
    .write_all(&request)
    .await
    .map_err(|error| format!("Failed to write addon service request: {error}"))?;
  process
    .stdin
    .flush()
    .await
    .map_err(|error| format!("Failed to flush addon service request: {error}"))?;

  let wait_ms = timeout_ms.clamp(1, MAX_TIMEOUT_MS);
  let mut line = String::new();
  let bytes = timeout(Duration::from_millis(wait_ms), process.stdout.read_line(&mut line))
    .await
    .map_err(|_| format!("Addon service timed out after {wait_ms} ms"))?
    .map_err(|error| format!("Failed to read addon service response: {error}"))?;
  if bytes == 0 {
    return Err("Addon service closed before responding".to_string());
  }
  if line.len() > MAX_RESPONSE_BYTES {
    return Err("Addon service response exceeded the 16 MiB limit".to_string());
  }

  let response: Value = serde_json::from_str(line.trim_end())
    .map_err(|error| format!("Addon service returned invalid JSON: {error}"))?;
  if response.get("protocol").and_then(Value::as_str) != Some(SERVICE_PROTOCOL) {
    return Err("Addon service returned an unsupported protocol".to_string());
  }
  if response.get("id").and_then(Value::as_u64) != Some(request_id) {
    return Err("Addon service response id did not match the request".to_string());
  }
  if response.get("ok").and_then(Value::as_bool) == Some(true) {
    return Ok(response.get("result").cloned().unwrap_or(Value::Null));
  }
  Err(response
    .get("error")
    .and_then(|value| value.get("message").or(Some(value)))
    .and_then(Value::as_str)
    .unwrap_or("Addon service returned an unknown error")
    .to_string())
}

async fn spawn_service(app: &AppHandle, addon_id: &str, request_id: u64) -> R<ServiceProcess> {
  let resolved = resolve_service(app, addon_id)?;
  let mut command = Command::new(&resolved.executable);
  command
    .current_dir(&resolved.package_dir)
    .env("ELEPHANT_ADDON_ID", addon_id)
    .env("ELEPHANT_ADDON_PACKAGE_DIR", &resolved.package_dir)
    .env("ELEPHANT_ADDON_DATA_DIR", &resolved.data_dir)
    .env("ELEPHANT_VAULT_DIR", &resolved.vault_dir)
    .env("ELEPHANT_ADDON_SERVICE_PROTOCOL", SERVICE_PROTOCOL)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::null())
    .kill_on_drop(true);

  let mut child = command
    .spawn()
    .map_err(|error| format!("Failed to start addon service: {error}"))?;
  let stdin = child.stdin.take().ok_or_else(|| "Addon service stdin is unavailable".to_string())?;
  let stdout = child.stdout.take().ok_or_else(|| "Addon service stdout is unavailable".to_string())?;
  let mut process = ServiceProcess {
    child,
    stdin: BufWriter::new(stdin),
    stdout: BufReader::new(stdout),
    platform: resolved.platform,
    relative_path: resolved.relative_path,
  };
  send_request(
    &mut process,
    addon_id,
    request_id,
    "service.start",
    json!({}),
    START_TIMEOUT_MS,
  )
  .await?;
  Ok(process)
}

#[tauri::command]
pub async fn tauri_addons_service_status(
  app: AppHandle,
  state: State<'_, AddonServiceState>,
  addon_id: String,
) -> AddonServiceStatus {
  let mut services = state.services.lock().await;
  if let Some(process) = services.get_mut(&addon_id) {
    if process.is_running() {
      return AddonServiceStatus {
        running: true,
        addon_id,
        platform: process.platform.clone(),
        relative_path: process.relative_path.clone(),
        protocol: SERVICE_PROTOCOL,
        error: None,
      };
    }
    services.remove(&addon_id);
  }
  match resolve_service(&app, &addon_id) {
    Ok(resolved) => AddonServiceStatus {
      running: false,
      addon_id,
      platform: resolved.platform,
      relative_path: resolved.relative_path,
      protocol: SERVICE_PROTOCOL,
      error: None,
    },
    Err(error) => AddonServiceStatus {
      running: false,
      addon_id,
      platform: platform_key(),
      relative_path: String::new(),
      protocol: SERVICE_PROTOCOL,
      error: Some(error),
    },
  }
}

#[tauri::command]
pub async fn tauri_addons_service_start(
  app: AppHandle,
  state: State<'_, AddonServiceState>,
  addon_id: String,
) -> R<Value> {
  let mut services = state.services.lock().await;
  if let Some(process) = services.get_mut(&addon_id) {
    if process.is_running() {
      return Ok(json!({
        "running": true,
        "platform": process.platform.clone(),
        "relativePath": process.relative_path.clone(),
        "protocol": SERVICE_PROTOCOL
      }));
    }
    services.remove(&addon_id);
  }
  let process = spawn_service(&app, &addon_id, state.next_request_id()).await?;
  let result = json!({
    "running": true,
    "platform": process.platform.clone(),
    "relativePath": process.relative_path.clone(),
    "protocol": SERVICE_PROTOCOL
  });
  services.insert(addon_id, process);
  Ok(result)
}

#[tauri::command]
pub async fn tauri_addons_service_call(
  app: AppHandle,
  state: State<'_, AddonServiceState>,
  addon_id: String,
  method: String,
  params: Option<Value>,
  timeout_ms: Option<u64>,
) -> R<Value> {
  let method = method.trim();
  if method.is_empty() || method.len() > 128 || method.starts_with("service.") {
    return Err("A valid addon service method is required".to_string());
  }

  let mut services = state.services.lock().await;
  let needs_start = services
    .get_mut(&addon_id)
    .map(|process| !process.is_running())
    .unwrap_or(true);
  if needs_start {
    services.remove(&addon_id);
    let process = spawn_service(&app, &addon_id, state.next_request_id()).await?;
    services.insert(addon_id.clone(), process);
  }
  let result = {
    let process = services
      .get_mut(&addon_id)
      .ok_or_else(|| "Addon service failed to start".to_string())?;
    send_request(
      process,
      &addon_id,
      state.next_request_id(),
      method,
      params.unwrap_or_else(|| json!({})),
      timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS),
    )
    .await
  };
  let stopped = services
    .get_mut(&addon_id)
    .map(|process| !process.is_running())
    .unwrap_or(true);
  if stopped {
    services.remove(&addon_id);
  }
  result
}

#[tauri::command]
pub async fn tauri_addons_service_stop(
  state: State<'_, AddonServiceState>,
  addon_id: String,
) -> R<Value> {
  let Some(mut process) = state.services.lock().await.remove(&addon_id) else {
    return Ok(json!({ "running": false, "stopped": false }));
  };
  let _ = send_request(
    &mut process,
    &addon_id,
    state.next_request_id(),
    "service.stop",
    json!({}),
    STOP_TIMEOUT_MS,
  )
  .await;
  if !matches!(
    timeout(Duration::from_millis(STOP_TIMEOUT_MS), process.child.wait()).await,
    Ok(Ok(_))
  ) {
    let _ = process.child.kill().await;
    let _ = process.child.wait().await;
  }
  Ok(json!({ "running": false, "stopped": true }))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn service_paths_reject_traversal() {
    assert!(safe_relative_path("../outside").is_err());
    assert!(safe_relative_path("native/linux-x86_64/service").is_ok());
  }

  #[test]
  fn process_services_are_desktop_only() {
    assert!(services_supported_on("linux"));
    assert!(services_supported_on("macos"));
    assert!(services_supported_on("windows"));
    assert!(!services_supported_on("android"));
    assert!(!services_supported_on("ios"));
  }

  #[test]
  fn service_protocol_is_versioned() {
    assert_eq!(SERVICE_PROTOCOL, "elephant-addon-service-v1");
    assert!(MAX_RESPONSE_BYTES >= 1024 * 1024);
  }
}

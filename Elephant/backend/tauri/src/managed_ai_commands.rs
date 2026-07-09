use crate::managed_ai_runtime::{ManagedProvider, ManagedRuntimeInstaller, R};
use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::{
  env,
  io::{BufRead, BufReader},
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::{Arc, Mutex},
  thread,
  time::{Duration, Instant},
};
use tauri::{AppHandle, State};

const OPENCODE_MANAGED_ENDPOINT: &str = "http://127.0.0.1:4096";
const OPENCODE_START_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub struct ManagedAiRuntimeState {
  installer: ManagedRuntimeInstaller,
  opencode: Arc<Mutex<Option<ManagedOpenCodeProcess>>>,
}

struct ManagedOpenCodeProcess {
  child: Child,
  executable: PathBuf,
  version: String,
}

impl ManagedAiRuntimeState {
  pub fn new(app: &AppHandle) -> R<Self> {
    let installer = ManagedRuntimeInstaller::new(app)?;
    activate_managed_paths(&installer)?;
    Ok(Self {
      installer,
      opencode: Arc::new(Mutex::new(None)),
    })
  }

  fn stop_opencode(&self) -> bool {
    let Ok(mut guard) = self.opencode.lock() else { return false; };
    let Some(mut process) = guard.take() else { return false; };
    eprintln!("[AI][opencode] process:stop pid={}", process.child.id());
    let _ = process.child.kill();
    let _ = process.child.wait();
    true
  }

  fn ensure_opencode_running(&self, endpoint: Option<String>) -> R<Value> {
    let endpoint = normalize_endpoint(endpoint);
    if endpoint != OPENCODE_MANAGED_ENDPOINT && endpoint != "http://localhost:4096" {
      let health = opencode_health(&endpoint)?;
      return Ok(json!({
        "ok": true,
        "provider": "opencode",
        "managed": false,
        "endpoint": endpoint,
        "health": health
      }));
    }

    if let Ok(health) = opencode_health(OPENCODE_MANAGED_ENDPOINT) {
      return Ok(json!({
        "ok": true,
        "provider": "opencode",
        "managed": self.managed_process_alive(),
        "endpoint": OPENCODE_MANAGED_ENDPOINT,
        "health": health
      }));
    }

    let install = self.installer.ensure_installed(ManagedProvider::OpenCode)?;
    activate_managed_paths(&self.installer)?;
    let executable = PathBuf::from(&install.executable);
    let version = install.version.clone();
    self.start_opencode(&executable, &version)?;
    let started = Instant::now();
    loop {
      match opencode_health(OPENCODE_MANAGED_ENDPOINT) {
        Ok(health) => {
          let pid = self.opencode.lock().ok().and_then(|guard| guard.as_ref().map(|process| process.child.id()));
          eprintln!(
            "[AI][opencode] process:ready pid={} endpoint={} duration_ms={}",
            pid.map(|value| value.to_string()).unwrap_or_else(|| "unknown".to_string()),
            OPENCODE_MANAGED_ENDPOINT,
            started.elapsed().as_millis()
          );
          return Ok(json!({
            "ok": true,
            "provider": "opencode",
            "managed": true,
            "installed": true,
            "endpoint": OPENCODE_MANAGED_ENDPOINT,
            "executable": executable.to_string_lossy(),
            "version": version,
            "pid": pid,
            "health": health
          }));
        }
        Err(error) if started.elapsed() < OPENCODE_START_TIMEOUT => {
          if !self.managed_process_alive() {
            return Err(format!("Managed OpenCode exited before becoming healthy: {error}"));
          }
          thread::sleep(Duration::from_millis(150));
        }
        Err(error) => {
          self.stop_opencode();
          return Err(format!("Managed OpenCode did not become healthy within 15 seconds: {error}"));
        }
      }
    }
  }

  fn managed_process_alive(&self) -> bool {
    let Ok(mut guard) = self.opencode.lock() else { return false; };
    let Some(process) = guard.as_mut() else { return false; };
    match process.child.try_wait() {
      Ok(None) => true,
      Ok(Some(status)) => {
        eprintln!("[AI][opencode] process:exit status={status}");
        *guard = None;
        false
      }
      Err(error) => {
        eprintln!("[AI][opencode] process:status-error error={error}");
        false
      }
    }
  }

  fn start_opencode(&self, executable: &Path, version: &str) -> R<()> {
    let mut guard = self.opencode.lock().map_err(|_| "OpenCode runtime lock is poisoned.".to_string())?;
    if let Some(process) = guard.as_mut() {
      if process.child.try_wait().map_err(|error| error.to_string())?.is_none() {
        return Ok(());
      }
      *guard = None;
    }

    eprintln!(
      "[AI][opencode] process:start executable={} endpoint={}",
      executable.display(),
      OPENCODE_MANAGED_ENDPOINT
    );
    let mut child = Command::new(executable)
      .arg("serve")
      .arg("--hostname")
      .arg("127.0.0.1")
      .arg("--port")
      .arg("4096")
      .stdin(Stdio::null())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|error| format!("Unable to start managed OpenCode: {error}"))?;
    if let Some(stdout) = child.stdout.take() {
      thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
          if !line.trim().is_empty() {
            eprintln!("[AI][opencode][stdout] {}", redact_line(&line));
          }
        }
      });
    }
    if let Some(stderr) = child.stderr.take() {
      thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
          if !line.trim().is_empty() {
            eprintln!("[AI][opencode][stderr] {}", redact_line(&line));
          }
        }
      });
    }
    *guard = Some(ManagedOpenCodeProcess {
      child,
      executable: executable.to_path_buf(),
      version: version.to_string(),
    });
    Ok(())
  }

  fn status(&self, provider: ManagedProvider) -> Value {
    let status = self.installer.status(provider);
    if provider == ManagedProvider::OpenCode {
      let process = self.opencode.lock().ok().and_then(|mut guard| {
        let process = guard.as_mut()?;
        match process.child.try_wait() {
          Ok(None) => Some(json!({
            "running": true,
            "pid": process.child.id(),
            "executable": process.executable.to_string_lossy(),
            "version": process.version,
            "endpoint": OPENCODE_MANAGED_ENDPOINT
          })),
          _ => {
            *guard = None;
            None
          }
        }
      });
      return json!({
        "ok": true,
        "provider": "opencode",
        "runtime": status,
        "process": process.unwrap_or_else(|| json!({ "running": false, "endpoint": OPENCODE_MANAGED_ENDPOINT }))
      });
    }
    json!({ "ok": true, "provider": provider.id(), "runtime": status })
  }
}

impl Drop for ManagedAiRuntimeState {
  fn drop(&mut self) {
    if Arc::strong_count(&self.opencode) == 1 {
      self.stop_opencode();
    }
  }
}

fn normalize_endpoint(endpoint: Option<String>) -> String {
  endpoint
    .unwrap_or_else(|| OPENCODE_MANAGED_ENDPOINT.to_string())
    .trim()
    .trim_end_matches('/')
    .to_string()
}

fn opencode_health(endpoint: &str) -> R<Value> {
  Client::builder()
    .timeout(Duration::from_secs(2))
    .build()
    .map_err(|error| error.to_string())?
    .get(format!("{endpoint}/global/health"))
    .send()
    .map_err(|error| format!("OpenCode health request failed for {endpoint}: {error}"))?
    .error_for_status()
    .map_err(|error| format!("OpenCode health request failed for {endpoint}: {error}"))?
    .json::<Value>()
    .map_err(|error| format!("OpenCode returned invalid health JSON: {error}"))
}

fn activate_managed_paths(installer: &ManagedRuntimeInstaller) -> R<()> {
  let mut entries = vec![
    installer.managed_executable(ManagedProvider::Codex).parent().map(Path::to_path_buf),
    installer.managed_executable(ManagedProvider::OpenCode).parent().map(Path::to_path_buf),
  ]
  .into_iter()
  .flatten()
  .collect::<Vec<_>>();
  entries.extend(env::var_os("PATH").as_deref().map(env::split_paths).into_iter().flatten());
  let mut unique = Vec::new();
  for entry in entries {
    if !unique.contains(&entry) {
      unique.push(entry);
    }
  }
  let joined = env::join_paths(unique).map_err(|error| format!("Unable to activate managed runtime PATH: {error}"))?;
  env::set_var("PATH", joined);
  Ok(())
}

fn redact_line(line: &str) -> String {
  let lower = line.to_ascii_lowercase();
  if lower.contains("token") || lower.contains("authorization") || lower.contains("api_key") || lower.contains("apikey") || lower.contains("password") {
    "[redacted-sensitive-log]".to_string()
  } else {
    line.to_string()
  }
}

fn parse_provider(value: Option<String>) -> R<ManagedProvider> {
  match value.unwrap_or_default().trim().to_ascii_lowercase().as_str() {
    "codex" => Ok(ManagedProvider::Codex),
    "opencode" => Ok(ManagedProvider::OpenCode),
    other => Err(format!("Unsupported managed AI runtime: {other}")),
  }
}

async fn blocking<T, F>(operation: F) -> R<T>
where
  T: Send + 'static,
  F: FnOnce() -> R<T> + Send + 'static,
{
  tauri::async_runtime::spawn_blocking(operation)
    .await
    .map_err(|error| format!("Managed AI runtime task failed: {error}"))?
}

#[tauri::command]
pub async fn tauri_ai_managed_runtime_status(
  state: State<'_, ManagedAiRuntimeState>,
  provider: Option<String>,
) -> R<Value> {
  let provider = parse_provider(provider)?;
  Ok(state.status(provider))
}

#[tauri::command]
pub async fn tauri_ai_managed_runtime_install(
  state: State<'_, ManagedAiRuntimeState>,
  provider: Option<String>,
) -> R<Value> {
  let provider = parse_provider(provider)?;
  let runtime = state.inner().clone();
  blocking(move || {
    let outcome = runtime.installer.ensure_installed(provider)?;
    activate_managed_paths(&runtime.installer)?;
    Ok(json!({ "ok": true, "provider": provider.id(), "install": outcome }))
  })
  .await
}

#[tauri::command]
pub async fn tauri_ai_managed_runtime_ensure(
  state: State<'_, ManagedAiRuntimeState>,
  provider: Option<String>,
  endpoint: Option<String>,
) -> R<Value> {
  let provider = parse_provider(provider)?;
  let runtime = state.inner().clone();
  blocking(move || match provider {
    ManagedProvider::Codex => {
      let outcome = runtime.installer.ensure_installed(provider)?;
      activate_managed_paths(&runtime.installer)?;
      Ok(json!({ "ok": true, "provider": "codex", "install": outcome }))
    }
    ManagedProvider::OpenCode => runtime.ensure_opencode_running(endpoint),
  })
  .await
}

#[tauri::command]
pub async fn tauri_ai_managed_runtime_stop(
  state: State<'_, ManagedAiRuntimeState>,
  provider: Option<String>,
) -> R<Value> {
  let provider = parse_provider(provider)?;
  match provider {
    ManagedProvider::Codex => Err("Codex app-server lifecycle is owned by the Codex provider connection.".to_string()),
    ManagedProvider::OpenCode => Ok(json!({ "ok": true, "provider": "opencode", "stopped": state.stop_opencode() })),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn managed_endpoint_is_stable() {
    assert_eq!(normalize_endpoint(None), OPENCODE_MANAGED_ENDPOINT);
    assert_eq!(normalize_endpoint(Some("http://127.0.0.1:4096/".to_string())), OPENCODE_MANAGED_ENDPOINT);
  }

  #[test]
  fn sensitive_runtime_output_is_redacted() {
    assert_eq!(redact_line("authorization: bearer secret"), "[redacted-sensitive-log]");
    assert_eq!(redact_line("server listening on 4096"), "server listening on 4096");
  }

  #[test]
  fn only_supported_managed_providers_are_accepted() {
    assert_eq!(parse_provider(Some("codex".to_string())).unwrap(), ManagedProvider::Codex);
    assert_eq!(parse_provider(Some("opencode".to_string())).unwrap(), ManagedProvider::OpenCode);
    assert!(parse_provider(Some("pi".to_string())).is_err());
  }
}

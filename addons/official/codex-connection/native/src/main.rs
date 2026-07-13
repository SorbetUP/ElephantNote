use serde_json::{json, Value};
use std::{
  collections::HashSet,
  env,
  path::{Path, PathBuf},
  process::Stdio,
  time::Duration,
};
use tokio::{
  fs,
  io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter},
  process::{Child, ChildStdin, ChildStdout, Command},
  time::{timeout, Instant},
};

const SERVICE_PROTOCOL: &str = "elephant-addon-service-v1";
const ADDON_ID: &str = "elephant.codex-connection";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(35);
const TURN_TIMEOUT: Duration = Duration::from_secs(180);
const PROBE_TIMEOUT: Duration = Duration::from_secs(12);

struct Runtime {
  path: PathBuf,
  version: String,
  source: String,
}

struct CodexProcess {
  child: Child,
  stdin: BufWriter<ChildStdin>,
  stdout: BufReader<ChildStdout>,
  runtime: Runtime,
  next_id: u64,
}

struct CodexService {
  package_dir: PathBuf,
  data_dir: PathBuf,
  home_dir: PathBuf,
  process: Option<CodexProcess>,
}

impl CodexService {
  async fn new() -> Result<Self, String> {
    let package_dir = env::var_os("ELEPHANT_ADDON_PACKAGE_DIR")
      .map(PathBuf::from)
      .ok_or_else(|| "ELEPHANT_ADDON_PACKAGE_DIR is unavailable".to_string())?;
    let data_dir = env::var_os("ELEPHANT_ADDON_DATA_DIR")
      .map(PathBuf::from)
      .ok_or_else(|| "ELEPHANT_ADDON_DATA_DIR is unavailable".to_string())?;
    let home_dir = data_dir.join("codex-home");
    fs::create_dir_all(&home_dir).await.map_err(|error| error.to_string())?;
    seed_authentication(&home_dir).await?;
    Ok(Self { package_dir, data_dir, home_dir, process: None })
  }

  async fn runtime(&self) -> Result<Runtime, String> {
    let mut candidates = Vec::<(PathBuf, String)>::new();
    let mut seen = HashSet::<PathBuf>::new();
    let binary = if cfg!(windows) { "codex.exe" } else { "codex" };

    for (key, source) in [("ELEPHANT_CODEX_PATH", "env"), ("CODEX_PATH", "env") ] {
      if let Some(value) = env::var_os(key) {
        push_candidate(&mut candidates, &mut seen, PathBuf::from(value), format!("{source}:{key}"));
      }
    }
    for path in [
      self.package_dir.join("runtime").join(binary),
      self.package_dir.join("bin").join(binary),
      self.package_dir.join(binary),
    ] {
      push_candidate(&mut candidates, &mut seen, path, "package");
    }
    #[cfg(target_os = "macos")]
    for path in [
      PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
      PathBuf::from("/opt/homebrew/bin/codex"),
      PathBuf::from("/usr/local/bin/codex"),
    ] {
      push_candidate(&mut candidates, &mut seen, path, "macos");
    }
    if let Some(path) = find_on_path(binary) {
      push_candidate(&mut candidates, &mut seen, path, "path");
    }

    for (path, source) in candidates {
      if let Some(runtime) = probe_runtime(path, source).await {
        return Ok(runtime);
      }
    }
    Err("Codex app-server was not found. Install Codex or place its binary inside the Codex Connection addon package.".to_string())
  }

  async fn ensure_process(&mut self) -> Result<&mut CodexProcess, String> {
    let running = match self.process.as_mut() {
      Some(process) => matches!(process.child.try_wait(), Ok(None)),
      None => false,
    };
    if !running {
      self.process = None;
      let runtime = self.runtime().await?;
      let mut child = Command::new(&runtime.path)
        .args(["app-server", "--listen", "stdio://"])
        .env("CODEX_HOME", &self.home_dir)
        .current_dir(&self.data_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true)
        .spawn()
        .map_err(|error| format!("Unable to start Codex app-server: {error}"))?;
      let stdin = child.stdin.take().ok_or_else(|| "Codex stdin is unavailable".to_string())?;
      let stdout = child.stdout.take().ok_or_else(|| "Codex stdout is unavailable".to_string())?;
      self.process = Some(CodexProcess {
        child,
        stdin: BufWriter::new(stdin),
        stdout: BufReader::new(stdout),
        runtime,
        next_id: 1,
      });
      let process = self.process.as_mut().expect("Codex process was just initialized");
      process.request("initialize", initialize_params(), REQUEST_TIMEOUT).await?;
      process.notify("initialized", json!({})).await?;
    }
    self.process.as_mut().ok_or_else(|| "Codex process is unavailable".to_string())
  }

  async fn stop(&mut self) -> Value {
    if let Some(mut process) = self.process.take() {
      let _ = process.child.kill().await;
      let _ = process.child.wait().await;
    }
    json!({ "stopped": true, "running": false })
  }

  async fn status(&mut self) -> Value {
    let process = match self.ensure_process().await {
      Ok(process) => process,
      Err(error) => return json!({ "installed": false, "detected": false, "running": false, "connected": false, "error": error }),
    };
    let runtime_path = process.runtime.path.to_string_lossy().to_string();
    let runtime_source = process.runtime.source.clone();
    let version = process.runtime.version.clone();
    match process.request("account/read", json!({ "refreshToken": false }), REQUEST_TIMEOUT).await {
      Ok(result) => {
        let account = result.get("account").cloned().unwrap_or(Value::Null);
        json!({
          "installed": true,
          "detected": true,
          "running": true,
          "connected": !account.is_null(),
          "account": account,
          "requiresOpenaiAuth": result.get("requiresOpenaiAuth").cloned().unwrap_or(Value::Bool(true)),
          "version": version,
          "runtimePath": runtime_path,
          "runtimeSource": runtime_source
        })
      }
      Err(error) => json!({
        "installed": true,
        "detected": true,
        "running": true,
        "connected": false,
        "version": version,
        "runtimePath": runtime_path,
        "runtimeSource": runtime_source,
        "error": error
      }),
    }
  }

  async fn login(&mut self, params: &Value) -> Result<Value, String> {
    let flow = params.get("flow").and_then(Value::as_str).unwrap_or("");
    let request = if flow == "device-code" {
      json!({ "type": "chatgptDeviceCode" })
    } else {
      json!({ "type": "chatgpt", "useHostedLoginSuccessPage": true, "appBrand": "chatgpt" })
    };
    self.ensure_process().await?.request("account/login/start", request, REQUEST_TIMEOUT).await
  }

  async fn logout(&mut self) -> Result<Value, String> {
    self.ensure_process().await?.request("account/logout", json!({}), REQUEST_TIMEOUT).await
  }

  async fn models(&mut self) -> Result<Value, String> {
    self.ensure_process().await?.request("model/list", json!({ "limit": 100, "includeHidden": false }), REQUEST_TIMEOUT).await
  }

  async fn usage(&mut self) -> Result<Value, String> {
    self.ensure_process().await?.request("account/rateLimits/read", json!({}), REQUEST_TIMEOUT).await
  }

  async fn chat(&mut self, params: &Value) -> Result<Value, String> {
    let model = params.get("model").and_then(Value::as_str).unwrap_or("").trim();
    let prompt = params.get("prompt").and_then(Value::as_str).unwrap_or("").trim();
    if prompt.is_empty() {
      return Err("A Codex chat prompt is required".to_string());
    }
    let cwd = self.data_dir.to_string_lossy().to_string();
    let process = self.ensure_process().await?;
    let thread = process.request("thread/start", thread_start_params(model, &cwd), REQUEST_TIMEOUT).await?;
    let thread_id = thread.pointer("/thread/id")
      .or_else(|| thread.get("threadId"))
      .and_then(Value::as_str)
      .ok_or_else(|| "Codex did not return a thread id".to_string())?
      .to_string();
    let turn = process.request("turn/start", turn_start_params(&thread_id, model, &cwd, prompt), REQUEST_TIMEOUT).await?;
    let turn_id = turn.pointer("/turn/id")
      .or_else(|| turn.get("turnId"))
      .and_then(Value::as_str)
      .unwrap_or("")
      .to_string();
    let answer = process.read_turn(&thread_id, &turn_id).await?;
    let _ = process.request("thread/unsubscribe", json!({ "threadId": thread_id }), Duration::from_secs(3)).await;
    Ok(json!({ "answer": answer, "model": model, "threadId": thread_id }))
  }

  async fn handle(&mut self, method: &str, params: Value) -> Result<Value, String> {
    match method {
      "service.start" | "codex.status" => Ok(self.status().await),
      "service.stop" => Ok(self.stop().await),
      "codex.login" => self.login(&params).await,
      "codex.logout" => self.logout().await,
      "codex.models" => self.models().await,
      "codex.usage" => self.usage().await,
      "codex.chat" => self.chat(&params).await,
      other => Err(format!("Unsupported Codex service method: {other}")),
    }
  }
}

impl CodexProcess {
  async fn notify(&mut self, method: &str, params: Value) -> Result<(), String> {
    let line = serde_json::to_vec(&json!({ "method": method, "params": params })).map_err(|error| error.to_string())?;
    self.stdin.write_all(&line).await.map_err(|error| error.to_string())?;
    self.stdin.write_all(b"\n").await.map_err(|error| error.to_string())?;
    self.stdin.flush().await.map_err(|error| error.to_string())
  }

  async fn request(&mut self, method: &str, params: Value, wait: Duration) -> Result<Value, String> {
    let id = self.next_id;
    self.next_id += 1;
    let line = serde_json::to_vec(&json!({ "method": method, "id": id, "params": params })).map_err(|error| error.to_string())?;
    self.stdin.write_all(&line).await.map_err(|error| error.to_string())?;
    self.stdin.write_all(b"\n").await.map_err(|error| error.to_string())?;
    self.stdin.flush().await.map_err(|error| error.to_string())?;
    let deadline = Instant::now() + wait;
    loop {
      let mut raw = String::new();
      let bytes = timeout(deadline.saturating_duration_since(Instant::now()), self.stdout.read_line(&mut raw))
        .await.map_err(|_| format!("Codex request timed out: {method}"))?
        .map_err(|error| error.to_string())?;
      if bytes == 0 {
        return Err("Codex app-server stopped before responding".to_string());
      }
      let message: Value = serde_json::from_str(raw.trim()).map_err(|error| format!("Codex returned invalid JSON: {error}"))?;
      if message.get("id").and_then(Value::as_u64) != Some(id) {
        continue;
      }
      if let Some(error) = message.get("error") {
        return Err(error.get("message").and_then(Value::as_str).unwrap_or("Codex request failed").to_string());
      }
      return Ok(message.get("result").cloned().unwrap_or(Value::Null));
    }
  }

  async fn read_turn(&mut self, thread_id: &str, turn_id: &str) -> Result<String, String> {
    let deadline = Instant::now() + TURN_TIMEOUT;
    let mut answer = String::new();
    loop {
      let mut raw = String::new();
      let bytes = timeout(deadline.saturating_duration_since(Instant::now()), self.stdout.read_line(&mut raw))
        .await.map_err(|_| "Codex turn timed out".to_string())?
        .map_err(|error| error.to_string())?;
      if bytes == 0 {
        return Err("Codex app-server stopped during the turn".to_string());
      }
      let event: Value = match serde_json::from_str(raw.trim()) {
        Ok(value) => value,
        Err(_) => continue,
      };
      let method = event.get("method").and_then(Value::as_str).unwrap_or("");
      let event_thread = event.pointer("/params/threadId")
        .or_else(|| event.pointer("/params/thread/id"))
        .and_then(Value::as_str)
        .unwrap_or("");
      let event_turn = event.pointer("/params/turnId")
        .or_else(|| event.pointer("/params/turn/id"))
        .and_then(Value::as_str)
        .unwrap_or("");
      if !event_thread.is_empty() && event_thread != thread_id { continue; }
      if !turn_id.is_empty() && !event_turn.is_empty() && event_turn != turn_id { continue; }
      match method {
        "item/agentMessage/delta" => {
          if let Some(delta) = event.pointer("/params/delta").or_else(|| event.pointer("/params/textDelta")).and_then(Value::as_str) {
            answer.push_str(delta);
          }
        }
        "item/completed" => {
          if let Some(text) = event.pointer("/params/item")
            .filter(|item| item.get("type").and_then(Value::as_str) == Some("agentMessage"))
            .and_then(|item| item.get("text"))
            .and_then(Value::as_str)
          {
            if answer.trim().is_empty() { answer = text.to_string(); }
          }
        }
        "turn/completed" => {
          let status = event.pointer("/params/turn/status").and_then(Value::as_str).unwrap_or("completed");
          if status != "completed" {
            return Err(event.pointer("/params/turn/error/message").and_then(Value::as_str).unwrap_or("Codex turn failed").to_string());
          }
          if answer.trim().is_empty() {
            return Err("Codex completed without an answer".to_string());
          }
          return Ok(answer.trim().to_string());
        }
        "turn/failed" => {
          return Err(event.pointer("/params/error/message").and_then(Value::as_str).unwrap_or("Codex turn failed").to_string());
        }
        _ => {}
      }
    }
  }
}

fn initialize_params() -> Value {
  json!({
    "clientInfo": { "name": "elephant", "title": "Elephant", "version": env!("CARGO_PKG_VERSION") },
    "capabilities": { "experimentalApi": true, "optOutNotificationMethods": ["mcpServer/startupStatus/updated"] }
  })
}

fn thread_start_params(model: &str, cwd: &str) -> Value {
  json!({
    "model": model,
    "cwd": cwd,
    "approvalPolicy": "never",
    "sandbox": "read-only",
    "serviceName": "elephant",
    "ephemeral": true,
    "environments": [],
    "selectedCapabilityRoots": []
  })
}

fn turn_start_params(thread_id: &str, model: &str, cwd: &str, prompt: &str) -> Value {
  json!({
    "threadId": thread_id,
    "input": [{ "type": "text", "text": prompt }],
    "model": model,
    "cwd": cwd,
    "approvalPolicy": "never",
    "sandboxPolicy": { "type": "readOnly", "networkAccess": false }
  })
}

fn push_candidate(out: &mut Vec<(PathBuf, String)>, seen: &mut HashSet<PathBuf>, path: PathBuf, source: impl Into<String>) {
  if path.as_os_str().is_empty() { return; }
  let id = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
  if seen.insert(id) { out.push((path, source.into())); }
}

fn find_on_path(binary: &str) -> Option<PathBuf> {
  env::var_os("PATH").and_then(|path| env::split_paths(&path).map(|directory| directory.join(binary)).find(|candidate| candidate.is_file()))
}

async fn probe_runtime(path: PathBuf, source: String) -> Option<Runtime> {
  if !path.is_file() { return None; }
  let version_output = timeout(PROBE_TIMEOUT, Command::new(&path).arg("--version").stdin(Stdio::null()).output()).await.ok()?.ok()?;
  if !version_output.status.success() { return None; }
  let help_output = timeout(PROBE_TIMEOUT, Command::new(&path).args(["app-server", "--help"]).stdin(Stdio::null()).output()).await.ok()?.ok()?;
  if !help_output.status.success() { return None; }
  let help = format!("{}\n{}", String::from_utf8_lossy(&help_output.stdout), String::from_utf8_lossy(&help_output.stderr)).to_ascii_lowercase();
  if !help.contains("app-server") || (!help.contains("stdio") && !help.contains("--listen")) { return None; }
  let version = {
    let stdout = String::from_utf8_lossy(&version_output.stdout).trim().to_string();
    if stdout.is_empty() { String::from_utf8_lossy(&version_output.stderr).trim().to_string() } else { stdout }
  };
  Some(Runtime { path, version, source })
}

async fn seed_authentication(target_home: &Path) -> Result<(), String> {
  let target = target_home.join("auth.json");
  if target.is_file() { return Ok(()); }
  let mut candidates = Vec::new();
  if let Some(home) = env::var_os("CODEX_HOME") { candidates.push(PathBuf::from(home).join("auth.json")); }
  let user_home = env::var_os("HOME").or_else(|| env::var_os("USERPROFILE")).map(PathBuf::from);
  if let Some(home) = user_home {
    candidates.push(home.join(".codex").join("auth.json"));
    candidates.push(home.join(".elephantnote").join("codex-home").join("auth.json"));
  }
  if let Some(source) = candidates.into_iter().find(|path| path.is_file()) {
    fs::copy(source, &target).await.map_err(|error| error.to_string())?;
    #[cfg(unix)]
    {
      use std::os::unix::fs::PermissionsExt;
      let mut permissions = fs::metadata(&target).await.map_err(|error| error.to_string())?.permissions();
      permissions.set_mode(0o600);
      fs::set_permissions(&target, permissions).await.map_err(|error| error.to_string())?;
    }
  }
  Ok(())
}

fn success(id: u64, result: Value) -> Value {
  json!({ "protocol": SERVICE_PROTOCOL, "id": id, "ok": true, "result": result })
}

fn failure(id: u64, message: impl Into<String>) -> Value {
  json!({ "protocol": SERVICE_PROTOCOL, "id": id, "ok": false, "error": { "message": message.into() } })
}

#[tokio::main]
async fn main() {
  let mut service = match CodexService::new().await {
    Ok(service) => service,
    Err(error) => { println!("{}", failure(0, error)); return; }
  };
  let mut lines = BufReader::new(io::stdin()).lines();
  let mut writer = BufWriter::new(io::stdout());
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
    } else {
      match service.handle(method, params).await {
        Ok(result) => success(id, result),
        Err(error) => failure(id, error),
      }
    };
    if writer.write_all(format!("{response}\n").as_bytes()).await.is_err() || writer.flush().await.is_err() { break; }
    if method == "service.stop" { break; }
  }
  let _ = service.stop().await;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn thread_configuration_is_read_only() {
    let value = thread_start_params("gpt", "/tmp");
    assert_eq!(value.get("approvalPolicy").and_then(Value::as_str), Some("never"));
    assert_eq!(value.get("sandbox").and_then(Value::as_str), Some("read-only"));
  }

  #[test]
  fn package_candidate_is_confined_to_package_root() {
    let root = PathBuf::from("/addon");
    let candidate = root.join("runtime").join(if cfg!(windows) { "codex.exe" } else { "codex" });
    assert!(candidate.starts_with(&root));
  }
}

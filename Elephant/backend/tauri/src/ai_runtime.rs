use reqwest::blocking::{Client, RequestBuilder};
use serde_json::{json, Map, Value};
use std::{
  io::{BufRead, BufReader, Write},
  process::{Child, ChildStdin, ChildStdout, Command, Stdio},
  sync::{Arc, Mutex},
  thread,
  time::{Duration, Instant},
};
use tauri::State;

pub type R<T> = Result<T, String>;
const CODEX_CLIENT_NAME: &str = "elephantnote";
const CODEX_CLIENT_TITLE: &str = "ElephantNote";
const CODEX_CLIENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const OPENCODE_DEFAULT_ENDPOINT: &str = "http://127.0.0.1:4096";
const HTTP_TIMEOUT_SECS: u64 = 15;

#[derive(Clone, Default)]
pub struct AiRuntimeState {
  codex: Arc<Mutex<Option<CodexConnection>>>,
}

impl AiRuntimeState {
  pub fn new() -> Self {
    Self::default()
  }

  fn codex_request(&self, method: &str, params: Value) -> R<RpcOutcome> {
    let mut guard = self.codex.lock().map_err(|_| "Codex runtime lock is poisoned.".to_string())?;
    let must_restart = match guard.as_mut() {
      Some(connection) => connection.child.try_wait().map_err(|error| error.to_string())?.is_some(),
      None => true,
    };
    if must_restart {
      *guard = Some(CodexConnection::spawn()?);
    }
    guard
      .as_mut()
      .ok_or_else(|| "Codex app-server did not start.".to_string())?
      .request(method, params)
  }

  fn codex_turn(&self, params: Value) -> R<Value> {
    let mut guard = self.codex.lock().map_err(|_| "Codex runtime lock is poisoned.".to_string())?;
    let must_restart = match guard.as_mut() {
      Some(connection) => connection.child.try_wait().map_err(|error| error.to_string())?.is_some(),
      None => true,
    };
    if must_restart {
      *guard = Some(CodexConnection::spawn()?);
    }
    guard
      .as_mut()
      .ok_or_else(|| "Codex app-server did not start.".to_string())?
      .start_turn(params)
  }

  fn stop_codex(&self) {
    if let Ok(mut guard) = self.codex.lock() {
      if let Some(mut connection) = guard.take() {
        let _ = connection.child.kill();
        let _ = connection.child.wait();
      }
    }
  }
}

impl Drop for AiRuntimeState {
  fn drop(&mut self) {
    self.stop_codex();
  }
}

struct CodexConnection {
  child: Child,
  stdin: ChildStdin,
  stdout: BufReader<ChildStdout>,
  next_id: u64,
  executable: String,
  version: String,
}

#[derive(Debug)]
struct RpcOutcome {
  result: Value,
  notifications: Vec<Value>,
}

impl CodexConnection {
  fn spawn() -> R<Self> {
    let executable = which::which("codex")
      .map_err(|_| "Codex CLI is not installed or is not available in PATH.".to_string())?;
    let executable_text = executable.to_string_lossy().to_string();
    let version = Command::new(&executable)
      .arg("--version")
      .output()
      .ok()
      .filter(|output| output.status.success())
      .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
      .unwrap_or_default();

    eprintln!("[AI][codex] process:start executable={}", executable_text);
    let mut child = Command::new(&executable)
      .arg("app-server")
      .arg("--listen")
      .arg("stdio://")
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .spawn()
      .map_err(|error| format!("Unable to start codex app-server: {error}"))?;

    let stdin = child.stdin.take().ok_or_else(|| "Codex app-server stdin is unavailable.".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Codex app-server stdout is unavailable.".to_string())?;
    if let Some(stderr) = child.stderr.take() {
      thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines().map_while(Result::ok) {
          let clean = redact_text(&line);
          if !clean.trim().is_empty() {
            eprintln!("[AI][codex][stderr] {clean}");
          }
        }
      });
    }

    let mut connection = Self {
      child,
      stdin,
      stdout: BufReader::new(stdout),
      next_id: 1,
      executable: executable_text,
      version,
    };
    let initialized = connection.request(
      "initialize",
      json!({
        "clientInfo": {
          "name": CODEX_CLIENT_NAME,
          "title": CODEX_CLIENT_TITLE,
          "version": CODEX_CLIENT_VERSION
        }
      }),
    )?;
    connection.send_notification("initialized", json!({}))?;
    eprintln!(
      "[AI][codex] protocol:initialized executable={} version={} platform={}",
      connection.executable,
      connection.version,
      initialized.result.get("platformFamily").and_then(Value::as_str).unwrap_or("unknown")
    );
    Ok(connection)
  }

  fn send_json(&mut self, value: &Value) -> R<()> {
    let raw = serde_json::to_string(value).map_err(|error| error.to_string())?;
    self.stdin.write_all(raw.as_bytes()).map_err(|error| error.to_string())?;
    self.stdin.write_all(b"\n").map_err(|error| error.to_string())?;
    self.stdin.flush().map_err(|error| error.to_string())
  }

  fn send_notification(&mut self, method: &str, params: Value) -> R<()> {
    self.send_json(&json!({ "method": method, "params": params }))
  }

  fn request(&mut self, method: &str, params: Value) -> R<RpcOutcome> {
    let id = self.next_id;
    self.next_id += 1;
    eprintln!("[AI][codex] request:start id={id} method={method}");
    self.send_json(&json!({ "id": id, "method": method, "params": params }))?;
    let started = Instant::now();
    let outcome = read_until_response(&mut self.stdout, &mut self.stdin, id)?;
    eprintln!(
      "[AI][codex] request:complete id={} method={} duration_ms={} notifications={}",
      id,
      method,
      started.elapsed().as_millis(),
      outcome.notifications.len()
    );
    Ok(outcome)
  }

  fn start_turn(&mut self, params: Value) -> R<Value> {
    let initial = self.request("turn/start", params)?;
    let turn_id = initial
      .result
      .get("turn")
      .and_then(|turn| turn.get("id"))
      .and_then(Value::as_str)
      .unwrap_or("")
      .to_string();
    let mut text = String::new();
    let mut events = initial.notifications;
    for event in &events {
      append_codex_text(event, &mut text);
    }

    loop {
      let message = read_rpc_message(&mut self.stdout)?;
      if is_server_request(&message) {
        deny_server_request(&mut self.stdin, &message)?;
        events.push(message);
        continue;
      }
      append_codex_text(&message, &mut text);
      let completed = message.get("method").and_then(Value::as_str) == Some("turn/completed");
      events.push(message.clone());
      if completed {
        let completed_turn = message.get("params").and_then(|params| params.get("turn")).cloned().unwrap_or(Value::Null);
        eprintln!("[AI][codex] turn:complete turn_id={} chars={} events={}", turn_id, text.chars().count(), events.len());
        return Ok(json!({
          "ok": true,
          "provider": "codex",
          "runtime": "codex-app-server",
          "turnId": turn_id,
          "text": text,
          "turn": completed_turn,
          "events": events
        }));
      }
    }
  }
}

fn read_rpc_message<Rd: BufRead>(reader: &mut Rd) -> R<Value> {
  loop {
    let mut line = String::new();
    let count = reader.read_line(&mut line).map_err(|error| error.to_string())?;
    if count == 0 {
      return Err("The AI runtime closed its output stream.".to_string());
    }
    if line.trim().is_empty() {
      continue;
    }
    return serde_json::from_str(line.trim()).map_err(|error| format!("Invalid JSONL from AI runtime: {error}"));
  }
}

fn read_until_response<Rd: BufRead, Wr: Write>(reader: &mut Rd, writer: &mut Wr, expected_id: u64) -> R<RpcOutcome> {
  let mut notifications = Vec::new();
  loop {
    let message = read_rpc_message(reader)?;
    if message.get("id").and_then(Value::as_u64) == Some(expected_id) && message.get("method").is_none() {
      if let Some(error) = message.get("error") {
        return Err(format_rpc_error(error));
      }
      return Ok(RpcOutcome {
        result: message.get("result").cloned().unwrap_or(Value::Null),
        notifications,
      });
    }
    if is_server_request(&message) {
      deny_server_request(writer, &message)?;
    }
    notifications.push(message);
  }
}

fn is_server_request(message: &Value) -> bool {
  message.get("id").is_some() && message.get("method").and_then(Value::as_str).is_some()
}

fn deny_server_request<Wr: Write>(writer: &mut Wr, message: &Value) -> R<()> {
  let Some(id) = message.get("id") else { return Ok(()); };
  let method = message.get("method").and_then(Value::as_str).unwrap_or("unknown");
  let response = json!({
    "id": id,
    "error": {
      "code": -32001,
      "message": format!("ElephantNote did not authorize server request {method}.")
    }
  });
  let raw = serde_json::to_string(&response).map_err(|error| error.to_string())?;
  writer.write_all(raw.as_bytes()).map_err(|error| error.to_string())?;
  writer.write_all(b"\n").map_err(|error| error.to_string())?;
  writer.flush().map_err(|error| error.to_string())
}

fn append_codex_text(message: &Value, output: &mut String) {
  let method = message.get("method").and_then(Value::as_str).unwrap_or("");
  if method == "item/agentMessage/delta" {
    if let Some(delta) = message.get("params").and_then(|params| params.get("delta")).and_then(Value::as_str) {
      output.push_str(delta);
    }
  } else if output.is_empty() && method == "item/completed" {
    if let Some(text) = message
      .get("params")
      .and_then(|params| params.get("item"))
      .and_then(|item| item.get("text").or_else(|| item.get("content")))
      .and_then(Value::as_str)
    {
      output.push_str(text);
    }
  }
}

fn format_rpc_error(error: &Value) -> String {
  let code = error.get("code").map(Value::to_string).unwrap_or_else(|| "unknown".to_string());
  let message = error.get("message").and_then(Value::as_str).unwrap_or("Unknown app-server error");
  format!("Codex app-server error {code}: {message}")
}

fn redact_text(input: &str) -> String {
  if let Ok(mut value) = serde_json::from_str::<Value>(input) {
    redact_value(&mut value);
    return serde_json::to_string(&value).unwrap_or_else(|_| "[redacted-json]".to_string());
  }
  let lower = input.to_ascii_lowercase();
  if lower.contains("access_token") || lower.contains("refreshtoken") || lower.contains("api_key") || lower.contains("authorization") {
    "[redacted-sensitive-log]".to_string()
  } else {
    input.to_string()
  }
}

fn redact_value(value: &mut Value) {
  match value {
    Value::Object(object) => {
      for (key, child) in object.iter_mut() {
        let normalized = key.to_ascii_lowercase().replace(['_', '-'], "");
        if normalized.contains("token") || normalized.contains("apikey") || normalized == "authorization" || normalized == "password" {
          *child = Value::String("[redacted]".to_string());
        } else {
          redact_value(child);
        }
      }
    }
    Value::Array(items) => items.iter_mut().for_each(redact_value),
    _ => {}
  }
}

fn provider_name(provider: Option<String>) -> String {
  provider.unwrap_or_else(|| "codex".to_string()).trim().to_ascii_lowercase()
}

fn normalize_opencode_endpoint(endpoint: Option<String>) -> R<String> {
  let value = endpoint.unwrap_or_else(|| OPENCODE_DEFAULT_ENDPOINT.to_string());
  let value = value.trim().trim_end_matches('/').to_string();
  let allowed = value.starts_with("http://127.0.0.1:") || value.starts_with("http://localhost:") || value == "http://127.0.0.1" || value == "http://localhost";
  if !allowed {
    return Err("OpenCode endpoint must be an HTTP loopback address (127.0.0.1 or localhost).".to_string());
  }
  Ok(value)
}

fn opencode_client() -> R<Client> {
  Client::builder()
    .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
    .build()
    .map_err(|error| error.to_string())
}

fn with_opencode_auth(request: RequestBuilder, username: Option<String>, password: Option<String>) -> RequestBuilder {
  match password.filter(|value| !value.is_empty()) {
    Some(password) => request.basic_auth(username.unwrap_or_else(|| "opencode".to_string()), Some(password)),
    None => request,
  }
}

fn opencode_request(
  method: reqwest::Method,
  endpoint: Option<String>,
  path: &str,
  body: Option<Value>,
  username: Option<String>,
  password: Option<String>,
) -> R<Value> {
  let endpoint = normalize_opencode_endpoint(endpoint)?;
  let client = opencode_client()?;
  let url = format!("{endpoint}{path}");
  let mut request = with_opencode_auth(client.request(method, &url), username, password);
  if let Some(body) = body {
    request = request.json(&body);
  }
  let response = request.send().map_err(|error| format!("OpenCode request failed for {url}: {error}"))?;
  let status = response.status();
  let text = response.text().map_err(|error| error.to_string())?;
  if !status.is_success() {
    return Err(format!("OpenCode returned HTTP {} for {}: {}", status.as_u16(), path, text));
  }
  if text.trim().is_empty() {
    return Ok(Value::Null);
  }
  serde_json::from_str(&text).map_err(|error| format!("OpenCode returned invalid JSON for {path}: {error}"))
}

fn parse_model_reference(model: Option<String>) -> Option<Value> {
  let model = model?.trim().to_string();
  if model.is_empty() {
    return None;
  }
  let (provider_id, model_id) = model.split_once('/')?;
  if provider_id.is_empty() || model_id.is_empty() {
    return None;
  }
  Some(json!({ "providerID": provider_id, "modelID": model_id }))
}

fn flatten_opencode_models(payload: &Value) -> Vec<Value> {
  let providers = payload.get("providers").and_then(Value::as_array).cloned().unwrap_or_default();
  let mut models = Vec::new();
  for provider in providers {
    let provider_id = provider.get("id").or_else(|| provider.get("name")).and_then(Value::as_str).unwrap_or("");
    let provider_name = provider.get("name").and_then(Value::as_str).unwrap_or(provider_id);
    let provider_models = provider.get("models").and_then(Value::as_object).cloned().unwrap_or_else(Map::new);
    for (model_id, model) in provider_models {
      let name = model.get("name").and_then(Value::as_str).unwrap_or(&model_id);
      models.push(json!({
        "id": format!("{provider_id}/{model_id}"),
        "model": model_id,
        "name": name,
        "provider": "opencode",
        "providerId": provider_id,
        "providerName": provider_name,
        "raw": model
      }));
    }
  }
  models
}

async fn blocking<T, F>(operation: F) -> R<T>
where
  T: Send + 'static,
  F: FnOnce() -> R<T> + Send + 'static,
{
  tauri::async_runtime::spawn_blocking(operation)
    .await
    .map_err(|error| format!("AI runtime task failed: {error}"))?
}

#[tauri::command]
pub async fn tauri_ai_runtime_status(
  state: State<'_, AiRuntimeState>,
  provider: Option<String>,
  endpoint: Option<String>,
  username: Option<String>,
  password: Option<String>,
) -> R<Value> {
  let provider = provider_name(provider);
  if provider == "codex" {
    let executable = which::which("codex").ok();
    let version = executable.as_ref().and_then(|path| {
      Command::new(path).arg("--version").output().ok().filter(|output| output.status.success()).map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string())
    });
    return Ok(json!({
      "ok": executable.is_some(),
      "provider": "codex",
      "runtime": "codex-app-server",
      "installed": executable.is_some(),
      "executable": executable.map(|path| path.to_string_lossy().to_string()),
      "version": version
    }));
  }
  if provider == "opencode" {
    return blocking(move || {
      let health = opencode_request(reqwest::Method::GET, endpoint, "/global/health", None, username, password)?;
      Ok(json!({ "ok": true, "provider": "opencode", "runtime": "opencode-server", "health": health }))
    }).await;
  }
  let _ = state;
  Err(format!("Unsupported subscription provider: {provider}"))
}

#[tauri::command]
pub async fn tauri_ai_auth_status(
  state: State<'_, AiRuntimeState>,
  provider: Option<String>,
  endpoint: Option<String>,
  username: Option<String>,
  password: Option<String>,
) -> R<Value> {
  let provider = provider_name(provider);
  if provider == "codex" {
    let runtime = state.inner().clone();
    return blocking(move || {
      let outcome = runtime.codex_request("account/read", json!({ "refreshToken": false }))?;
      Ok(json!({ "ok": true, "provider": "codex", "runtime": "codex-app-server", "account": outcome.result }))
    }).await;
  }
  if provider == "opencode" {
    return blocking(move || {
      let data = opencode_request(reqwest::Method::GET, endpoint, "/provider", None, username, password)?;
      Ok(json!({ "ok": true, "provider": "opencode", "runtime": "opencode-server", "account": data }))
    }).await;
  }
  Err(format!("Unsupported subscription provider: {provider}"))
}

#[tauri::command]
pub async fn tauri_ai_auth_login_start(
  state: State<'_, AiRuntimeState>,
  provider: Option<String>,
  flow: Option<String>,
) -> R<Value> {
  let provider = provider_name(provider);
  if provider != "codex" {
    return Err("OpenCode authentication remains owned by OpenCode. Connect the provider with OpenCode, then ElephantNote will use the connected server.".to_string());
  }
  let login_type = match flow.as_deref() {
    Some("device") | Some("device-code") | Some("chatgptDeviceCode") => "chatgptDeviceCode",
    _ => "chatgpt",
  };
  let runtime = state.inner().clone();
  blocking(move || {
    let outcome = runtime.codex_request("account/login/start", json!({ "type": login_type }))?;
    Ok(json!({ "ok": true, "provider": "codex", "runtime": "codex-app-server", "login": outcome.result }))
  }).await
}

#[tauri::command]
pub async fn tauri_ai_auth_login_cancel(state: State<'_, AiRuntimeState>, login_id: String) -> R<Value> {
  let runtime = state.inner().clone();
  blocking(move || {
    let outcome = runtime.codex_request("account/login/cancel", json!({ "loginId": login_id }))?;
    Ok(json!({ "ok": true, "provider": "codex", "result": outcome.result }))
  }).await
}

#[tauri::command]
pub async fn tauri_ai_auth_logout(state: State<'_, AiRuntimeState>, provider: Option<String>) -> R<Value> {
  let provider = provider_name(provider);
  if provider != "codex" {
    return Err("OpenCode logout must be performed through OpenCode because it owns provider credentials.".to_string());
  }
  let runtime = state.inner().clone();
  blocking(move || {
    let outcome = runtime.codex_request("account/logout", json!({}))?;
    Ok(json!({ "ok": true, "provider": "codex", "result": outcome.result }))
  }).await
}

#[tauri::command]
pub async fn tauri_ai_models_list(
  state: State<'_, AiRuntimeState>,
  provider: Option<String>,
  endpoint: Option<String>,
  username: Option<String>,
  password: Option<String>,
  include_hidden: Option<bool>,
) -> R<Value> {
  let provider = provider_name(provider);
  if provider == "codex" {
    let runtime = state.inner().clone();
    return blocking(move || {
      let outcome = runtime.codex_request("model/list", json!({ "limit": 200, "includeHidden": include_hidden.unwrap_or(false) }))?;
      let models = outcome.result.get("data").cloned().unwrap_or_else(|| json!([]));
      Ok(json!({ "ok": true, "provider": "codex", "runtime": "codex-app-server", "models": models, "raw": outcome.result }))
    }).await;
  }
  if provider == "opencode" {
    return blocking(move || {
      let data = opencode_request(reqwest::Method::GET, endpoint, "/config/providers", None, username, password)?;
      let models = flatten_opencode_models(&data);
      Ok(json!({ "ok": true, "provider": "opencode", "runtime": "opencode-server", "models": models, "raw": data }))
    }).await;
  }
  Err(format!("Unsupported subscription provider: {provider}"))
}

#[tauri::command]
pub async fn tauri_ai_thread_start(
  state: State<'_, AiRuntimeState>,
  provider: Option<String>,
  model: Option<String>,
  cwd: Option<String>,
  endpoint: Option<String>,
  username: Option<String>,
  password: Option<String>,
  title: Option<String>,
) -> R<Value> {
  let provider = provider_name(provider);
  if provider == "codex" {
    let runtime = state.inner().clone();
    return blocking(move || {
      let mut params = json!({
        "approvalPolicy": "never",
        "sandbox": "readOnly",
        "serviceName": "elephantnote"
      });
      if let Some(model) = model.filter(|value| !value.trim().is_empty()) { params["model"] = json!(model); }
      if let Some(cwd) = cwd.filter(|value| !value.trim().is_empty()) { params["cwd"] = json!(cwd); }
      let outcome = runtime.codex_request("thread/start", params)?;
      Ok(json!({ "ok": true, "provider": "codex", "runtime": "codex-app-server", "thread": outcome.result.get("thread").cloned().unwrap_or(outcome.result) }))
    }).await;
  }
  if provider == "opencode" {
    return blocking(move || {
      let body = title.filter(|value| !value.trim().is_empty()).map(|title| json!({ "title": title })).unwrap_or_else(|| json!({}));
      let session = opencode_request(reqwest::Method::POST, endpoint, "/session", Some(body), username, password)?;
      Ok(json!({ "ok": true, "provider": "opencode", "runtime": "opencode-server", "thread": session }))
    }).await;
  }
  Err(format!("Unsupported subscription provider: {provider}"))
}

#[tauri::command]
pub async fn tauri_ai_turn_start(
  state: State<'_, AiRuntimeState>,
  provider: Option<String>,
  thread_id: String,
  message: String,
  model: Option<String>,
  cwd: Option<String>,
  endpoint: Option<String>,
  username: Option<String>,
  password: Option<String>,
) -> R<Value> {
  if thread_id.trim().is_empty() || message.trim().is_empty() {
    return Err("A thread id and a non-empty message are required.".to_string());
  }
  let provider = provider_name(provider);
  if provider == "codex" {
    let runtime = state.inner().clone();
    return blocking(move || {
      let mut params = json!({
        "threadId": thread_id,
        "input": [{ "type": "text", "text": message }],
        "approvalPolicy": "never",
        "sandboxPolicy": { "type": "readOnly" }
      });
      if let Some(model) = model.filter(|value| !value.trim().is_empty()) { params["model"] = json!(model); }
      if let Some(cwd) = cwd.filter(|value| !value.trim().is_empty()) { params["cwd"] = json!(cwd); }
      runtime.codex_turn(params)
    }).await;
  }
  if provider == "opencode" {
    return blocking(move || {
      let mut body = json!({ "parts": [{ "type": "text", "text": message }] });
      if let Some(model) = parse_model_reference(model) {
        body["model"] = model;
      }
      let path = format!("/session/{}/message", thread_id);
      let response = opencode_request(reqwest::Method::POST, endpoint, &path, Some(body), username, password)?;
      let text = response
        .get("parts")
        .and_then(Value::as_array)
        .map(|parts| parts.iter().filter_map(|part| part.get("text").and_then(Value::as_str)).collect::<Vec<_>>().join(""))
        .unwrap_or_default();
      Ok(json!({ "ok": true, "provider": "opencode", "runtime": "opencode-server", "threadId": thread_id, "text": text, "response": response }))
    }).await;
  }
  Err(format!("Unsupported subscription provider: {provider}"))
}

#[tauri::command]
pub async fn tauri_ai_turn_interrupt(
  state: State<'_, AiRuntimeState>,
  provider: Option<String>,
  thread_id: String,
  turn_id: Option<String>,
  endpoint: Option<String>,
  username: Option<String>,
  password: Option<String>,
) -> R<Value> {
  let provider = provider_name(provider);
  if provider == "codex" {
    let runtime = state.inner().clone();
    return blocking(move || {
      let mut params = json!({ "threadId": thread_id });
      if let Some(turn_id) = turn_id.filter(|value| !value.trim().is_empty()) { params["turnId"] = json!(turn_id); }
      let outcome = runtime.codex_request("turn/interrupt", params)?;
      Ok(json!({ "ok": true, "provider": "codex", "result": outcome.result }))
    }).await;
  }
  if provider == "opencode" {
    return blocking(move || {
      let path = format!("/session/{}/abort", thread_id);
      let result = opencode_request(reqwest::Method::POST, endpoint, &path, Some(json!({})), username, password)?;
      Ok(json!({ "ok": true, "provider": "opencode", "result": result }))
    }).await;
  }
  Err(format!("Unsupported subscription provider: {provider}"))
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::io::Cursor;

  #[test]
  fn protocol_reader_keeps_notifications_and_replies_to_server_requests() {
    let input = concat!(
      "{\"method\":\"item/agentMessage/delta\",\"params\":{\"delta\":\"hello\"}}\n",
      "{\"id\":99,\"method\":\"item/commandExecution/requestApproval\",\"params\":{}}\n",
      "{\"id\":7,\"result\":{\"ok\":true}}\n"
    );
    let mut reader = Cursor::new(input.as_bytes());
    let mut writer = Vec::new();
    let outcome = read_until_response(&mut reader, &mut writer, 7).unwrap();
    assert_eq!(outcome.result["ok"], json!(true));
    assert_eq!(outcome.notifications.len(), 2);
    let reply = String::from_utf8(writer).unwrap();
    assert!(reply.contains("ElephantNote did not authorize"));
    assert!(reply.contains("\"id\":99"));
  }

  #[test]
  fn codex_delta_extraction_is_deterministic() {
    let mut text = String::new();
    append_codex_text(&json!({ "method": "item/agentMessage/delta", "params": { "delta": "A" } }), &mut text);
    append_codex_text(&json!({ "method": "item/agentMessage/delta", "params": { "delta": "B" } }), &mut text);
    assert_eq!(text, "AB");
  }

  #[test]
  fn opencode_endpoint_rejects_remote_hosts() {
    assert!(normalize_opencode_endpoint(Some("https://example.com".to_string())).is_err());
    assert_eq!(normalize_opencode_endpoint(None).unwrap(), OPENCODE_DEFAULT_ENDPOINT);
  }

  #[test]
  fn opencode_model_reference_requires_provider_and_model() {
    assert_eq!(parse_model_reference(Some("openai/gpt-5".to_string())).unwrap()["providerID"], json!("openai"));
    assert!(parse_model_reference(Some("gpt-5".to_string())).is_none());
  }

  #[test]
  fn sensitive_logs_are_redacted() {
    let redacted = redact_text(r#"{\"access_token\":\"secret\",\"safe\":\"value\"}"#);
    assert!(!redacted.contains("secret"));
    assert!(redacted.contains("[redacted]"));
  }

  #[test]
  fn codex_app_server_handshake_is_real_when_codex_is_installed() {
    if which::which("codex").is_err() {
      return;
    }
    let mut connection = CodexConnection::spawn().expect("installed Codex must complete app-server initialization");
    let account = connection.request("account/read", json!({ "refreshToken": false })).expect("account/read must answer");
    assert!(account.result.get("requiresOpenaiAuth").is_some());
    let _ = connection.child.kill();
  }
}

use serde_json::{json, Value};
use std::{
  collections::HashMap,
  process::Stdio,
  sync::{
    atomic::{AtomicU64, Ordering},
    Arc, OnceLock,
  },
  time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  process::{Child, ChildStdin, Command},
  sync::{broadcast, oneshot, Mutex},
  time::timeout,
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TURN_TIMEOUT: Duration = Duration::from_secs(180);

type R<T> = Result<T, String>;

#[derive(Debug)]
pub struct CodexChatResult {
  pub answer: String,
  pub model: String,
  pub thread_id: String,
}

struct CodexClient {
  child: Arc<Mutex<Child>>,
  stdin: Arc<Mutex<ChildStdin>>,
  pending: Arc<Mutex<HashMap<u64, oneshot::Sender<R<Value>>>>>,
  events: broadcast::Sender<Value>,
  next_id: AtomicU64,
}

struct CodexAppServerState {
  client: Mutex<Option<Arc<CodexClient>>>,
}

static STATE: OnceLock<CodexAppServerState> = OnceLock::new();

fn state() -> &'static CodexAppServerState {
  STATE.get_or_init(CodexAppServerState::new)
}

impl CodexAppServerState {
  pub fn new() -> Self {
    Self { client: Mutex::new(None) }
  }

  async fn client(&self, app: &AppHandle) -> R<Arc<CodexClient>> {
    let mut slot = self.client.lock().await;
    if let Some(client) = slot.as_ref() {
      if client.is_running().await {
        return Ok(client.clone());
      }
    }

    let client = Arc::new(CodexClient::spawn(app.clone()).await?);
    *slot = Some(client.clone());
    Ok(client)
  }

  async fn stop(&self) -> R<()> {
    let client = self.client.lock().await.take();
    if let Some(client) = client {
      let mut child = client.child.lock().await;
      child.kill().await.map_err(|error| error.to_string())?;
    }
    Ok(())
  }
}

impl Default for CodexAppServerState {
  fn default() -> Self {
    Self::new()
  }
}

impl CodexClient {
  async fn spawn(app: AppHandle) -> R<Self> {
    let executable = which::which("codex")
      .map_err(|error| format!("Codex CLI is not installed or is not available in PATH: {error}"))?;
    let mut child = Command::new(executable)
      .args(["app-server", "--listen", "stdio://"])
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .kill_on_drop(true)
      .spawn()
      .map_err(|error| format!("Unable to start codex app-server: {error}"))?;

    let stdin = child.stdin.take().ok_or_else(|| "Codex app-server stdin is unavailable.".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Codex app-server stdout is unavailable.".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Codex app-server stderr is unavailable.".to_string())?;
    let child = Arc::new(Mutex::new(child));
    let stdin = Arc::new(Mutex::new(stdin));
    let pending = Arc::new(Mutex::new(HashMap::<u64, oneshot::Sender<R<Value>>>::new()));
    let (events, _) = broadcast::channel(256);

    {
      let pending = pending.clone();
      let events = events.clone();
      let app = app.clone();
      tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
          match lines.next_line().await {
            Ok(Some(line)) => {
              let message = match serde_json::from_str::<Value>(&line) {
                Ok(message) => message,
                Err(error) => {
                  eprintln!("[codex-app-server][warn] invalid JSONL: {error}; line={line}");
                  continue;
                }
              };

              if message.get("method").is_some() {
                let _ = events.send(message.clone());
                let _ = app.emit("elephantnote:codex:event", &message);
                continue;
              }

              let Some(id) = message.get("id").and_then(Value::as_u64) else {
                eprintln!("[codex-app-server][warn] response without numeric id: {message}");
                continue;
              };
              let sender = pending.lock().await.remove(&id);
              if let Some(sender) = sender {
                let result = if let Some(error) = message.get("error") {
                  Err(
                    error
                      .get("message")
                      .and_then(Value::as_str)
                      .unwrap_or("Codex app-server request failed.")
                      .to_string(),
                  )
                } else {
                  Ok(message.get("result").cloned().unwrap_or(Value::Null))
                };
                let _ = sender.send(result);
              }
            }
            Ok(None) => break,
            Err(error) => {
              eprintln!("[codex-app-server][warn] stdout read failed: {error}");
              break;
            }
          }
        }

        let mut pending = pending.lock().await;
        for (_, sender) in pending.drain() {
          let _ = sender.send(Err("Codex app-server stopped before responding.".to_string()));
        }
      });
    }

    tokio::spawn(async move {
      let mut lines = BufReader::new(stderr).lines();
      while let Ok(Some(line)) = lines.next_line().await {
        eprintln!("[codex-app-server] {line}");
      }
    });

    let client = Self { child, stdin, pending, events, next_id: AtomicU64::new(1) };
    client
      .request(
        "initialize",
        json!({
          "clientInfo": {
            "name": "elephantnote",
            "title": "ElephantNote",
            "version": env!("CARGO_PKG_VERSION")
          }
        }),
      )
      .await?;
    client.notify("initialized", json!({})).await?;
    Ok(client)
  }

  async fn is_running(&self) -> bool {
    self.child.lock().await.try_wait().ok().flatten().is_none()
  }

  async fn write(&self, message: &Value) -> R<()> {
    let line = serde_json::to_string(message).map_err(|error| error.to_string())?;
    let mut stdin = self.stdin.lock().await;
    stdin.write_all(line.as_bytes()).await.map_err(|error| error.to_string())?;
    stdin.write_all(b"\n").await.map_err(|error| error.to_string())?;
    stdin.flush().await.map_err(|error| error.to_string())
  }

  async fn request(&self, method: &str, params: Value) -> R<Value> {
    let id = self.next_id.fetch_add(1, Ordering::Relaxed);
    let (sender, receiver) = oneshot::channel();
    self.pending.lock().await.insert(id, sender);
    if let Err(error) = self.write(&json!({ "method": method, "id": id, "params": params })).await {
      self.pending.lock().await.remove(&id);
      return Err(error);
    }
    timeout(REQUEST_TIMEOUT, receiver)
      .await
      .map_err(|_| format!("Codex app-server request timed out: {method}"))?
      .map_err(|_| format!("Codex app-server response channel closed: {method}"))?
  }

  async fn notify(&self, method: &str, params: Value) -> R<()> {
    self.write(&json!({ "method": method, "params": params })).await
  }

  fn subscribe(&self) -> broadcast::Receiver<Value> {
    self.events.subscribe()
  }
}

fn account_summary(result: Value, version: String) -> Value {
  let account = result.get("account").cloned().unwrap_or(Value::Null);
  let connected = !account.is_null();
  json!({
    "installed": true,
    "running": true,
    "connected": connected,
    "account": account,
    "requiresOpenaiAuth": result.get("requiresOpenaiAuth").cloned().unwrap_or(Value::Bool(true)),
    "version": version
  })
}

fn codex_version() -> R<String> {
  let executable = which::which("codex")
    .map_err(|error| format!("Codex CLI is not installed or is not available in PATH: {error}"))?;
  let output = std::process::Command::new(executable)
    .arg("--version")
    .output()
    .map_err(|error| error.to_string())?;
  if !output.status.success() {
    return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
  }
  Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

async fn status(app: &AppHandle) -> R<Value> {
  let version = match codex_version() {
    Ok(version) => version,
    Err(error) => {
      return Ok(json!({
        "installed": false,
        "running": false,
        "connected": false,
        "error": error
      }));
    }
  };
  let client = state().client(app).await?;
  let account = client.request("account/read", json!({ "refreshToken": false })).await?;
  Ok(account_summary(account, version))
}

async fn login(app: &AppHandle, flow: Option<String>) -> R<Value> {
  let client = state().client(app).await?;
  let params = if flow.as_deref() == Some("device-code") {
    json!({ "type": "chatgptDeviceCode" })
  } else {
    json!({ "type": "chatgpt", "useHostedLoginSuccessPage": true, "appBrand": "chatgpt" })
  };
  client.request("account/login/start", params).await
}

async fn logout(app: &AppHandle) -> R<Value> {
  let client = state().client(app).await?;
  let result = client.request("account/logout", json!({})).await?;
  Ok(json!({ "ok": true, "result": result }))
}

async fn models(app: &AppHandle) -> R<Value> {
  let client = state().client(app).await?;
  client.request("model/list", json!({ "limit": 100, "includeHidden": false })).await
}

async fn rate_limits(app: &AppHandle) -> R<Value> {
  let client = state().client(app).await?;
  client.request("account/rateLimits/read", json!({})).await
}

async fn stop() -> R<Value> {
  state().stop().await?;
  Ok(json!({ "ok": true }))
}

pub async fn command(app: &AppHandle, payload: &Value) -> R<Value> {
  match payload.get("codexOperation").and_then(Value::as_str).unwrap_or("") {
    "status" => status(app).await,
    "login" => login(app, payload.get("flow").and_then(Value::as_str).map(str::to_string)).await,
    "logout" => logout(app).await,
    "models" => models(app).await,
    "rateLimits" => rate_limits(app).await,
    "stop" => stop().await,
    operation => Err(format!("Unsupported Codex operation: {operation}")),
  }
}

fn event_thread_id(event: &Value) -> &str {
  event
    .pointer("/params/threadId")
    .and_then(Value::as_str)
    .or_else(|| event.pointer("/params/thread/id").and_then(Value::as_str))
    .unwrap_or("")
}

fn event_turn_id(event: &Value) -> &str {
  event
    .pointer("/params/turnId")
    .and_then(Value::as_str)
    .or_else(|| event.pointer("/params/turn/id").and_then(Value::as_str))
    .unwrap_or("")
}

fn delta_text(event: &Value) -> &str {
  event
    .pointer("/params/delta")
    .and_then(Value::as_str)
    .or_else(|| event.pointer("/params/textDelta").and_then(Value::as_str))
    .unwrap_or("")
}

fn completed_agent_text(event: &Value) -> &str {
  event
    .pointer("/params/item")
    .filter(|item| item.get("type").and_then(Value::as_str) == Some("agentMessage"))
    .and_then(|item| item.get("text"))
    .and_then(Value::as_str)
    .unwrap_or("")
}

fn turn_failure(event: &Value) -> Option<String> {
  let status = event.pointer("/params/turn/status").and_then(Value::as_str).unwrap_or("");
  if status == "completed" {
    return None;
  }
  event
    .pointer("/params/turn/error/message")
    .and_then(Value::as_str)
    .map(str::to_string)
    .or_else(|| Some(format!("Codex turn ended with status: {status}")))
}

pub async fn chat(app: &AppHandle, model: &str, prompt: &str) -> R<CodexChatResult> {
  if model.trim().is_empty() {
    return Err("No Codex model is selected.".to_string());
  }
  if prompt.trim().is_empty() {
    return Err("Cannot send an empty prompt to Codex.".to_string());
  }

  let client = state().client(app).await?;
  let account = client.request("account/read", json!({ "refreshToken": false })).await?;
  if account.get("account").is_none_or(Value::is_null) {
    return Err("Codex is not authenticated. Connect your ChatGPT account in AI settings.".to_string());
  }

  let cwd = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("codex-chat-sandbox");
  tokio::fs::create_dir_all(&cwd).await.map_err(|error| error.to_string())?;
  let thread = client
    .request(
      "thread/start",
      json!({
        "model": model,
        "cwd": cwd.to_string_lossy(),
        "approvalPolicy": "never",
        "sandbox": "readOnly",
        "serviceName": "elephantnote"
      }),
    )
    .await?;
  let thread_id = thread
    .pointer("/thread/id")
    .and_then(Value::as_str)
    .ok_or_else(|| "Codex thread/start returned no thread id.".to_string())?
    .to_string();

  let mut events = client.subscribe();
  let turn = client
    .request(
      "turn/start",
      json!({
        "threadId": thread_id,
        "input": [{ "type": "text", "text": prompt }],
        "model": model,
        "cwd": cwd.to_string_lossy(),
        "approvalPolicy": "never",
        "sandboxPolicy": {
          "type": "readOnly",
          "access": {
            "type": "restricted",
            "includePlatformDefaults": true,
            "readableRoots": [cwd.to_string_lossy()]
          }
        }
      }),
    )
    .await?;
  let turn_id = turn
    .pointer("/turn/id")
    .and_then(Value::as_str)
    .ok_or_else(|| "Codex turn/start returned no turn id.".to_string())?
    .to_string();

  let mut answer = String::new();
  loop {
    let event = timeout(TURN_TIMEOUT, events.recv())
      .await
      .map_err(|_| "Codex generation timed out.".to_string())?
      .map_err(|error| format!("Codex event stream closed: {error}"))?;
    if !event_thread_id(&event).is_empty() && event_thread_id(&event) != thread_id {
      continue;
    }
    if !event_turn_id(&event).is_empty() && event_turn_id(&event) != turn_id {
      continue;
    }

    match event.get("method").and_then(Value::as_str).unwrap_or("") {
      "item/agentMessage/delta" => answer.push_str(delta_text(&event)),
      "item/completed" => {
        let text = completed_agent_text(&event);
        if !text.is_empty() {
          answer = text.to_string();
        }
      }
      "turn/completed" => {
        if let Some(error) = turn_failure(&event) {
          return Err(error);
        }
        break;
      }
      "error" => {
        let message = event
          .pointer("/params/error/message")
          .and_then(Value::as_str)
          .unwrap_or("Codex generation failed.");
        return Err(message.to_string());
      }
      _ => {}
    }
  }

  if answer.trim().is_empty() {
    return Err("Codex completed the turn without an assistant message.".to_string());
  }
  Ok(CodexChatResult { answer, model: model.to_string(), thread_id })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_delta_text_from_current_protocol_shape() {
    let event = json!({ "method": "item/agentMessage/delta", "params": { "delta": "hello" } });
    assert_eq!(delta_text(&event), "hello");
  }

  #[test]
  fn reads_completed_agent_message_as_authoritative_text() {
    let event = json!({ "method": "item/completed", "params": { "item": { "type": "agentMessage", "text": "final" } } });
    assert_eq!(completed_agent_text(&event), "final");
  }

  #[test]
  fn completed_turn_has_no_failure() {
    let event = json!({ "method": "turn/completed", "params": { "turn": { "status": "completed" } } });
    assert!(turn_failure(&event).is_none());
  }

  #[test]
  fn failed_turn_returns_server_message() {
    let event = json!({ "method": "turn/completed", "params": { "turn": { "status": "failed", "error": { "message": "quota" } } } });
    assert_eq!(turn_failure(&event).as_deref(), Some("quota"));
  }
}

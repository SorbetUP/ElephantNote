use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

type R<T> = Result<T, String>;
const MODEL_PROVIDER: &str = "node-llama-cpp";
const DEFAULT_PORT: u16 = 39281;

struct ManagedServer {
  model_path: String,
  base_url: String,
  child: Child,
}

pub struct LocalChatResult {
  pub answer: String,
  pub provider: String,
  pub model: String,
  pub base_url: String,
}

static LOCAL_SERVER: OnceLock<Mutex<Option<ManagedServer>>> = OnceLock::new();

fn server_slot() -> &'static Mutex<Option<ManagedServer>> {
  LOCAL_SERVER.get_or_init(|| Mutex::new(None))
}

fn home_dir() -> PathBuf {
  env::var_os("HOME")
    .or_else(|| env::var_os("USERPROFILE"))
    .map(PathBuf::from)
    .unwrap_or_else(env::temp_dir)
}

fn model_dir() -> PathBuf {
  env::var_os("ELEPHANTNOTE_MODEL_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|| home_dir().join(".elephantnote").join("models").join(MODEL_PROVIDER))
}

fn text(value: &Value, keys: &[&str]) -> String {
  if let Some(raw) = value.as_str() {
    return raw.trim().to_string();
  }
  keys
    .iter()
    .find_map(|key| value.get(*key).and_then(Value::as_str))
    .map(str::trim)
    .unwrap_or("")
    .to_string()
}

fn selected_model_candidates(selection: &str) -> Vec<String> {
  let raw = selection.trim();
  let file_name = raw.replace('\\', "/").rsplit('/').next().unwrap_or(raw).to_string();
  let mut candidates = vec![raw.to_string(), file_name.clone()];
  if !file_name.to_lowercase().ends_with(".gguf") {
    candidates.push(format!("{file_name}.gguf"));
  }
  candidates.sort();
  candidates.dedup();
  candidates
}

fn manifest_matches(manifest_path: &Path, candidates: &[String]) -> bool {
  let Some(manifest) = fs::read_to_string(manifest_path).ok().and_then(|raw| serde_json::from_str::<Value>(&raw).ok()) else {
    return false;
  };
  let fields = [
    text(&manifest, &["id"]),
    text(&manifest, &["name"]),
    text(&manifest, &["model"]),
    text(&manifest, &["fileName"]),
    text(&manifest, &["filename"]),
    text(&manifest, &["modelPath", "path"]),
    text(&manifest, &["repoId"]),
    text(&manifest, &["originalRepoId"]),
  ];
  fields
    .iter()
    .filter(|value| !value.trim().is_empty())
    .any(|value| candidates.iter().any(|candidate| candidate == value || value.ends_with(candidate)))
}

fn resolve_model_path(selection: &str) -> R<Option<PathBuf>> {
  let selection = selection.trim();
  if selection.is_empty() {
    return Ok(None);
  }

  let direct = PathBuf::from(selection);
  if direct.is_file() {
    return Ok(Some(direct));
  }

  let dir = model_dir();
  let candidates = selected_model_candidates(selection);
  if !dir.exists() {
    return Err(format!(
      "Local GGUF model directory does not exist: {}. Download a GGUF model first.",
      dir.to_string_lossy()
    ));
  }

  for item in fs::read_dir(&dir).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let path = item.path();
    if !path.is_file() {
      continue;
    }
    let filename = path.file_name().and_then(|name| name.to_str()).unwrap_or("").to_string();
    if !filename.to_lowercase().ends_with(".gguf") {
      continue;
    }
    let full = path.to_string_lossy().to_string();
    let manifest_path = PathBuf::from(format!("{}.model.json", full));
    if candidates.iter().any(|candidate| candidate == &filename || full.ends_with(candidate)) || manifest_matches(&manifest_path, &candidates) {
      return Ok(Some(path));
    }
  }

  Err(format!(
    "Selected chat model `{selection}` is not installed as a GGUF file in {}.",
    dir.to_string_lossy()
  ))
}

fn port_from_env_or_payload(payload: &Value) -> u16 {
  env::var("ELEPHANTNOTE_LLAMA_PORT")
    .ok()
    .and_then(|value| value.parse::<u16>().ok())
    .or_else(|| payload.get("llamaPort").and_then(Value::as_u64).and_then(|value| u16::try_from(value).ok()))
    .unwrap_or(DEFAULT_PORT)
}

fn context_from_payload(payload: &Value) -> String {
  payload
    .get("contextWindow")
    .or_else(|| payload.get("ctxSize"))
    .and_then(Value::as_u64)
    .filter(|value| *value >= 512)
    .unwrap_or(4096)
    .to_string()
}

fn server_candidates() -> Vec<String> {
  let mut out = Vec::new();
  for key in ["ELEPHANTNOTE_LLAMA_SERVER", "LLAMA_SERVER", "LLAMA_CPP_SERVER"] {
    if let Ok(value) = env::var(key) {
      if !value.trim().is_empty() {
        out.push(value);
      }
    }
  }
  out.extend([
    "llama-server".to_string(),
    "llama.cpp-server".to_string(),
    "llama-cpp-server".to_string(),
    "/opt/homebrew/bin/llama-server".to_string(),
    "/usr/local/bin/llama-server".to_string(),
  ]);
  out.sort();
  out.dedup();
  out
}

async fn endpoint_ready(base_url: &str) -> bool {
  let client = Client::new();
  for _ in 0..80 {
    if client.get(format!("{}/models", base_url.trim_end_matches('/'))).send().await.is_ok() {
      return true;
    }
    thread::sleep(Duration::from_millis(250));
  }
  false
}

fn active_server_provider(model_path: &str, port: u16) -> Option<(String, String)> {
  let mut guard = server_slot().lock().ok()?;
  if let Some(server) = guard.as_mut() {
    if server.model_path == model_path && server.child.try_wait().ok().flatten().is_none() {
      return Some((server.base_url.clone(), "managed llama-server".to_string()));
    }
    let _ = server.child.kill();
    *guard = None;
  }
  Some((format!("http://127.0.0.1:{port}/v1"), "new llama-server".to_string()))
}

async fn ensure_server(model_path: &Path, payload: &Value) -> R<String> {
  let model_path_string = model_path.to_string_lossy().to_string();
  let port = port_from_env_or_payload(payload);
  let (base_url, status) = active_server_provider(&model_path_string, port)
    .ok_or_else(|| "Unable to lock local llama server state.".to_string())?;

  if status.starts_with("managed") {
    eprintln!("[tauri-rag] reusing local llama.cpp server base={} model={}", base_url, model_path_string);
    return Ok(base_url);
  }

  eprintln!("[tauri-rag] starting local llama.cpp server for model={} port={}", model_path_string, port);
  let context = context_from_payload(payload);
  let mut spawn_errors = Vec::new();

  for candidate in server_candidates() {
    eprintln!("[tauri-rag] trying llama server binary: {}", candidate);
    let child = Command::new(&candidate)
      .arg("-m")
      .arg(&model_path_string)
      .arg("--host")
      .arg("127.0.0.1")
      .arg("--port")
      .arg(port.to_string())
      .arg("-c")
      .arg(&context)
      .stdout(Stdio::inherit())
      .stderr(Stdio::inherit())
      .spawn();

    let mut child = match child {
      Ok(child) => child,
      Err(error) => {
        spawn_errors.push(format!("{candidate}: {error}"));
        continue;
      }
    };

    if endpoint_ready(&base_url).await {
      let mut guard = server_slot().lock().map_err(|_| "Unable to lock local llama server state.".to_string())?;
      *guard = Some(ManagedServer { model_path: model_path_string.clone(), base_url: base_url.clone(), child });
      eprintln!("[tauri-rag] local llama.cpp server ready base={} model={}", base_url, model_path_string);
      return Ok(base_url);
    }

    let _ = child.kill();
    spawn_errors.push(format!("{candidate}: server did not become ready on {base_url}"));
  }

  Err(format!(
    "Unable to start a local llama.cpp server. Install `llama-server` and keep it in PATH, or set ELEPHANTNOTE_LLAMA_SERVER=/path/to/llama-server. Attempts: {}",
    spawn_errors.join(" | ")
  ))
}

pub async fn chat_with_selected_model(selection: &str, messages: &[Value], payload: &Value) -> R<Option<LocalChatResult>> {
  let Some(model_path) = resolve_model_path(selection)? else {
    return Ok(None);
  };
  let base_url = ensure_server(&model_path, payload).await?;
  let model_name = model_path.file_name().and_then(|name| name.to_str()).unwrap_or("local.gguf").to_string();
  let temperature = payload.get("temperature").and_then(Value::as_f64).unwrap_or(0.2);
  let max_tokens = payload.get("maxTokens").or_else(|| payload.get("max_tokens")).and_then(Value::as_u64).unwrap_or(900);
  let body = json!({
    "model": model_name,
    "messages": messages,
    "temperature": temperature,
    "max_tokens": max_tokens
  });

  let response = Client::new()
    .post(format!("{}/chat/completions", base_url.trim_end_matches('/')))
    .json(&body)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
  if !status.is_success() {
    return Err(text(&data, &["error", "message"]).if_empty(format!("Local llama.cpp server returned HTTP {status}.")));
  }
  let answer = data
    .pointer("/choices/0/message/content")
    .and_then(Value::as_str)
    .or_else(|| data.pointer("/choices/0/text").and_then(Value::as_str))
    .unwrap_or("")
    .trim()
    .to_string();
  if answer.is_empty() {
    return Err("Local llama.cpp server returned an empty answer.".to_string());
  }
  Ok(Some(LocalChatResult {
    answer,
    provider: "local-llama.cpp".to_string(),
    model: model_name,
    base_url,
  }))
}

trait IfEmpty {
  fn if_empty(self, fallback: String) -> String;
}

impl IfEmpty for String {
  fn if_empty(self, fallback: String) -> String {
    if self.trim().is_empty() { fallback } else { self }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn selection_candidates_include_filename() {
    let values = selected_model_candidates("/tmp/model.Q4_K_M.gguf");
    assert!(values.contains(&"model.Q4_K_M.gguf".to_string()));
  }
}

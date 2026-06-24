use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::Duration;

type R<T> = Result<T, String>;
const MODEL_PROVIDER: &str = "node-llama-cpp";
const DEFAULT_PORT: u16 = 39281;
const DEFAULT_BASE_URL: &str = "http://127.0.0.1:39281/v1";

pub struct LocalChatResult {
  pub answer: String,
  pub provider: String,
  pub model: String,
  pub base_url: String,
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
  let normalized = raw.replace('\\', "/");
  let file_name = normalized.rsplit('/').next().unwrap_or(raw).to_string();
  let mut candidates = vec![raw.to_string(), normalized, file_name.clone()];
  if !file_name.to_lowercase().ends_with(".gguf") {
    candidates.push(format!("{file_name}.gguf"));
  }
  candidates.sort();
  candidates.dedup();
  candidates
}

fn manifest_matches(manifest_path: &Path, candidates: &[String]) -> bool {
  let Some(manifest) = fs::read_to_string(manifest_path)
    .ok()
    .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
  else {
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
    .any(|value| candidates.iter().any(|candidate| value == candidate || value.ends_with(candidate)))
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
    return Err(format!("Local GGUF model directory does not exist: {}.", dir.to_string_lossy()));
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

  Err(format!("Selected chat model `{selection}` is not installed in {}.", dir.to_string_lossy()))
}

fn base_url_from_env_or_payload(payload: &Value) -> String {
  let from_payload = text(payload, &["llamaBaseUrl", "baseUrl"]);
  env::var("ELEPHANTNOTE_LLAMA_BASE_URL")
    .ok()
    .filter(|value| !value.trim().is_empty())
    .or_else(|| env::var("LLAMA_CPP_BASE_URL").ok().filter(|value| !value.trim().is_empty()))
    .or_else(|| if from_payload.trim().is_empty() { None } else { Some(from_payload) })
    .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
    .trim_end_matches('/')
    .to_string()
}

fn context_size_from_payload(payload: &Value) -> String {
  payload
    .get("contextWindow")
    .or_else(|| payload.get("ctxSize"))
    .and_then(Value::as_u64)
    .filter(|value| *value >= 512)
    .unwrap_or(4096)
    .to_string()
}

fn local_port_from_base_url(base_url: &str) -> Option<u16> {
  let cleaned = base_url.trim_end_matches('/').trim_end_matches("/v1");
  for prefix in ["http://127.0.0.1:", "http://localhost:"] {
    if let Some(rest) = cleaned.strip_prefix(prefix) {
      let port = rest.split('/').next().unwrap_or(rest);
      return port.parse::<u16>().ok();
    }
  }
  None
}

fn server_binary_candidates() -> Vec<String> {
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

async fn server_ready(base_url: &str) -> bool {
  let Ok(client) = Client::builder().timeout(Duration::from_secs(2)).build() else {
    return false;
  };
  client
    .get(format!("{}/models", base_url))
    .send()
    .await
    .map(|response| response.status().is_success())
    .unwrap_or(false)
}

async fn wait_until_ready(base_url: &str) -> bool {
  for _ in 0..80 {
    if server_ready(base_url).await {
      return true;
    }
    thread::sleep(Duration::from_millis(250));
  }
  false
}

async fn start_server_if_needed(model_path: &Path, base_url: &str, payload: &Value) -> R<()> {
  if server_ready(base_url).await {
    return Ok(());
  }
  let port = local_port_from_base_url(base_url).unwrap_or(DEFAULT_PORT);
  let model_path_string = model_path.to_string_lossy().to_string();
  let context = context_size_from_payload(payload);
  let mut errors = Vec::new();

  eprintln!("[tauri-rag] starting llama server for model={} base={}", model_path_string, base_url);
  for binary in server_binary_candidates() {
    eprintln!("[tauri-rag] trying llama server binary: {}", binary);
    match Command::new(&binary)
      .arg("-m")
      .arg(&model_path_string)
      .arg("--host")
      .arg("127.0.0.1")
      .arg("--port")
      .arg(port.to_string())
      .arg("-c")
      .arg(&context)
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
    {
      Ok(_child) => {
        if wait_until_ready(base_url).await {
          return Ok(());
        }
        errors.push(format!("{}: endpoint did not become ready", binary));
      }
      Err(error) => errors.push(format!("{}: {}", binary, error)),
    }
  }
  Err(format!("Unable to start local llama server. Attempts: {}", errors.join(" | ")))
}

pub async fn chat_with_selected_model(selection: &str, messages: &[Value], payload: &Value) -> R<Option<LocalChatResult>> {
  let Some(model_path) = resolve_model_path(selection)? else {
    return Ok(None);
  };
  let base_url = base_url_from_env_or_payload(payload);
  start_server_if_needed(&model_path, &base_url, payload).await?;

  let model_name = model_path.file_name().and_then(|name| name.to_str()).unwrap_or("local.gguf").to_string();
  let temperature = payload.get("temperature").and_then(Value::as_f64).unwrap_or(0.2);
  let max_tokens = payload.get("maxTokens").or_else(|| payload.get("max_tokens")).and_then(Value::as_u64).unwrap_or(900);
  let body = json!({
    "model": model_name,
    "messages": messages,
    "temperature": temperature,
    "max_tokens": max_tokens
  });

  let response = Client::builder()
    .timeout(Duration::from_secs(120))
    .build()
    .map_err(|error| error.to_string())?
    .post(format!("{}/chat/completions", base_url))
    .json(&body)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
  if !status.is_success() {
    return Err(error_text(&data, format!("Local llama.cpp server returned HTTP {status}.")));
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

fn error_text(data: &Value, fallback: String) -> String {
  data.pointer("/error/message")
    .and_then(Value::as_str)
    .or_else(|| data.get("error").and_then(Value::as_str))
    .or_else(|| data.get("message").and_then(Value::as_str))
    .filter(|value| !value.trim().is_empty())
    .map(str::to_string)
    .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn selection_candidates_include_filename() {
    let values = selected_model_candidates("/tmp/model.Q4_K_M.gguf");
    assert!(values.contains(&"model.Q4_K_M.gguf".to_string()));
  }

  #[test]
  fn local_port_from_default_base_url() {
    assert_eq!(local_port_from_base_url(DEFAULT_BASE_URL), Some(DEFAULT_PORT));
  }
}

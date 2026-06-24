use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Manager};

type R<T> = Result<T, String>;
const MODEL_PROVIDER: &str = "node-llama-cpp";
const DEFAULT_PORT: u16 = 39281;
const DEFAULT_BASE_URL: &str = "http://127.0.0.1:39281/v1";

#[cfg(windows)]
const LLAMA_SERVER_BIN: &str = "llama-server.exe";
#[cfg(not(windows))]
const LLAMA_SERVER_BIN: &str = "llama-server";

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
    .unwrap_or_else(|| {
      home_dir()
        .join(".elephantnote")
        .join("models")
        .join(MODEL_PROVIDER)
    })
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

fn local_runtime_config(payload: &Value) -> &Value {
  payload
    .get("localRuntime")
    .or_else(|| payload.pointer("/aiConfig/localRuntime"))
    .or_else(|| payload.pointer("/config/localRuntime"))
    .unwrap_or(&Value::Null)
}

fn runtime_mode(payload: &Value) -> String {
  let config = local_runtime_config(payload);
  let mode = text(config, &["llamaServerMode", "serverMode", "mode"]);
  if mode.trim().is_empty() {
    "bundled".to_string()
  } else {
    mode.to_lowercase()
  }
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
    .any(|value| {
      candidates
        .iter()
        .any(|candidate| value == candidate || value.ends_with(candidate))
    })
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
      "Local GGUF model directory does not exist: {}.",
      dir.to_string_lossy()
    ));
  }

  for item in fs::read_dir(&dir).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let path = item.path();
    if !path.is_file() {
      continue;
    }
    let filename = path
      .file_name()
      .and_then(|name| name.to_str())
      .unwrap_or("")
      .to_string();
    if !filename.to_lowercase().ends_with(".gguf") {
      continue;
    }
    let full = path.to_string_lossy().to_string();
    let manifest_path = PathBuf::from(format!("{}.model.json", full));
    if candidates
      .iter()
      .any(|candidate| candidate == &filename || full.ends_with(candidate))
      || manifest_matches(&manifest_path, &candidates)
    {
      return Ok(Some(path));
    }
  }

  Err(format!(
    "Selected chat model `{selection}` is not installed in {}.",
    dir.to_string_lossy()
  ))
}

fn base_url_from_env_or_payload(payload: &Value) -> String {
  let runtime = local_runtime_config(payload);
  let from_runtime = text(runtime, &["llamaBaseUrl", "baseUrl"]);
  let from_payload = text(payload, &["llamaBaseUrl", "baseUrl"]);
  if !from_payload.trim().is_empty() {
    return from_payload.trim_end_matches('/').to_string();
  }
  if !from_runtime.trim().is_empty() {
    return from_runtime.trim_end_matches('/').to_string();
  }
  env::var("ELEPHANTNOTE_LLAMA_BASE_URL")
    .ok()
    .filter(|value| !value.trim().is_empty())
    .or_else(|| {
      env::var("LLAMA_CPP_BASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
    })
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

#[cfg(unix)]
fn ensure_executable(path: &Path) {
  use std::os::unix::fs::PermissionsExt;
  if let Ok(metadata) = fs::metadata(path) {
    let mut permissions = metadata.permissions();
    permissions.set_mode(permissions.mode() | 0o755);
    let _ = fs::set_permissions(path, permissions);
  }
}

#[cfg(not(unix))]
fn ensure_executable(_path: &Path) {}

fn push_if_file(out: &mut Vec<String>, path: PathBuf) {
  if path.is_file() {
    ensure_executable(&path);
    out.push(path.to_string_lossy().to_string());
  }
}

fn app_managed_binary_candidates(app: &AppHandle) -> Vec<String> {
  let mut out = Vec::new();
  if let Ok(resource_dir) = app.path().resource_dir() {
    push_if_file(&mut out, resource_dir.join(LLAMA_SERVER_BIN));
    push_if_file(&mut out, resource_dir.join("bin").join(LLAMA_SERVER_BIN));
  }
  if let Ok(local_data_dir) = app.path().app_local_data_dir() {
    push_if_file(
      &mut out,
      local_data_dir.join("llama.cpp").join(LLAMA_SERVER_BIN),
    );
  }
  for root in [
    PathBuf::from("bin"),
    PathBuf::from("src-tauri").join("bin"),
    PathBuf::from("..").join("src-tauri").join("bin"),
  ] {
    push_if_file(&mut out, root.join(LLAMA_SERVER_BIN));
  }
  out
}

fn configured_server_path(payload: &Value) -> String {
  let runtime = local_runtime_config(payload);
  let from_payload = text(payload, &["llamaServerPath", "serverPath", "llamaBinary"]);
  if !from_payload.trim().is_empty() {
    return from_payload;
  }
  text(
    runtime,
    &["llamaServerPath", "serverPath", "llamaBinary", "path"],
  )
}

fn is_path_mode(payload: &Value) -> bool {
  matches!(
    runtime_mode(payload).as_str(),
    "path" | "custom" | "external" | "existing"
  )
}

fn server_binary_candidates(app: &AppHandle, payload: &Value) -> Vec<String> {
  let mut out = Vec::new();
  let configured_path = configured_server_path(payload);
  if !configured_path.trim().is_empty() {
    out.push(configured_path);
  }

  if is_path_mode(payload) {
    out.sort();
    out.dedup();
    return out;
  }

  out.extend(app_managed_binary_candidates(app));

  for key in ["ELEPHANTNOTE_LLAMA_SERVER", "LLAMA_SERVER", "LLAMA_CPP_SERVER"] {
    if let Ok(value) = env::var(key) {
      if !value.trim().is_empty() {
        out.push(value);
      }
    }
  }

  out.extend([
    LLAMA_SERVER_BIN.to_string(),
    "llama.cpp-server".to_string(),
    "llama-cpp-server".to_string(),
    "/opt/homebrew/bin/llama-server".to_string(),
    "/usr/local/bin/llama-server".to_string(),
  ]);

  out.sort();
  out.dedup();
  out
}

fn llama_server_args(model_path: &str, port: u16, context: &str, model_name: &str) -> Vec<String> {
  vec![
    "-m".to_string(),
    model_path.to_string(),
    "--host".to_string(),
    "127.0.0.1".to_string(),
    "--port".to_string(),
    port.to_string(),
    "-c".to_string(),
    context.to_string(),
    "--alias".to_string(),
    model_name.to_string(),
  ]
}

fn models_response_has_model(data: &Value, model_name: &str) -> bool {
  let model_name = model_name.trim().to_lowercase();
  if model_name.is_empty() {
    return false;
  }
  if let Some(models) = data.get("data").and_then(Value::as_array) {
    return models.iter().any(|model| {
      ["id", "name", "model"].iter().any(|key| {
        model
          .get(*key)
          .and_then(Value::as_str)
          .map(|value| value.to_lowercase().contains(&model_name))
          .unwrap_or(false)
      })
    });
  }
  data.to_string().to_lowercase().contains(&model_name)
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

async fn server_has_model(base_url: &str, model_name: &str) -> bool {
  let Ok(client) = Client::builder().timeout(Duration::from_secs(2)).build() else {
    return false;
  };
  let Ok(response) = client.get(format!("{}/models", base_url)).send().await else {
    return false;
  };
  let Ok(data) = response.json::<Value>().await else {
    return false;
  };
  models_response_has_model(&data, model_name)
}

async fn wait_until_ready(base_url: &str) -> bool {
  for _ in 0..80 {
    if server_ready(base_url).await {
      return true;
    }
    let _ = tauri::async_runtime::spawn_blocking(|| {
      std::thread::sleep(Duration::from_millis(250));
    })
    .await;
  }
  false
}

async fn start_server_if_needed(
  app: &AppHandle,
  model_path: &Path,
  model_name: &str,
  base_url: &str,
  payload: &Value,
) -> R<()> {
  if server_ready(base_url).await {
    if server_has_model(base_url, model_name).await {
      return Ok(());
    }
    return Err(format!(
      "Local llama.cpp endpoint at {base_url} is already running, but it does not report the selected model `{model_name}`. Stop the existing llama-server process or configure another local runtime base URL."
    ));
  }
  let port = local_port_from_base_url(base_url).unwrap_or(DEFAULT_PORT);
  let model_path_string = model_path.to_string_lossy().to_string();
  let context = context_size_from_payload(payload);
  let candidates = server_binary_candidates(app, payload);
  if candidates.is_empty() && is_path_mode(payload) {
    return Err(
      "Local llama runtime is set to `path`, but no llama-server path is configured.".to_string(),
    );
  }
  let mut errors = Vec::new();

  eprintln!(
    "[tauri-rag] starting llama server for model={} base={} mode={}",
    model_path_string,
    base_url,
    runtime_mode(payload)
  );
  let args = llama_server_args(&model_path_string, port, &context, model_name);
  for binary in candidates {
    eprintln!("[tauri-rag] trying llama server binary: {}", binary);
    match Command::new(&binary)
      .args(&args)
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .spawn()
    {
      Ok(mut child) => {
        if wait_until_ready(base_url).await && server_has_model(base_url, model_name).await {
          return Ok(());
        }
        let _ = child.kill();
        let _ = child.wait();
        errors.push(format!(
          "{}: endpoint did not become ready with selected model `{model_name}`",
          binary
        ));
      }
      Err(error) => errors.push(format!("{}: {}", binary, error)),
    }
  }
  Err(format!(
    "Unable to start local llama server. Attempts: {}",
    errors.join(" | ")
  ))
}

pub async fn chat_with_selected_model(
  app: &AppHandle,
  selection: &str,
  messages: &[Value],
  payload: &Value,
) -> R<Option<LocalChatResult>> {
  let Some(model_path) = resolve_model_path(selection)? else {
    return Ok(None);
  };
  let base_url = base_url_from_env_or_payload(payload);
  let model_name = model_path
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or("local.gguf")
    .to_string();
  start_server_if_needed(app, &model_path, &model_name, &base_url, payload).await?;

  let temperature = payload
    .get("temperature")
    .and_then(Value::as_f64)
    .unwrap_or(0.2);
  let max_tokens = payload
    .get("maxTokens")
    .or_else(|| payload.get("max_tokens"))
    .and_then(Value::as_u64)
    .unwrap_or(900);
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
    return Err(error_text(
      &data,
      format!("Local llama.cpp server returned HTTP {status}."),
    ));
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
    provider: if is_path_mode(payload) {
      "local-llama.cpp-path".to_string()
    } else {
      "local-llama.cpp-bundled".to_string()
    },
    model: model_name,
    base_url,
  }))
}

fn error_text(data: &Value, fallback: String) -> String {
  data
    .pointer("/error/message")
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

  #[test]
  fn default_runtime_mode_is_bundled() {
    assert_eq!(runtime_mode(&json!({})), "bundled");
  }

  #[test]
  fn nested_runtime_mode_is_read_from_ai_config() {
    assert!(is_path_mode(&json!({
      "aiConfig": { "localRuntime": { "llamaServerMode": "path" } }
    })));
  }

  #[test]
  fn configured_server_path_prefers_payload_over_ai_config() {
    let payload = json!({
      "llamaServerPath": "/tmp/payload-llama-server",
      "aiConfig": { "localRuntime": { "llamaServerPath": "/tmp/config-llama-server" } }
    });
    assert_eq!(configured_server_path(&payload), "/tmp/payload-llama-server");
  }

  #[test]
  fn configured_server_path_reads_ai_config() {
    let payload = json!({
      "aiConfig": { "localRuntime": { "llamaServerPath": "/tmp/config-llama-server" } }
    });
    assert_eq!(configured_server_path(&payload), "/tmp/config-llama-server");
  }

  #[test]
  fn runtime_base_url_prefers_payload_over_ai_config() {
    let payload = json!({
      "llamaBaseUrl": "http://127.0.0.1:50000/v1/",
      "aiConfig": { "localRuntime": { "llamaBaseUrl": "http://127.0.0.1:49999/v1/" } }
    });
    assert_eq!(
      base_url_from_env_or_payload(&payload),
      "http://127.0.0.1:50000/v1"
    );
  }

  #[test]
  fn runtime_base_url_reads_ai_config() {
    let value = json!({
      "aiConfig": { "localRuntime": { "llamaBaseUrl": "http://127.0.0.1:49999/v1/" } }
    });
    assert_eq!(
      base_url_from_env_or_payload(&value),
      "http://127.0.0.1:49999/v1"
    );
  }

  #[test]
  fn context_size_rejects_too_small_values() {
    assert_eq!(context_size_from_payload(&json!({ "ctxSize": 128 })), "4096");
    assert_eq!(context_size_from_payload(&json!({ "ctxSize": 2048 })), "2048");
  }

  #[test]
  fn llama_server_args_set_model_alias() {
    let args = llama_server_args("/models/smol.gguf", 39281, "4096", "smol.gguf");
    assert!(args.windows(2).any(|window| window == ["--alias", "smol.gguf"]));
    assert!(args.windows(2).any(|window| window == ["-m", "/models/smol.gguf"]));
  }

  #[test]
  fn models_response_detects_selected_model() {
    let response = json!({ "data": [{ "id": "smol.gguf" }] });
    assert!(models_response_has_model(&response, "smol.gguf"));
    assert!(!models_response_has_model(&response, "other.gguf"));
  }

  #[test]
  fn models_response_supports_name_and_model_fields() {
    assert!(models_response_has_model(
      &json!({ "data": [{ "name": "Qwen2.5.gguf" }] }),
      "qwen2.5.gguf"
    ));
    assert!(models_response_has_model(
      &json!({ "data": [{ "model": "/tmp/TinyLlama.gguf" }] }),
      "tinyllama.gguf"
    ));
  }
}

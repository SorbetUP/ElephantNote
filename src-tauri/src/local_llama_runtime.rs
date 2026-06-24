use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

type R<T> = Result<T, String>;
const MODEL_PROVIDER: &str = "node-llama-cpp";
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

pub async fn chat_with_selected_model(selection: &str, messages: &[Value], payload: &Value) -> R<Option<LocalChatResult>> {
  let Some(model_path) = resolve_model_path(selection)? else {
    return Ok(None);
  };
  let base_url = base_url_from_env_or_payload(payload);
  if !server_ready(&base_url).await {
    return Err(format!(
      "Local llama.cpp HTTP endpoint is not reachable at {base_url}. Model resolved to {}.",
      model_path.to_string_lossy()
    ));
  }

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
}

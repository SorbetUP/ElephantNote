use futures_util::StreamExt;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::io::Write;
use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

 type R<T> = Result<T, String>;

const MODEL_PROVIDER: &str = "node-llama-cpp";
const HF_API_BASE_URL: &str = "https://huggingface.co";
const MODEL_INDEX_FILE: &str = "model-index.json";
const ACTIVE_MODEL_FILE: &str = "active-model.json";
const MANIFEST_SUFFIX: &str = ".model.json";
const MAX_MODEL_DOWNLOAD_BYTES: u64 = 64 * 1024 * 1024 * 1024;

#[derive(Clone, Debug)]
struct DownloadState {
  payload: Value,
  cancelled: bool,
}

static DOWNLOADS: OnceLock<Mutex<HashMap<String, DownloadState>>> = OnceLock::new();

fn downloads() -> &'static Mutex<HashMap<String, DownloadState>> {
  DOWNLOADS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
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

fn index_path() -> PathBuf {
  model_dir().join(MODEL_INDEX_FILE)
}

fn active_path() -> PathBuf {
  model_dir().join(ACTIVE_MODEL_FILE)
}

fn manifest_path(model_path: &Path) -> PathBuf {
  let mut path = model_path.as_os_str().to_os_string();
  path.push(MANIFEST_SUFFIX);
  PathBuf::from(path)
}

fn read_json(path: &Path) -> Option<Value> {
  fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok())
}

fn write_json(path: &Path, value: &Value) -> R<()> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let raw = serde_json::to_string_pretty(value).map_err(|error| error.to_string())?;
  fs::write(path, format!("{raw}\n")).map_err(|error| error.to_string())
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

fn text_or(value: &Value, keys: &[&str], fallback: impl Into<String>) -> String {
  let out = text(value, keys);
  if out.is_empty() { fallback.into() } else { out }
}

fn number(value: &Value, keys: &[&str]) -> u64 {
  keys.iter().find_map(|key| value.get(*key).and_then(Value::as_u64)).unwrap_or(0)
}

fn boolean(value: &Value, keys: &[&str]) -> bool {
  keys.iter().find_map(|key| value.get(*key).and_then(Value::as_bool)).unwrap_or(false)
}

fn file_name(value: &str) -> String {
  value
    .replace('\\', "/")
    .rsplit('/')
    .find(|part| !part.trim().is_empty())
    .unwrap_or(value)
    .trim()
    .to_string()
}

fn file_name_from_url(raw: &str) -> String {
  reqwest::Url::parse(raw)
    .ok()
    .and_then(|url| url.path_segments().and_then(|segments| segments.rev().find(|segment| !segment.trim().is_empty()).map(str::to_string)))
    .filter(|name| !name.trim().is_empty())
    .unwrap_or_else(|| file_name(raw))
}

fn safe_file_name(value: &str) -> String {
  let safe = file_name(value)
    .chars()
    .map(|ch| match ch {
      '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
      _ if ch.is_control() => '-',
      _ => ch,
    })
    .collect::<String>()
    .trim()
    .trim_matches('.')
    .to_string();
  if safe.is_empty() { "model.gguf".to_string() } else { safe }
}

fn ensure_gguf_file_name(file_name: &str) -> R<()> {
  if file_name.to_ascii_lowercase().ends_with(".gguf") {
    Ok(())
  } else {
    Err(format!("Only .gguf model downloads are allowed, got `{file_name}`."))
  }
}

fn is_blocked_host(host: &str) -> bool {
  let host = host.trim_matches('.').to_ascii_lowercase();
  matches!(host.as_str(), "localhost" | "localhost.localdomain" | "ip6-localhost" | "ip6-loopback")
}

fn is_blocked_ip(ip: IpAddr) -> bool {
  match ip {
    IpAddr::V4(ip) => {
      let octets = ip.octets();
      ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_unspecified()
        || octets[0] == 0
        || octets[0] >= 224
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
    }
    IpAddr::V6(ip) => {
      let first_segment = ip.segments()[0];
      ip.is_loopback()
        || ip.is_unspecified()
        || (first_segment & 0xfe00) == 0xfc00
        || (first_segment & 0xffc0) == 0xfe80
    }
  }
}

fn is_allowed_model_download_host(host: &str) -> bool {
  let host = host.trim_matches('.').to_ascii_lowercase();
  host == "huggingface.co"
    || host == "cdn-lfs.huggingface.co"
    || host == "hf.co"
    || host.ends_with(".hf.co")
    || host.ends_with(".xethub.hf.co")
}

fn validate_download_url(raw: &str) -> R<reqwest::Url> {
  let url = reqwest::Url::parse(raw).map_err(|error| format!("Invalid model download URL: {error}"))?;
  if url.scheme() != "https" {
    return Err("Model downloads must use HTTPS Hugging Face URLs.".to_string());
  }
  let host = url.host_str().ok_or_else(|| "Model download URL must include a host.".to_string())?;
  if is_blocked_host(host) {
    return Err(format!("Refusing to download a model from local host `{host}`."));
  }
  if let Ok(ip) = host.parse::<IpAddr>() {
    if is_blocked_ip(ip) {
      return Err(format!("Refusing to download a model from private or local address `{host}`."));
    }
  }
  if !is_allowed_model_download_host(host) {
    return Err(format!("Refusing model download from non-Hugging Face host `{host}`."));
  }
  Ok(url)
}

fn active_record() -> Option<Value> {
  read_json(&active_path())
}

fn active_model_path_value() -> String {
  active_record()
    .and_then(|value| value.get("modelPath").or_else(|| value.get("path")).and_then(Value::as_str).map(str::to_string))
    .unwrap_or_default()
}

fn read_manifest(model_path: &Path) -> Value {
  read_json(&manifest_path(model_path)).unwrap_or_else(|| json!({}))
}

fn write_manifest(model_path: &Path, manifest: &Value) -> R<Value> {
  let mut next = manifest.clone();
  if let Some(object) = next.as_object_mut() {
    object.insert("modelPath".into(), json!(model_path.to_string_lossy().to_string()));
    object.insert("updatedAt".into(), json!(now()));
  }
  write_json(&manifest_path(model_path), &next)?;
  Ok(next)
}

fn model_record(path: &Path) -> Value {
  let manifest = read_manifest(path);
  let fallback_name = path.file_name().and_then(|name| name.to_str()).unwrap_or("model.gguf").to_string();
  let model_path = path.to_string_lossy().to_string();
  let size_bytes = fs::metadata(path).map(|metadata| metadata.len()).unwrap_or(0);
  let source = text_or(&manifest, &["source"], "local");
  json!({
    "id": text_or(&manifest, &["id", "fileName", "filename", "name"], fallback_name.clone()),
    "name": text_or(&manifest, &["name"], fallback_name.clone()),
    "model": fallback_name.clone(),
    "provider": MODEL_PROVIDER,
    "path": model_path.clone(),
    "modelPath": model_path.clone(),
    "source": source,
    "repoId": text(&manifest, &["repoId", "originalRepoId"]),
    "originalRepoId": text(&manifest, &["originalRepoId"]),
    "filename": text_or(&manifest, &["filename", "fileName"], fallback_name.clone()),
    "fileName": text_or(&manifest, &["fileName", "filename"], fallback_name.clone()),
    "sizeBytes": size_bytes,
    "modifiedAt": now(),
    "installedAt": text(&manifest, &["installedAt"]),
    "downloadedAt": text(&manifest, &["downloadedAt", "installedAt"]),
    "active": active_model_path_value() == model_path,
    "local": true,
    "manifest": manifest
  })
}

fn local_models() -> R<Vec<Value>> {
  let dir = model_dir();
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  let mut out = Vec::new();
  for entry in fs::read_dir(&dir).map_err(|error| error.to_string())? {
    let entry = entry.map_err(|error| error.to_string())?;
    let path = entry.path();
    if path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.eq_ignore_ascii_case("gguf")).unwrap_or(false) {
      out.push(model_record(&path));
    }
  }
  out.sort_by_key(|item| item.get("name").and_then(Value::as_str).unwrap_or("").to_ascii_lowercase());
  Ok(out)
}

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
    if path.is_file() && file_name(&path.to_string_lossy()).to_lowercase().ends_with(".gguf") {
      out.push(model_record(&path));
    }
  }
  out.sort_by(|a, b| text(a, &["name"]).cmp(&text(b, &["name"])));
  Ok(out)
}

fn write_index(models: Vec<Value>) -> R<Value> {
  let index = json!({
    "version": 1,
    "updatedAt": now(),
    "models": models,
    "hfSearchCache": {},
    "runtime": {
      "provider": MODEL_PROVIDER,
      "available": true,
      "modelDir": model_dir().to_string_lossy().to_string(),
      "message": "Tauri Rust model library ready. Inference is delegated to the selected local runtime."
    }
  });
  write_json(&index_path(), &index)?;
  Ok(index)
}

fn refresh_index() -> R<Value> {
  write_index(local_models()?)
}

fn listing() -> R<Value> {
  let index = refresh_index()?;
  let models = index.get("models").cloned().unwrap_or_else(|| json!([]));
  let count = models.as_array().map(|items| items.len()).unwrap_or(0);
  Ok(json!({
    "provider": MODEL_PROVIDER,
    "available": true,
    "modelDir": model_dir().to_string_lossy().to_string(),
    "gpuTypes": [],
    "supportedBackends": ["cpu"],
    "selectedBackend": "cpu",
    "preferredBackends": ["cpu"],
    "version": "tauri-rust",
    "models": models,
    "indexUpdatedAt": index.get("updatedAt").cloned().unwrap_or_else(|| json!("")),
    "runtime": index.get("runtime").cloned().unwrap_or_else(|| json!(null)),
    "message": format!("{count} local GGUF model{} discovered.", if count == 1 { "" } else { "s" })
  }))
}

fn map_hf(data: &Value) -> Value {
  let id = text(data, &["id", "modelId"]);
  let siblings = data
    .get("siblings")
    .and_then(Value::as_array)
    .map(|items| {
      items
        .iter()
        .map(|item| json!({
          "rfilename": text(item, &["rfilename", "path", "name"]),
          "size": number(item, &["size", "sizeBytes"]),
          "blobId": text(item, &["blobId"]),
          "lfs": item.get("lfs").cloned().unwrap_or_else(|| json!(null))
        }))
        .collect::<Vec<_>>()
    })
    .unwrap_or_default();
  json!({
    "id": id.clone(),
    "name": id.clone(),
    "provider": "huggingface",
    "repoId": id.clone(),
    "modelId": id.clone(),
    "pipelineTag": text(data, &["pipeline_tag", "pipelineTag"]),
    "libraryName": text(data, &["library_name", "libraryName"]),
    "tags": data.get("tags").cloned().unwrap_or_else(|| json!([])),
    "likes": number(data, &["likes"]),
    "downloads": number(data, &["downloads"]),
    "sha": text(data, &["sha"]),
    "private": boolean(data, &["private"]),
    "gated": data.get("gated").cloned().unwrap_or_else(|| json!(false)),
    "disabled": boolean(data, &["disabled"]),
    "author": text(data, &["author"]),
    "createdAt": text(data, &["createdAt", "created_at"]),
    "updatedAt": text(data, &["lastModified", "last_modified", "updatedAt"]),
    "cardData": data.get("cardData").or_else(|| data.get("card_data")).cloned().unwrap_or_else(|| json!(null)),
    "siblings": siblings
  })
}

async fn hf_info(repo_id: &str) -> R<Value> {
  if repo_id.trim().is_empty() {
    return Err("Hugging Face repo id is required.".to_string());
  }
  let response = reqwest::Client::new()
    .get(format!("{HF_API_BASE_URL}/api/models/{}?blobs=true", repo_id.trim()))
    .header("accept", "application/json")
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
  if !status.is_success() {
    return Err(text_or(&data, &["error"], format!("Hugging Face info returned HTTP {status}.")));
  }
  Ok(map_hf(&data))
}

fn resolve_download(payload: &Value) -> R<(String, String, String)> {
  let uri = text(payload, &["uri", "modelUri", "pull", "model"]);
  let repo_hint = text(payload, &["repoId", "originalRepoId"]);
  let file_hint = text(payload, &["fileName", "filename"]);
  if let Some(raw) = uri.strip_prefix("hf:") {
    let parts = raw.split('/').filter(|part| !part.is_empty()).collect::<Vec<_>>();
    if parts.len() < 3 {
      return Err("Hugging Face URI must look like hf:owner/repo/file.gguf.".to_string());
    }
    let repo_id = format!("{}/{}", parts[0], parts[1]);
    let file = parts[2..].join("/");
    ensure_gguf_file_name(&file)?;
    let url = format!("{HF_API_BASE_URL}/{repo_id}/resolve/main/{file}?download=true");
    validate_download_url(&url)?;
    return Ok((url, repo_id, file));
  }
  if uri.starts_with("http://") || uri.starts_with("https://") {
    let url = validate_download_url(&uri)?;
    let remote_file = text_or(payload, &["fileName", "filename"], file_name_from_url(url.as_str()));
    ensure_gguf_file_name(&remote_file)?;
    return Ok((url.to_string(), repo_hint, remote_file));
  }
  if repo_hint.contains('/') && !file_hint.is_empty() {
    ensure_gguf_file_name(&file_hint)?;
    let url = format!("{HF_API_BASE_URL}/{repo_hint}/resolve/main/{file_hint}?download=true");
    validate_download_url(&url)?;
    return Ok((url, repo_hint, file_hint));
  }
  Err("Only hf: and HTTPS Hugging Face .gguf model downloads are supported by the Tauri model backend.".to_string())
}

fn set_progress(download_id: &str, payload: Value) {
  let mut guard = downloads().lock().expect("download state mutex poisoned");
  let cancelled = guard.get(download_id).map(|state| state.cancelled).unwrap_or(false);
  guard.insert(download_id.to_string(), DownloadState { payload, cancelled });
}

fn emit_progress(app: &AppHandle, download_id: &str, payload: Value) {
  set_progress(download_id, payload.clone());
  let _ = app.emit("elephantnote:models:download:progress", payload);
}

fn download_id(payload: &Value) -> String {
  text_or(payload, &["downloadId", "id", "modelId"], format!("download-{}", now()))
}

fn cancelled(download_id: &str) -> bool {
  downloads()
    .lock()
    .ok()
    .and_then(|guard| guard.get(download_id).map(|state| state.cancelled))
    .unwrap_or(false)
}

async fn download_file(app: AppHandle, payload: Value) -> R<Value> {
  let download_id = download_id(&payload);
  let id = text_or(&payload, &["id", "modelId", "repoId", "uri", "pull"], download_id.clone());
  let name = text_or(&payload, &["name", "fileName", "filename", "id"], id.clone());
  let (url, repo_id, remote_file) = resolve_download(&payload)?;
  let file_name = safe_file_name(&remote_file);
  ensure_gguf_file_name(&file_name)?;
  let dir = model_dir();
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  let destination = dir.join(&file_name);
  let tmp = dir.join(format!(".{file_name}.{download_id}.tmp"));
  let max_bytes = MAX_MODEL_DOWNLOAD_BYTES;

  emit_progress(&app, &download_id, json!({
    "downloadId": download_id.clone(), "id": id.clone(), "modelId": id.clone(),
    "phase": "downloading", "percent": 5, "message": format!("Downloading {name}…"),
    "fileName": file_name.clone(), "repoId": repo_id.clone(), "maxSizeBytes": max_bytes
  }));

  let response = reqwest::Client::new()
    .get(&url)
    .header("accept", "application/octet-stream")
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  if !status.is_success() {
    return Err(format!("Model download returned HTTP {status}."));
  }
  let total = response.content_length().or_else(|| {
    let value = number(&payload, &["sizeBytes", "size"]);
    if value > 0 { Some(value) } else { None }
  }).unwrap_or(0);
  if total > max_bytes {
    return Err(format!("Model download is too large: {total} bytes exceeds the {max_bytes} byte limit."));
  }
  let mut downloaded = 0_u64;
  let mut file = fs::File::create(&tmp).map_err(|error| error.to_string())?;
  let mut stream = response.bytes_stream();
  while let Some(chunk) = stream.next().await {
    if cancelled(&download_id) {
      let _ = fs::remove_file(&tmp);
      return Err("Download cancelled.".to_string());
    }
    let chunk = chunk.map_err(|error| error.to_string())?;
    let next_downloaded = downloaded.saturating_add(chunk.len() as u64);
    if next_downloaded > max_bytes {
      let _ = fs::remove_file(&tmp);
      return Err(format!("Model download exceeded the {max_bytes} byte limit."));
    }
    file.write_all(&chunk).map_err(|error| error.to_string())?;
    downloaded = next_downloaded;
    let percent = if total > 0 { (downloaded.saturating_mul(94) / total).min(94) + 5 } else { 50 };
    emit_progress(&app, &download_id, json!({
      "downloadId": download_id.clone(), "id": id.clone(), "modelId": id.clone(),
      "phase": "downloading", "percent": percent, "downloadedSize": downloaded, "totalSize": total,
      "message": format!("Downloading {name}…"), "fileName": file_name.clone(), "repoId": repo_id.clone(), "maxSizeBytes": max_bytes
    }));
  }
  file.flush().map_err(|error| error.to_string())?;
  drop(file);
  fs::rename(&tmp, &destination).map_err(|error| error.to_string())?;

  let manifest = write_manifest(&destination, &json!({
    "id": id.clone(), "name": name.clone(), "source": "huggingface",
    "provider": MODEL_PROVIDER, "repoId": repo_id.clone(), "sourceUrl": url.clone(),
    "originalRepoId": text_or(&payload, &["originalRepoId"], text(&payload, &["repoId"])),
    "filename": file_name.clone(), "fileName": file_name.clone(),
    "modelPath": destination.to_string_lossy().to_string(), "installedAt": now(), "downloadedAt": now(),
    "downloadId": download_id.clone(), "downloadedSize": downloaded, "declaredSize": total,
    "maxSizeBytes": max_bytes
  }))?;
  refresh_index()?;
  let result = json!({
    "id": id.clone(), "provider": MODEL_PROVIDER, "downloaded": true,
    "modelPath": destination.to_string_lossy().to_string(), "modelDir": dir.to_string_lossy().to_string(),
    "manifest": manifest, "source": "huggingface", "repoId": repo_id.clone(), "downloadId": download_id.clone(),
    "message": format!("{name} downloaded for Tauri.")
  });
  emit_progress(&app, &download_id, json!({
    "downloadId": download_id.clone(), "id": id.clone(), "modelId": id.clone(),
    "phase": "complete", "percent": 100, "downloadedSize": downloaded, "totalSize": total,
    "message": result.get("message").and_then(Value::as_str).unwrap_or("Download complete."),
    "fileName": file_name.clone(), "repoId": repo_id.clone()
  }));
  Ok(result)
}

fn find_local(model_ref: &Value) -> R<Value> {
  let lookup = [
    text(model_ref, &["modelRef"]),
    text(model_ref, &["path", "modelPath"]),
    text(model_ref, &["id"]),
    text(model_ref, &["name"]),
    text(model_ref, &["fileName", "filename"]),
    text(model_ref, &["repoId", "originalRepoId"]),
  ]
  .into_iter()
  .filter(|value| !value.is_empty())
  .collect::<Vec<_>>();
  if lookup.is_empty() {
    return Err("Model reference is required.".to_string());
  }
  for value in &lookup {
    let path = PathBuf::from(value);
    if path.is_absolute() && path.exists() {
      return Ok(model_record(&path));
    }
  }
  for model in local_models()? {
    let mut values = vec![
      text(&model, &["id"]), text(&model, &["name"]), text(&model, &["fileName", "filename"]),
      text(&model, &["repoId", "originalRepoId"]), text(&model, &["path", "modelPath"]),
    ];
    let aliases = values.iter().map(|value| file_name(value)).collect::<Vec<_>>();
    values.extend(aliases);
    if lookup.iter().any(|item| values.iter().any(|value| value == item)) {
      return Ok(model);
    }
  }
  Err(format!("Model not found locally: {}.", lookup.first().cloned().unwrap_or_else(|| "unknown".to_string())))
}

#[tauri::command]
pub fn tauri_models_list() -> R<Value> {
  listing()
}

#[tauri::command]
pub fn tauri_models_list_local() -> R<Value> {
  listing()
}

#[tauri::command]
pub async fn tauri_models_search_hugging_face(payload: Value) -> R<Value> {
  let query = text(&payload, &["query"]);
  let limit = number(&payload, &["limit"]);
  let sort = text_or(&payload, &["sort"], "downloads");
  let direction = text_or(&payload, &["direction"], "-1");
  let pipeline_tag = text(&payload, &["pipelineTag", "pipeline_tag"]);
  let library_name = text(&payload, &["libraryName", "library"]);
  let author = text(&payload, &["author"]);
  let mut url = reqwest::Url::parse(&format!("{HF_API_BASE_URL}/api/models")).map_err(|error| error.to_string())?;
  {
    let mut pairs = url.query_pairs_mut();
    if !query.is_empty() { pairs.append_pair("search", &query); }
    if limit > 0 { pairs.append_pair("limit", &limit.to_string()); }
    if !sort.is_empty() { pairs.append_pair("sort", &sort); }
    if !direction.is_empty() { pairs.append_pair("direction", &direction); }
    if !pipeline_tag.is_empty() { pairs.append_pair("pipeline_tag", &pipeline_tag); }
    if !library_name.is_empty() { pairs.append_pair("library", &library_name); }
    if !author.is_empty() { pairs.append_pair("author", &author); }
  }
  let response = reqwest::Client::new().get(url).header("accept", "application/json").send().await.map_err(|error| error.to_string())?;
  let status = response.status();
  let data = response.json::<Value>().await.unwrap_or_else(|_| json!([]));
  if !status.is_success() {
    return Err(text_or(&data, &["error"], format!("Hugging Face search returned HTTP {status}.")));
  }
  let models = data.as_array().map(|items| items.iter().map(map_hf).collect::<Vec<_>>()).unwrap_or_default();
  let total = models.len();
  Ok(json!({
    "provider": "huggingface", "source": "huggingface", "query": query, "limit": limit,
    "total": total, "models": models, "cached": false,
    "message": format!("Found {total} models.")
  }))
}

#[tauri::command]
pub async fn tauri_models_info(payload: Value) -> R<Value> {
  let model_ref = payload.get("modelRef").cloned().unwrap_or_else(|| payload.clone());
  let ref_text = text(&model_ref, &["modelRef", "repoId", "id", "path", "modelPath"]);
  if model_ref.get("provider").and_then(Value::as_str) == Some("huggingface") || text(&model_ref, &["repoId"]).contains('/') {
    return hf_info(&text(&model_ref, &["repoId", "id"])).await;
  }
  if ref_text.contains('/') && !PathBuf::from(&ref_text).is_absolute() && !ref_text.to_lowercase().ends_with(".gguf") {
    return hf_info(&ref_text).await;
  }
  find_local(&model_ref)
}

#[tauri::command]
pub async fn tauri_models_download(app: AppHandle, payload: Value) -> R<Value> {
  download_file(app, payload).await
}

#[tauri::command]
pub fn tauri_models_cancel_download(payload: Value) -> R<Value> {
  let id = download_id(&payload);
  let mut guard = downloads().lock().expect("download state mutex poisoned");
  let mut status = guard.get(&id).map(|state| state.payload.clone()).unwrap_or_else(|| json!({}));
  if let Some(object) = status.as_object_mut() {
    object.insert("downloadId".into(), json!(id.clone()));
    object.insert("cancelled".into(), json!(true));
    object.insert("phase".into(), json!("cancelled"));
    object.insert("message".into(), json!("Download cancelled."));
  }
  guard.insert(id, DownloadState { payload: status.clone(), cancelled: true });
  Ok(status)
}

#[tauri::command]
pub fn tauri_models_download_status(payload: Value) -> R<Value> {
  let id = download_id(&payload);
  Ok(downloads().lock().ok().and_then(|guard| guard.get(&id).map(|state| state.payload.clone())).unwrap_or_else(|| json!({
    "downloadId": id, "phase": "idle", "percent": 0, "message": "No active download."
  })))
}

#[tauri::command]
pub fn tauri_models_activate(payload: Value) -> R<Value> {
  let model = payload.get("model").cloned().unwrap_or_else(|| payload.clone());
  let mut record = find_local(&model)?;
  if let Some(object) = record.as_object_mut() {
    object.insert("active".into(), json!(true));
    object.insert("activatedAt".into(), json!(now()));
    object.insert("message".into(), json!("Model activated in the Tauri model registry."));
  }
  write_json(&active_path(), &record)?;
  refresh_index()?;
  Ok(record)
}

#[tauri::command]
pub fn tauri_models_deactivate(payload: Value) -> R<Value> {
  let model_ref = payload.get("modelRef").cloned().unwrap_or_else(|| payload.clone());
  let model_path = find_local(&model_ref).ok().map(|model| text(&model, &["path", "modelPath"])).unwrap_or_else(|| text(&model_ref, &["modelRef", "path", "modelPath"]));
  if active_model_path_value() == model_path || model_path.is_empty() {
    let _ = fs::remove_file(active_path());
  }
  refresh_index()?;
  Ok(json!({ "unloaded": true, "modelPath": model_path, "message": "Model deactivated in the Tauri model registry." }))
}

#[tauri::command]
pub fn tauri_models_delete(payload: Value) -> R<Value> {
  let model_ref = payload.get("modelRef").cloned().unwrap_or_else(|| payload.get("model").cloned().unwrap_or_else(|| payload.clone()));
  let model = find_local(&model_ref)?;
  let model_path = text(&model, &["path", "modelPath"]);
  if model_path.is_empty() {
    return Err("Model path is required to delete a model.".to_string());
  }
  let path = PathBuf::from(&model_path);
  let _ = fs::remove_file(manifest_path(&path));
  let _ = fs::remove_file(&path);
  if active_model_path_value() == model_path {
    let _ = fs::remove_file(active_path());
  }
  refresh_index()?;
  Ok(json!({ "deleted": true, "modelPath": model_path, "id": text(&model, &["id", "name"]), "message": "Model deleted." }))
}

#[tauri::command]
pub fn tauri_models_active() -> R<Value> {
  Ok(active_record().unwrap_or_else(|| json!(null)))
}

#[tauri::command]
pub fn tauri_models_refresh_index() -> R<Value> {
  refresh_index()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn sanitizes_model_file_names() {
    assert_eq!(safe_file_name("folder/model.gguf"), "model.gguf");
    assert_eq!(safe_file_name("bad:name?.gguf"), "bad-name-.gguf");
  }

  #[test]
  fn parses_hugging_face_uri() {
    let value = json!({ "uri": "hf:owner/repo/model.Q4_K_M.gguf" });
    let (_url, repo, file) = resolve_download(&value).unwrap();
    assert_eq!(repo, "owner/repo");
    assert_eq!(file, "model.Q4_K_M.gguf");
  }

  #[test]
  fn rejects_http_downloads() {
    let value = json!({ "uri": "http://huggingface.co/owner/repo/resolve/main/model.gguf" });
    assert!(resolve_download(&value).is_err());
  }

  #[test]
  fn rejects_localhost_downloads() {
    let value = json!({ "uri": "https://localhost/owner/repo/resolve/main/model.gguf" });
    assert!(resolve_download(&value).is_err());
  }

  #[test]
  fn rejects_non_hugging_face_downloads() {
    let value = json!({ "uri": "https://example.com/model.gguf" });
    assert!(resolve_download(&value).is_err());
  }

  #[test]
  fn rejects_non_gguf_model_names() {
    let value = json!({ "uri": "hf:owner/repo/model.bin" });
    assert!(resolve_download(&value).is_err());
  }
}

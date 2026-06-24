use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

const MODEL_PROVIDER: &str = "node-llama-cpp";
const ACTIVE_MODEL_FILE: &str = "active-model.json";
const MODEL_INDEX_FILE: &str = "model-index.json";
const MANIFEST_SUFFIX: &str = ".model.json";

type R<T> = Result<T, String>;

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

fn file_name(value: &str) -> String {
  value
    .replace('\\', "/")
    .rsplit('/')
    .find(|part| !part.trim().is_empty())
    .unwrap_or(value)
    .trim()
    .to_string()
}

fn read_json(path: &Path) -> Option<Value> {
  fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok())
}

fn manifest_path(model_path: &Path) -> PathBuf {
  let mut path = model_path.as_os_str().to_os_string();
  path.push(MANIFEST_SUFFIX);
  PathBuf::from(path)
}

fn model_matches(path: &Path, lookup: &[String]) -> bool {
  let filename = path.file_name().and_then(|name| name.to_str()).unwrap_or("").to_string();
  let full = path.to_string_lossy().to_string();
  if lookup.iter().any(|value| value == &filename || value == &full || file_name(value) == filename) {
    return true;
  }
  let manifest = read_json(&manifest_path(path)).unwrap_or_else(|| json!({}));
  let fields = [
    text(&manifest, &["id"]),
    text(&manifest, &["name"]),
    text(&manifest, &["model"]),
    text(&manifest, &["fileName", "filename"]),
    text(&manifest, &["modelPath", "path"]),
    text(&manifest, &["repoId", "originalRepoId"]),
  ];
  fields.iter().filter(|value| !value.is_empty()).any(|field| {
    lookup.iter().any(|value| field == value || field.ends_with(value) || file_name(field) == file_name(value))
  })
}

fn resolve_safe_model_path(model_ref: &Value) -> R<PathBuf> {
  let dir = model_dir();
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  let canonical_dir = fs::canonicalize(&dir).map_err(|error| error.to_string())?;
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
      let canonical = fs::canonicalize(&path).map_err(|error| error.to_string())?;
      if !canonical.starts_with(&canonical_dir) {
        return Err(format!("Refusing to delete a model outside the ElephantNote model directory: {}", canonical.to_string_lossy()));
      }
      if canonical.extension().and_then(|ext| ext.to_str()).map(|ext| ext.eq_ignore_ascii_case("gguf")) != Some(true) {
        return Err("Only local .gguf model files can be deleted.".to_string());
      }
      return Ok(canonical);
    }
  }

  for entry in fs::read_dir(&canonical_dir).map_err(|error| error.to_string())? {
    let entry = entry.map_err(|error| error.to_string())?;
    let path = entry.path();
    if path.is_file()
      && path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.eq_ignore_ascii_case("gguf")) == Some(true)
      && model_matches(&path, &lookup)
    {
      return Ok(path);
    }
  }
  Err(format!("Model not found locally: {}.", lookup.first().cloned().unwrap_or_else(|| "unknown".to_string())))
}

fn remove_active_if_needed(model_path: &Path) {
  let active_path = model_dir().join(ACTIVE_MODEL_FILE);
  let active_model_path = read_json(&active_path)
    .and_then(|value| value.get("modelPath").or_else(|| value.get("path")).and_then(Value::as_str).map(str::to_string))
    .unwrap_or_default();
  if !active_model_path.is_empty() && PathBuf::from(active_model_path) == model_path {
    let _ = fs::remove_file(active_path);
  }
}

fn refresh_safe_index() {
  let dir = model_dir();
  let models = fs::read_dir(&dir)
    .ok()
    .into_iter()
    .flat_map(|items| items.filter_map(Result::ok))
    .map(|entry| entry.path())
    .filter(|path| path.is_file() && path.extension().and_then(|ext| ext.to_str()).map(|ext| ext.eq_ignore_ascii_case("gguf")) == Some(true))
    .map(|path| json!({
      "id": path.file_name().and_then(|name| name.to_str()).unwrap_or("model.gguf"),
      "name": path.file_name().and_then(|name| name.to_str()).unwrap_or("model.gguf"),
      "fileName": path.file_name().and_then(|name| name.to_str()).unwrap_or("model.gguf"),
      "filename": path.file_name().and_then(|name| name.to_str()).unwrap_or("model.gguf"),
      "path": path.to_string_lossy(),
      "modelPath": path.to_string_lossy(),
      "provider": MODEL_PROVIDER,
      "local": true
    }))
    .collect::<Vec<_>>();
  let _ = fs::write(dir.join(MODEL_INDEX_FILE), serde_json::to_string_pretty(&json!({
    "version": 1,
    "models": models,
    "runtime": { "provider": MODEL_PROVIDER, "available": true, "modelDir": dir.to_string_lossy() }
  })).unwrap_or_else(|_| "{}".to_string()));
}

#[tauri::command]
pub fn tauri_models_delete(payload: Value) -> R<Value> {
  let model_ref = payload
    .get("modelRef")
    .cloned()
    .unwrap_or_else(|| payload.get("model").cloned().unwrap_or_else(|| payload.clone()));
  let path = resolve_safe_model_path(&model_ref)?;
  let model_path = path.to_string_lossy().to_string();
  let id = path.file_name().and_then(|name| name.to_str()).unwrap_or("model.gguf").to_string();
  let _ = fs::remove_file(manifest_path(&path));
  fs::remove_file(&path).map_err(|error| error.to_string())?;
  remove_active_if_needed(&path);
  refresh_safe_index();
  Ok(json!({ "deleted": true, "modelPath": model_path, "id": id, "message": "Model deleted." }))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn extracts_file_name_from_path_like_model_ref() {
    assert_eq!(file_name("/tmp/models/tiny.gguf"), "tiny.gguf");
    assert_eq!(file_name("owner/repo/tiny.gguf"), "tiny.gguf");
  }
}

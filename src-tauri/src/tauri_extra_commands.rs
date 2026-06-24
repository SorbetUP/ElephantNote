use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::vault::config as vault_config;
use crate::vault_layout;

type R<T> = Result<T, String>;
const META_DIR: &str = vault_layout::HIDDEN_ROOT;
const AI_CONFIG_FILE: &str = "tauri-ai-config.json";
const FEATURES_FILE: &str = "tauri-features.json";

fn now() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn normalize_relative_path(path: &str) -> String {
  path.replace('\\', "/")
    .split('/')
    .filter(|part| !part.is_empty() && *part != "." && *part != "..")
    .collect::<Vec<_>>()
    .join("/")
}

fn inside(root: &str, relative_path: &str) -> PathBuf {
  let relative_path = normalize_relative_path(relative_path);
  if relative_path.is_empty() { PathBuf::from(root) } else { PathBuf::from(root).join(relative_path) }
}

fn active_vault_root(app: &AppHandle) -> R<String> {
  vault_config::get_active_vault(app).map(|vault| vault.path)
}

fn read_json(path: PathBuf, fallback: Value) -> Value {
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or(fallback)
}

fn write_json(path: PathBuf, value: &Value) -> R<()> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let raw = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
  fs::write(path, raw).map_err(|e| e.to_string())
}

fn app_json_path(app: &AppHandle, file_name: &str) -> R<PathBuf> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join(file_name))
}

fn canonical_root(root: &Path) -> R<PathBuf> {
  fs::create_dir_all(root).map_err(|e| e.to_string())?;
  fs::canonicalize(root).map_err(|e| e.to_string())
}

fn assert_existing_path_inside_root(root: &Path, target: &Path) -> R<PathBuf> {
  let root = canonical_root(root)?;
  let target = fs::canonicalize(target).map_err(|e| e.to_string())?;
  if !target.starts_with(&root) {
    return Err(format!("Refusing to access a path outside the active vault: {}", target.to_string_lossy()));
  }
  Ok(target)
}

fn writable_path_inside_root(root: &Path, candidate: &Path) -> R<PathBuf> {
  let root = canonical_root(root)?;
  let target = if candidate.is_absolute() { candidate.to_path_buf() } else { root.join(candidate) };
  let parent = target.parent().ok_or_else(|| "Cannot write a path without a parent directory.".to_string())?;
  fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  let parent = fs::canonicalize(parent).map_err(|e| e.to_string())?;
  if !parent.starts_with(&root) {
    return Err(format!("Refusing to write outside the active vault: {}", target.to_string_lossy()));
  }
  let file_name = target.file_name().ok_or_else(|| "Cannot write a path without a file name.".to_string())?;
  Ok(parent.join(file_name))
}

fn writable_relative_path(root: &str, relative_path: &str) -> R<PathBuf> {
  let normalized = normalize_relative_path(relative_path);
  if normalized.is_empty() {
    return Err("A file path is required.".to_string());
  }
  writable_path_inside_root(Path::new(root), Path::new(&normalized))
}

fn file_summary(root: &Path, path: &Path) -> Value {
  let relative = path.strip_prefix(root).unwrap_or(path).to_string_lossy().replace('\\', "/");
  let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("").to_string();
  let updated_at = fs::metadata(path)
    .and_then(|metadata| metadata.modified())
    .ok()
    .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(now);
  json!({ "name": name, "path": relative, "updatedAt": updated_at })
}

fn scan_files(root: &Path, current: &Path, out: &mut Vec<Value>, extension: Option<&str>) -> R<()> {
  for item in fs::read_dir(current).map_err(|e| e.to_string())? {
    let item = item.map_err(|e| e.to_string())?;
    let path = item.path();
    let name = item.file_name().to_string_lossy().to_string();
    if name == META_DIR || name == ".git" || name == "node_modules" || name.starts_with('.') {
      continue;
    }
    let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
    if metadata.file_type().is_symlink() {
      continue;
    }
    if metadata.is_dir() {
      scan_files(root, &path, out, extension)?;
    } else if metadata.is_file() {
      let matches = extension.map(|ext| name.to_lowercase().ends_with(ext)).unwrap_or(true);
      if matches {
        out.push(file_summary(root, &path));
      }
    }
  }
  Ok(())
}

#[tauri::command]
pub fn shell_exec(app: AppHandle, command: String, args: Option<Vec<String>>, cwd: Option<String>, env: Option<HashMap<String, String>>) -> R<Value> {
  let command_name = Path::new(&command)
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or(command.as_str());
  if command_name != "pandoc" {
    return Err(format!("Refusing to execute unsupported command: {command_name}"));
  }

  let mut process = Command::new(command_name);
  process.args(args.unwrap_or_default());
  if let Some(cwd) = cwd.filter(|value| !value.trim().is_empty()) {
    let root = active_vault_root(&app)?;
    let cwd = assert_existing_path_inside_root(Path::new(&root), Path::new(&cwd))?;
    process.current_dir(cwd);
  }
  if let Some(env) = env {
    for (key, value) in env {
      if key.starts_with("PANDOC_") {
        process.env(key, value);
      }
    }
  }

  let output = process.output().map_err(|e| e.to_string())?;
  Ok(json!({
    "success": output.status.success(),
    "code": output.status.code(),
    "stdout": String::from_utf8_lossy(&output.stdout).to_string(),
    "stderr": String::from_utf8_lossy(&output.stderr).to_string()
  }))
}

#[tauri::command]
pub fn tauri_notes_read(app: AppHandle, relative_path: String) -> R<Value> {
  let root = active_vault_root(&app)?;
  let normalized = normalize_relative_path(&relative_path);
  let path = assert_existing_path_inside_root(Path::new(&root), &inside(&root, &normalized))?;
  let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  Ok(json!({ "path": normalized, "fullPath": path.to_string_lossy(), "content": content }))
}

#[tauri::command]
pub fn tauri_notes_write(app: AppHandle, relative_path: String, content: Option<String>, markdown: Option<String>) -> R<Value> {
  let root = active_vault_root(&app)?;
  let path = writable_relative_path(&root, &relative_path)?;
  let content = content.or(markdown).unwrap_or_default();
  fs::write(&path, content).map_err(|e| e.to_string())?;
  Ok(json!({ "ok": true, "path": normalize_relative_path(&relative_path), "fullPath": path.to_string_lossy(), "updatedAt": now() }))
}

#[tauri::command]
pub fn tauri_marktext_write_file(app: AppHandle, pathname: String, content: String) -> R<Value> {
  if pathname.trim().is_empty() {
    return Err("Cannot save MarkText file without a pathname.".to_string());
  }
  let root = active_vault_root(&app)?;
  let path = writable_path_inside_root(Path::new(&root), Path::new(&pathname))?;
  fs::write(&path, content).map_err(|e| e.to_string())?;
  Ok(json!({ "ok": true, "fullPath": path.to_string_lossy(), "updatedAt": now() }))
}

#[tauri::command]
pub fn tauri_attachments_list(app: AppHandle) -> R<Vec<Value>> {
  let root = active_vault_root(&app)?;
  let root_path = PathBuf::from(&root);
  let assets = vault_layout::assets_dir(&root_path);
  if !assets.exists() {
    return Ok(Vec::new());
  }
  let mut out = Vec::new();
  scan_files(&root_path, &assets, &mut out, None)?;
  Ok(out)
}

#[tauri::command]
pub fn tauri_attachments_write_text(app: AppHandle, relative_path: String, content: String) -> R<Value> {
  let root = active_vault_root(&app)?;
  let assets = vault_layout::assets_dir(&root);
  let relative_path = normalize_relative_path(&relative_path);
  let path = writable_path_inside_root(&assets, Path::new(&relative_path))?;
  fs::write(&path, content).map_err(|e| e.to_string())?;
  let public_path = path.strip_prefix(&root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
  Ok(json!({ "ok": true, "path": public_path, "fullPath": path.to_string_lossy() }))
}

#[tauri::command]
pub fn tauri_drawings_list(app: AppHandle) -> R<Vec<Value>> {
  let root = active_vault_root(&app)?;
  let root_path = PathBuf::from(&root);
  let drawings = root_path.join("Drawings");
  if !drawings.exists() {
    return Ok(Vec::new());
  }
  let mut out = Vec::new();
  scan_files(&root_path, &drawings, &mut out, Some(".json"))?;
  Ok(out)
}

#[tauri::command]
pub fn tauri_drawings_create(app: AppHandle, title: Option<String>) -> R<Value> {
  let root = active_vault_root(&app)?;
  let title = title.filter(|value| !value.trim().is_empty()).unwrap_or_else(|| "Untitled Drawing".to_string());
  let safe_title = title.replace('/', "-").replace('\\', "-");
  let relative_path = normalize_relative_path(&format!("Drawings/{}.drawing.json", safe_title));
  let path = writable_relative_path(&root, &relative_path)?;
  let scene = json!({ "kind": "drawing", "version": 1, "title": title, "items": [] });
  write_json(path.clone(), &scene)?;
  Ok(json!({ "path": relative_path, "fullPath": path.to_string_lossy(), "scene": scene }))
}

#[tauri::command]
pub fn tauri_drawings_read(app: AppHandle, relative_path: String) -> R<Value> {
  let root = active_vault_root(&app)?;
  let normalized = normalize_relative_path(&relative_path);
  let path = assert_existing_path_inside_root(Path::new(&root), &inside(&root, &normalized))?;
  Ok(read_json(path, json!({ "kind": "drawing", "items": [] })))
}

#[tauri::command]
pub fn tauri_drawings_write(app: AppHandle, relative_path: String, scene: Value) -> R<Value> {
  let root = active_vault_root(&app)?;
  let path = writable_relative_path(&root, &relative_path)?;
  write_json(path.clone(), &scene)?;
  Ok(json!({ "ok": true, "path": normalize_relative_path(&relative_path), "fullPath": path.to_string_lossy() }))
}

#[tauri::command]
pub fn tauri_models_get_selection(app: AppHandle) -> R<Value> {
  let root = active_vault_root(&app)?;
  Ok(read_json(vault_layout::models_file(&root, vault_layout::MODELS_FILE), json!({ "provider": "none", "modelId": "", "local": false })))
}

#[tauri::command]
pub fn tauri_models_set_selection(app: AppHandle, selection: Value) -> R<Value> {
  let root = active_vault_root(&app)?;
  write_json(vault_layout::models_file(&root, vault_layout::MODELS_FILE), &selection)?;
  Ok(selection)
}

#[tauri::command]
pub fn tauri_search_rebuild(app: AppHandle) -> R<Value> {
  let root = active_vault_root(&app)?;
  let root_path = PathBuf::from(&root);
  let mut entries = Vec::new();
  scan_files(&root_path, &root_path, &mut entries, Some(".md"))?;
  let index = json!({ "version": 1, "updatedAt": now(), "entries": entries });
  write_json(vault_layout::index_file(&root, vault_layout::INDEX_FILE), &index)?;
  Ok(index)
}

#[tauri::command]
pub fn tauri_search_inspect(app: AppHandle) -> R<Value> {
  let root = active_vault_root(&app)?;
  let index_path = vault_layout::index_file(&root, vault_layout::INDEX_FILE);
  let index = read_json(index_path.clone(), json!({ "entries": [] }));
  let entries = index.get("entries").and_then(Value::as_array).map(|items| items.len()).unwrap_or(0);
  Ok(json!({
    "runtime": "tauri-rust",
    "indexPath": index_path.to_string_lossy(),
    "exists": index_path.exists(),
    "entries": entries,
    "updatedAt": index.get("updatedAt").and_then(Value::as_str).unwrap_or("")
  }))
}

#[tauri::command]
pub fn tauri_ai_config_get(app: AppHandle) -> R<Value> {
  Ok(read_json(app_json_path(&app, AI_CONFIG_FILE)?, json!({
    "localAi": { "enabled": true, "showModelLibraryInSidebar": true },
    "localRuntime": { "llamaServerMode": "bundled", "llamaServerPath": "", "llamaBaseUrl": "" },
    "providers": { "list": [], "codex": { "connected": false, "mode": "account", "model": "" } },
    "routes": {},
    "localModelSelection": {}
  })))
}

#[tauri::command]
pub fn tauri_ai_config_set(app: AppHandle, config: Value) -> R<Value> {
  write_json(app_json_path(&app, AI_CONFIG_FILE)?, &config)?;
  Ok(config)
}

#[tauri::command]
pub fn tauri_ai_config_test(_app: AppHandle, config: Value) -> R<Value> {
  Ok(json!({ "ok": true, "runtime": "tauri-rust", "latencyMs": 0, "config": config }))
}

#[tauri::command]
pub fn tauri_features_get(app: AppHandle) -> R<Value> {
  Ok(read_json(app_json_path(&app, FEATURES_FILE)?, json!({ "askAi": true, "sitePreview": false, "gitSync": false })))
}

#[tauri::command]
pub fn tauri_features_set(app: AppHandle, key: String, enabled: bool) -> R<Value> {
  let mut features = tauri_features_get(app.clone())?;
  if let Some(object) = features.as_object_mut() {
    object.insert(key, json!(enabled));
  }
  write_json(app_json_path(&app, FEATURES_FILE)?, &features)?;
  Ok(features)
}

#[tauri::command]
pub fn tauri_sync_plan(app: AppHandle) -> R<Value> {
  let root = active_vault_root(&app)?;
  let root_path = PathBuf::from(&root);
  let mut notes = Vec::new();
  let mut assets = Vec::new();
  scan_files(&root_path, &root_path, &mut notes, Some(".md"))?;
  let assets_dir = vault_layout::assets_dir(&root_path);
  if assets_dir.exists() {
    scan_files(&root_path, &assets_dir, &mut assets, None)?;
  }
  Ok(json!({ "notes": notes, "assets": assets, "generatedAt": now() }))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn normalizes_parent_traversal_without_preserving_dotdot() {
    assert_eq!(normalize_relative_path("a/../b.md"), "a/b.md");
    assert_eq!(normalize_relative_path("../secret.md"), "secret.md");
  }

  #[test]
  fn refuses_writable_path_outside_root() {
    let root = std::env::temp_dir().join(format!("elephantnote-root-{}", now()));
    let outside = std::env::temp_dir().join(format!("elephantnote-outside-{}", now()));
    fs::create_dir_all(&root).unwrap();
    let error = writable_path_inside_root(&root, &outside.join("x.md")).unwrap_err();
    assert!(error.contains("outside"));
    let _ = fs::remove_dir_all(&root);
  }
}

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::vault_layout;

type R<T> = Result<T, String>;
const CONFIG_FILE: &str = "tauri-vaults.json";
const META_DIR: &str = vault_layout::HIDDEN_ROOT;

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

fn config_path(app: &AppHandle) -> R<PathBuf> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  Ok(dir.join(CONFIG_FILE))
}

fn active_vault_root(app: &AppHandle) -> R<String> {
  let raw = fs::read_to_string(config_path(app)?).map_err(|e| e.to_string())?;
  let config: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
  let active_id = config.get("activeVaultId").and_then(Value::as_str).ok_or_else(|| "No active vault id.".to_string())?;
  let vaults = config.get("vaults").and_then(Value::as_array).ok_or_else(|| "Invalid vault config.".to_string())?;
  vaults
    .iter()
    .find(|vault| vault.get("id").and_then(Value::as_str) == Some(active_id))
    .and_then(|vault| vault.get("path").and_then(Value::as_str))
    .map(str::to_string)
    .ok_or_else(|| "No active ElephantNote vault.".to_string())
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
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
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
pub fn tauri_notes_read(app: AppHandle, relative_path: String) -> R<Value> {
  let root = active_vault_root(&app)?;
  let path = inside(&root, &relative_path);
  let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
  Ok(json!({ "path": normalize_relative_path(&relative_path), "fullPath": path.to_string_lossy(), "content": content }))
}

#[tauri::command]
pub fn tauri_notes_write(app: AppHandle, relative_path: String, content: Option<String>, markdown: Option<String>) -> R<Value> {
  let root = active_vault_root(&app)?;
  let path = inside(&root, &relative_path);
  let content = content.or(markdown).unwrap_or_default();
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  fs::write(&path, content).map_err(|e| e.to_string())?;
  Ok(json!({ "ok": true, "path": normalize_relative_path(&relative_path), "fullPath": path.to_string_lossy(), "updatedAt": now() }))
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
  let relative_path = normalize_relative_path(&relative_path);
  let path = vault_layout::assets_dir(&root).join(&relative_path);
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
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
  let path = inside(&root, &relative_path);
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
  }
  let scene = json!({ "kind": "drawing", "version": 1, "title": title, "items": [] });
  write_json(path.clone(), &scene)?;
  Ok(json!({ "path": relative_path, "fullPath": path.to_string_lossy(), "scene": scene }))
}

#[tauri::command]
pub fn tauri_drawings_read(app: AppHandle, relative_path: String) -> R<Value> {
  let root = active_vault_root(&app)?;
  let path = inside(&root, &relative_path);
  Ok(read_json(path, json!({ "kind": "drawing", "items": [] })))
}

#[tauri::command]
pub fn tauri_drawings_write(app: AppHandle, relative_path: String, scene: Value) -> R<Value> {
  let root = active_vault_root(&app)?;
  let path = inside(&root, &relative_path);
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

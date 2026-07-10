use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde_json::{json, Value};
use std::{fs, path::{Path, PathBuf}};
use tauri::AppHandle;

use crate::vault::config as vault_config;

type R<T> = Result<T, String>;

fn active_root(app: &AppHandle) -> R<PathBuf> {
  let root = vault_config::get_active_vault(app)?.path;
  fs::create_dir_all(&root).map_err(|error| error.to_string())?;
  fs::canonicalize(root).map_err(|error| error.to_string())
}

fn writable_path(root: &Path, candidate: &str) -> R<PathBuf> {
  let candidate = PathBuf::from(candidate);
  let target = if candidate.is_absolute() { candidate } else { root.join(candidate) };
  let parent = target.parent().ok_or_else(|| "A parent directory is required.".to_string())?;
  fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  let parent = fs::canonicalize(parent).map_err(|error| error.to_string())?;
  if !parent.starts_with(root) {
    return Err(format!("Refusing to write outside the active vault: {}", target.to_string_lossy()));
  }
  let name = target.file_name().ok_or_else(|| "A file name is required.".to_string())?;
  Ok(parent.join(name))
}

fn existing_path(root: &Path, candidate: &str) -> R<PathBuf> {
  let candidate = PathBuf::from(candidate);
  let target = if candidate.is_absolute() { candidate } else { root.join(candidate) };
  let target = fs::canonicalize(target).map_err(|error| error.to_string())?;
  if !target.starts_with(root) {
    return Err(format!("Refusing to access a path outside the active vault: {}", target.to_string_lossy()));
  }
  Ok(target)
}

#[tauri::command]
pub fn tauri_vault_read_binary(app: AppHandle, pathname: String) -> R<Value> {
  let root = active_root(&app)?;
  let path = existing_path(&root, &pathname)?;
  if !path.is_file() {
    return Err(format!("Cannot read a non-file vault path: {}", path.to_string_lossy()));
  }
  let data = fs::read(&path).map_err(|error| error.to_string())?;
  Ok(json!({ "ok": true, "fullPath": path.to_string_lossy(), "dataBase64": BASE64.encode(data) }))
}

#[tauri::command]
pub fn tauri_vault_write_binary(app: AppHandle, pathname: String, data_base64: String) -> R<Value> {
  let root = active_root(&app)?;
  let path = writable_path(&root, &pathname)?;
  let data = BASE64.decode(data_base64.as_bytes()).map_err(|error| error.to_string())?;
  let changed = match fs::read(&path) {
    Ok(existing) if existing == data => false,
    _ => {
      fs::write(&path, data).map_err(|error| error.to_string())?;
      true
    }
  };
  Ok(json!({ "ok": true, "changed": changed, "fullPath": path.to_string_lossy() }))
}

#[tauri::command]
pub fn tauri_vault_ensure_dir(app: AppHandle, pathname: String) -> R<Value> {
  let root = active_root(&app)?;
  let candidate = PathBuf::from(&pathname);
  let target = if candidate.is_absolute() { candidate } else { root.join(candidate) };
  let parent = target.parent().unwrap_or(&root);
  fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  let parent = fs::canonicalize(parent).map_err(|error| error.to_string())?;
  if !parent.starts_with(&root) {
    return Err(format!("Refusing to create a directory outside the active vault: {}", target.to_string_lossy()));
  }
  fs::create_dir_all(&target).map_err(|error| error.to_string())?;
  Ok(json!({ "ok": true, "fullPath": target.to_string_lossy() }))
}

#[tauri::command]
pub fn tauri_vault_remove_path(app: AppHandle, pathname: String) -> R<Value> {
  let root = active_root(&app)?;
  let path = existing_path(&root, &pathname)?;
  if path.is_dir() {
    fs::remove_dir_all(&path).map_err(|error| error.to_string())?;
  } else {
    fs::remove_file(&path).map_err(|error| error.to_string())?;
  }
  Ok(json!({ "ok": true, "fullPath": path.to_string_lossy() }))
}

#[tauri::command]
pub fn tauri_vault_rename_path(app: AppHandle, source: String, destination: String) -> R<Value> {
  let root = active_root(&app)?;
  let source_path = existing_path(&root, &source)?;
  let destination_path = writable_path(&root, &destination)?;
  fs::rename(&source_path, &destination_path).map_err(|error| error.to_string())?;
  Ok(json!({
    "ok": true,
    "source": source_path.to_string_lossy(),
    "destination": destination_path.to_string_lossy()
  }))
}

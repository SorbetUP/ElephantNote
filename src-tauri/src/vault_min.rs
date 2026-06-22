use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use crate::vault_layout;

type R<T> = Result<T, String>;
const META: &str = vault_layout::HIDDEN_ROOT;
const CONFIG_FILE: &str = "tauri-vaults.json";

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Config {
  vaults: Vec<Vault>,
  active_vault_id: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Vault {
  id: String,
  name: String,
  path: String,
  icon: String,
  last_opened_at: String,
}

fn now() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn id(value: &str) -> String {
  let mut out = String::new();
  let mut dash = false;
  for ch in value.trim().to_lowercase().chars() {
    if ch.is_ascii_alphanumeric() { out.push(ch); dash = false; }
    else if !dash { out.push('-'); dash = true; }
  }
  let out = out.trim_matches('-').to_string();
  if out.is_empty() { "vault".to_string() } else { out }
}

fn basename(path: &Path) -> String {
  path.file_name().and_then(|n| n.to_str()).unwrap_or("Personal").to_string()
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
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join(CONFIG_FILE))
}

fn read_config(app: &AppHandle) -> R<Config> {
  let path = config_path(app)?;
  if !path.exists() { return Ok(Config::default()); }
  let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
  Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn write_config(app: &AppHandle, config: &Config) -> R<()> {
  let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
  fs::write(config_path(app)?, raw).map_err(|e| e.to_string())
}

fn active_vault(config: &Config) -> Option<Vault> {
  let id = config.active_vault_id.as_ref()?;
  config.vaults.iter().find(|vault| &vault.id == id).cloned()
}

fn workspace_path(root: &str, file: &str) -> PathBuf {
  vault_layout::config_file(root, file)
}

fn legacy_workspace_path(root: &str, file: &str) -> PathBuf {
  PathBuf::from(root).join(META).join(file)
}

fn write_json_if_missing(path: PathBuf, value: Value) -> R<()> {
  if path.exists() { return Ok(()); }
  if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
  let raw = serde_json::to_string_pretty(&value).map_err(|e| e.to_string())?;
  fs::write(path, raw).map_err(|e| e.to_string())
}

fn read_json(path: PathBuf, fallback: Value) -> Value {
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or(fallback)
}

fn init_vault(root: &str) -> R<Value> {
  let root_path = PathBuf::from(root);
  fs::create_dir_all(vault_layout::hidden_root(&root_path)).map_err(|e| e.to_string())?;
  for dir in vault_layout::required_hidden_dirs() {
    fs::create_dir_all(vault_layout::hidden_dir(&root_path, dir)).map_err(|e| e.to_string())?;
  }
  fs::create_dir_all(root_path.join("Getting Started")).map_err(|e| e.to_string())?;
  let workspace = json!({
    "version": 1,
    "vaultName": basename(&root_path),
    "sidebar": [{ "id": "getting-started", "title": "Getting started", "type": "folder", "path": "Getting Started", "collapsed": false }]
  });
  write_json_if_missing(workspace_path(root, vault_layout::WORKSPACE_FILE), workspace.clone())?;
  write_json_if_missing(vault_layout::config_file(root, vault_layout::VAULT_FILE), json!({ "version": 1, "createdAt": now() }))?;
  write_json_if_missing(vault_layout::index_file(root, vault_layout::INDEX_FILE), json!({ "version": 1, "updatedAt": now(), "entries": [] }))?;
  write_json_if_missing(vault_layout::config_file(root, vault_layout::CALENDAR_FILE), json!({ "version": 1, "updatedAt": now(), "events": [] }))?;
  write_json_if_missing(vault_layout::config_file(root, vault_layout::SOURCES_FILE), json!({ "version": 1, "updatedAt": now(), "sources": [] }))?;
  write_json_if_missing(vault_layout::wiki_file(root, vault_layout::WIKI_FILE), json!({ "version": 1, "updatedAt": now(), "records": [] }))?;
  write_json_if_missing(vault_layout::models_file(root, vault_layout::MODELS_FILE), json!({ "provider": "none", "modelId": "", "local": false }))?;
  write_json_if_missing(vault_layout::sync_file(root, vault_layout::SYNC_FILE), json!({ "version": 1, "queue": [], "lastRunAt": null }))?;
  let welcome = root_path.join("Getting Started").join("Welcome.md");
  if !welcome.exists() {
    let stamp = now();
    fs::write(welcome, format!("---\ntitle: \"Welcome\"\ntype: \"note\"\ntags: []\ncreatedAt: \"{}\"\nupdatedAt: \"{}\"\n---\n\n# Welcome to ElephantNote\n", stamp, stamp)).map_err(|e| e.to_string())?;
  }
  let canonical = workspace_path(root, vault_layout::WORKSPACE_FILE);
  let legacy = legacy_workspace_path(root, vault_layout::WORKSPACE_FILE);
  let fallback = read_json(legacy, workspace.clone());
  Ok(read_json(canonical, fallback))
}

fn entry_updated_at(path: &Path) -> String {
  fs::metadata(path)
    .and_then(|m| m.modified())
    .ok()
    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
    .map(|d| d.as_secs().to_string())
    .unwrap_or_else(now)
}

fn ignored(name: &str) -> bool {
  name == META || name == ".git" || name == "node_modules" || name.starts_with('.') || name.ends_with('~') || name.ends_with(".tmp")
}

fn markdown_title(markdown: &str, fallback: &str) -> String {
  for line in markdown.lines() {
    if let Some(title) = line.strip_prefix("title:") {
      return title.trim().trim_matches('"').to_string();
    }
  }
  markdown
    .lines()
    .find_map(|line| line.strip_prefix("# ").map(|value| value.trim().to_string()))
    .unwrap_or_else(|| fallback.trim_end_matches(".md").to_string())
}

fn list_directory(vault: &Vault, relative_path: &str) -> R<Vec<Value>> {
  let mut entries = Vec::new();
  let directory = inside(&vault.path, relative_path);
  for item in fs::read_dir(directory).map_err(|e| e.to_string())? {
    let item = item.map_err(|e| e.to_string())?;
    let name = item.file_name().to_string_lossy().to_string();
    if ignored(&name) { continue; }
    let path = item.path();
    let child_relative = normalize_relative_path(&format!("{}/{}", relative_path, name));
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
      let note_count = fs::read_dir(&path)
        .ok()
        .map(|children| children.filter_map(Result::ok).filter(|child| child.file_name().to_string_lossy().to_lowercase().ends_with(".md")).count())
        .unwrap_or(0);
      entries.push(json!({ "kind": "folder", "title": name, "path": child_relative, "noteCount": note_count, "updatedAt": entry_updated_at(&path), "type": "folder", "tags": [], "createdAt": "", "excerpt": "", "coverImage": "" }));
    } else if metadata.is_file() && name.to_lowercase().ends_with(".md") {
      let markdown = fs::read_to_string(&path).unwrap_or_default();
      let title = markdown_title(&markdown, &name);
      let excerpt = markdown.lines().filter(|line| !line.trim().is_empty()).take(3).collect::<Vec<_>>().join(" ");
      entries.push(json!({ "kind": "note", "title": title, "path": child_relative, "filename": name, "updatedAt": entry_updated_at(&path), "type": "note", "tags": [], "createdAt": "", "excerpt": excerpt, "coverImage": "" }));
    }
  }
  Ok(entries)
}

fn payload(app: &AppHandle, vault: Option<Vault>) -> R<Value> {
  let config = read_config(app)?;
  if let Some(vault) = vault {
    Ok(json!({ "vaults": config.vaults, "activeVaultId": config.active_vault_id, "activeVault": vault, "workspace": init_vault(&vault.path)?, "entries": list_directory(&vault, "")? }))
  } else {
    Ok(json!({ "vaults": config.vaults, "activeVaultId": config.active_vault_id, "activeVault": null, "workspace": null, "entries": [] }))
  }
}

fn current(app: &AppHandle) -> R<Vault> {
  active_vault(&read_config(app)?).ok_or_else(|| "No active ElephantNote vault.".to_string())
}

fn next_available_name(directory: &Path, base: &str) -> String {
  if !directory.join(base).exists() { return base.to_string(); }
  let stem = base.trim_end_matches(".md");
  let ext = if base.ends_with(".md") { ".md" } else { "" };
  let mut i = 2;
  loop {
    let candidate = format!("{} {}{}", stem, i, ext);
    if !directory.join(&candidate).exists() { return candidate; }
    i += 1;
  }
}

fn scan_notes(root: &Path, current: &Path, out: &mut Vec<Value>, query: &str) -> R<()> {
  for item in fs::read_dir(current).map_err(|e| e.to_string())? {
    let item = item.map_err(|e| e.to_string())?;
    let name = item.file_name().to_string_lossy().to_string();
    if ignored(&name) { continue; }
    let path = item.path();
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
      scan_notes(root, &path, out, query)?;
    } else if metadata.is_file() && name.to_lowercase().ends_with(".md") {
      let markdown = fs::read_to_string(&path).unwrap_or_default();
      let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
      if markdown.to_lowercase().contains(query) || relative.to_lowercase().contains(query) {
        out.push(json!({ "path": relative, "fullPath": path.to_string_lossy(), "title": markdown_title(&markdown, &name), "excerpt": markdown.lines().take(3).collect::<Vec<_>>().join(" "), "tags": [], "score": 1 }));
      }
    }
  }
  Ok(())
}

#[tauri::command]
pub fn tauri_vaults_get(app: AppHandle) -> R<Value> {
  let config = read_config(&app)?;
  payload(&app, active_vault(&config))
}

#[tauri::command]
pub fn tauri_vaults_select_path(app: AppHandle, vault_path: String) -> R<Value> {
  let mut config = read_config(&app)?;
  let path = vault_path.replace('\\', "/");
  if let Some(index) = config.vaults.iter().position(|vault| vault.path == path) {
    config.vaults[index].last_opened_at = now();
    config.active_vault_id = Some(config.vaults[index].id.clone());
    let vault = config.vaults[index].clone();
    write_config(&app, &config)?;
    return payload(&app, Some(vault));
  }
  let name = basename(Path::new(&path));
  let mut vault_id = id(&name);
  let base_id = vault_id.clone();
  let mut suffix = 2;
  while config.vaults.iter().any(|vault| vault.id == vault_id) {
    vault_id = format!("{}-{}", base_id, suffix);
    suffix += 1;
  }
  let vault = Vault { id: vault_id.clone(), name, path, icon: String::new(), last_opened_at: now() };
  config.active_vault_id = Some(vault_id);
  config.vaults.push(vault.clone());
  write_config(&app, &config)?;
  payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_vaults_set_active(app: AppHandle, vault_id: String) -> R<Value> {
  let mut config = read_config(&app)?;
  config.active_vault_id = Some(vault_id);
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_set_icon(app: AppHandle, vault_id: String, icon: String) -> R<Value> {
  let mut config = read_config(&app)?;
  for vault in &mut config.vaults { if vault.id == vault_id { vault.icon = icon.clone(); } }
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_set_name(app: AppHandle, vault_id: String, name: String) -> R<Value> {
  let mut config = read_config(&app)?;
  for vault in &mut config.vaults { if vault.id == vault_id { vault.name = name.trim().to_string(); } }
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_remove(app: AppHandle, vault_id: String) -> R<Value> {
  let mut config = read_config(&app)?;
  config.vaults.retain(|vault| vault.id != vault_id);
  if config.active_vault_id.as_deref() == Some(&vault_id) { config.active_vault_id = config.vaults.first().map(|vault| vault.id.clone()); }
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  payload(&app, vault)
}

#[tauri::command]
pub fn tauri_directory_list(app: AppHandle, relative_path: Option<String>) -> R<Vec<Value>> {
  list_directory(&current(&app)?, relative_path.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn tauri_notes_create(app: AppHandle, relative_path: Option<String>, filename: Option<String>, title: Option<String>) -> R<Value> {
  let vault = current(&app)?;
  let relative_path = relative_path.unwrap_or_default();
  let directory = inside(&vault.path, &relative_path);
  fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
  let filename = filename.filter(|f| !f.trim().is_empty()).unwrap_or_else(|| next_available_name(&directory, "Untitled.md"));
  let full_path = directory.join(&filename);
  let title = title.filter(|t| !t.trim().is_empty()).unwrap_or_else(|| filename.trim_end_matches(".md").to_string());
  if !full_path.exists() {
    let stamp = now();
    fs::write(&full_path, format!("---\ntitle: \"{}\"\ntype: \"note\"\ntags: []\ncreatedAt: \"{}\"\nupdatedAt: \"{}\"\n---\n\n# {}\n", title.replace('"', "\\\""), stamp, stamp, title)).map_err(|e| e.to_string())?;
  }
  Ok(json!({ "note": { "path": normalize_relative_path(&format!("{}/{}", relative_path, filename)), "fullPath": full_path.to_string_lossy(), "title": title }, "entries": list_directory(&vault, &relative_path)? }))
}

#[tauri::command]
pub fn tauri_folders_create(app: AppHandle, relative_path: Option<String>) -> R<Value> {
  let vault = current(&app)?;
  let relative_path = relative_path.unwrap_or_default();
  let directory = inside(&vault.path, &relative_path);
  fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
  let folder = next_available_name(&directory, "New Folder");
  let full_path = directory.join(&folder);
  fs::create_dir_all(&full_path).map_err(|e| e.to_string())?;
  Ok(json!({ "folder": { "path": normalize_relative_path(&format!("{}/{}", relative_path, folder)), "fullPath": full_path.to_string_lossy() }, "entries": list_directory(&vault, &relative_path)? }))
}

#[tauri::command]
pub fn tauri_sidebar_attach(app: AppHandle, relative_path: String, title: Option<String>, entry_type: Option<String>) -> R<Value> {
  let vault = current(&app)?;
  let mut workspace = read_json(workspace_path(&vault.path, vault_layout::WORKSPACE_FILE), json!({ "sidebar": [] }));
  let normalized = normalize_relative_path(&relative_path);
  let mut sidebar = workspace.get("sidebar").and_then(Value::as_array).cloned().unwrap_or_default();
  sidebar.retain(|entry| entry.get("path").and_then(Value::as_str) != Some(normalized.as_str()));
  sidebar.push(json!({ "id": id(&normalized), "title": title.unwrap_or_else(|| basename(Path::new(&normalized)).trim_end_matches(".md").to_string()), "type": entry_type.unwrap_or_else(|| if normalized.ends_with(".md") { "note".to_string() } else { "folder".to_string() }), "path": normalized, "collapsed": false }));
  workspace["sidebar"] = json!(sidebar);
  let raw = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
  let path = workspace_path(&vault.path, vault_layout::WORKSPACE_FILE);
  if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
  fs::write(path, raw).map_err(|e| e.to_string())?;
  Ok(json!({ "workspace": workspace, "entries": list_directory(&vault, "")? }))
}

#[tauri::command]
pub fn tauri_sidebar_detach(app: AppHandle, relative_path: String) -> R<Value> {
  let vault = current(&app)?;
  let mut workspace = read_json(workspace_path(&vault.path, vault_layout::WORKSPACE_FILE), json!({ "sidebar": [] }));
  let normalized = normalize_relative_path(&relative_path);
  let mut sidebar = workspace.get("sidebar").and_then(Value::as_array).cloned().unwrap_or_default();
  sidebar.retain(|entry| entry.get("path").and_then(Value::as_str) != Some(normalized.as_str()));
  workspace["sidebar"] = json!(sidebar);
  let raw = serde_json::to_string_pretty(&workspace).map_err(|e| e.to_string())?;
  fs::write(workspace_path(&vault.path, vault_layout::WORKSPACE_FILE), raw).map_err(|e| e.to_string())?;
  Ok(json!({ "workspace": workspace, "entries": list_directory(&vault, "")? }))
}

#[tauri::command]
pub fn tauri_entries_rename(app: AppHandle, relative_path: String, title: String) -> R<Value> {
  let vault = current(&app)?;
  let source = inside(&vault.path, &relative_path);
  let parent = source.parent().ok_or_else(|| "Cannot rename vault root.".to_string())?;
  let mut safe = title.trim().replace('/', "-").replace('\\', "-");
  if source.extension().and_then(|e| e.to_str()) == Some("md") && !safe.to_lowercase().ends_with(".md") { safe.push_str(".md"); }
  fs::rename(&source, parent.join(safe)).map_err(|e| e.to_string())?;
  payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_entries_move(app: AppHandle, relative_path: String, target_directory_path: Option<String>) -> R<Value> {
  let vault = current(&app)?;
  let source = inside(&vault.path, &relative_path);
  let target_dir = inside(&vault.path, target_directory_path.as_deref().unwrap_or(""));
  fs::create_dir_all(&target_dir).map_err(|e| e.to_string())?;
  let name = source.file_name().ok_or_else(|| "Invalid source path.".to_string())?;
  fs::rename(&source, target_dir.join(name)).map_err(|e| e.to_string())?;
  payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_entries_delete(_app: AppHandle, _relative_path: String) -> R<Value> {
  Err("Deletion is intentionally disabled in the initial Tauri backend until trash support is implemented.".to_string())
}

#[tauri::command]
pub fn tauri_calendar_list(app: AppHandle) -> R<Vec<Value>> {
  let vault = current(&app)?;
  Ok(read_json(vault_layout::config_file(&vault.path, vault_layout::CALENDAR_FILE), json!({ "events": [] })).get("events").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_sources_list(app: AppHandle) -> R<Vec<Value>> {
  let vault = current(&app)?;
  Ok(read_json(vault_layout::config_file(&vault.path, vault_layout::SOURCES_FILE), json!({ "sources": [] })).get("sources").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_wiki_list(app: AppHandle) -> R<Vec<Value>> {
  let vault = current(&app)?;
  Ok(read_json(vault_layout::wiki_file(&vault.path, vault_layout::WIKI_FILE), json!({ "records": [] })).get("records").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_search_query(app: AppHandle, params: Option<Value>) -> R<Value> {
  let vault = current(&app)?;
  let query = params.and_then(|p| p.get("query").or_else(|| p.get("q")).and_then(Value::as_str).map(str::to_string)).unwrap_or_default().to_lowercase();
  if query.trim().is_empty() { return Ok(json!({ "results": [] })); }
  let root = PathBuf::from(&vault.path);
  let mut results = Vec::new();
  scan_notes(&root, &root, &mut results, &query)?;
  Ok(json!({ "results": results }))
}

#[tauri::command]
pub fn tauri_search_status(app: AppHandle) -> R<Value> {
  Ok(json!({ "enabled": true, "runtime": "tauri-rust", "activeVault": active_vault(&read_config(&app)?) }))
}

#[tauri::command]
pub fn tauri_sync_status(app: AppHandle) -> R<Value> {
  Ok(json!({ "runtime": "tauri-rust", "activeVault": active_vault(&read_config(&app)?), "queued": 0, "running": false, "lastRunAt": null }))
}

#[tauri::command]
pub fn tauri_sync_enqueue(operation: String, payload: Option<Value>) -> R<Value> {
  Ok(json!({ "queued": false, "operation": operation, "payload": payload, "reason": "queue-not-enabled-yet" }))
}

#[tauri::command]
pub fn tauri_sync_run(app: AppHandle, payload_by_operation: Option<Value>) -> R<Value> {
  Ok(json!({ "ok": true, "runtime": "tauri-rust", "activeVault": active_vault(&read_config(&app)?), "payload": payload_by_operation }))
}

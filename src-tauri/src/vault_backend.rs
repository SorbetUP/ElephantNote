use serde_json::{json, Value};
use std::{
  fs,
  path::{Path, PathBuf},
  time::{Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

type R<T> = Result<T, String>;
const META: &str = ".elephantnote";
const CFG: &str = "tauri-vaults.json";
const AI_CFG: &str = "tauri-ai-config.json";
const FEATURES_CFG: &str = "tauri-features.json";
const MODEL_SELECTION_CFG: &str = "tauri-model-selection.json";

fn ts() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".into())
}
fn sl(value: impl AsRef<str>) -> String { value.as_ref().replace('\\', "/") }
fn bn(path: impl AsRef<Path>) -> String {
  path.as_ref().file_name().and_then(|name| name.to_str()).unwrap_or("Personal").to_string()
}
fn no_md(value: &str) -> String {
  value.strip_suffix(".md").or_else(|| value.strip_suffix(".MD")).unwrap_or(value).to_string()
}
fn id(value: &str) -> String {
  let mut output = String::new();
  let mut dash = false;
  for ch in value.trim().to_lowercase().chars() {
    if ch.is_ascii_alphanumeric() { output.push(ch); dash = false; }
    else if !dash { output.push('-'); dash = true; }
  }
  let trimmed = output.trim_matches('-').to_string();
  if trimmed.is_empty() { "vault".into() } else { trimmed }
}
fn rel(value: &str) -> String {
  value.replace('\\', "/").split('/').filter(|part| !part.is_empty() && *part != "." && *part != "..").collect::<Vec<_>>().join("/")
}
fn inside(root: &str, relative_path: &str) -> PathBuf {
  let normalized = rel(relative_path);
  if normalized.is_empty() { PathBuf::from(root) } else { PathBuf::from(root).join(normalized) }
}
fn wp(root: &str, filename: &str) -> PathBuf { PathBuf::from(root).join(META).join(filename) }
fn app_path(app: &AppHandle, filename: &str) -> R<PathBuf> {
  let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
  Ok(dir.join(filename))
}
fn read_json(path: PathBuf, fallback: Value) -> Value {
  fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok()).unwrap_or(fallback)
}
fn write_json(path: PathBuf, value: &Value) -> R<()> {
  if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; }
  fs::write(path, serde_json::to_string_pretty(value).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}
fn ensure_json(path: PathBuf, fallback: Value) -> R<()> { if path.exists() { Ok(()) } else { write_json(path, &fallback) } }
fn rc(app: &AppHandle) -> R<Value> {
  let path = app_path(app, CFG)?;
  if !path.exists() { return Ok(json!({ "vaults": [], "activeVaultId": null })); }
  Ok(read_json(path, json!({ "vaults": [], "activeVaultId": null })))
}
fn wc(app: &AppHandle, config: &Value) -> R<()> { write_json(app_path(app, CFG)?, config) }
fn app_json(app: &AppHandle, filename: &str, fallback: Value) -> R<Value> { Ok(read_json(app_path(app, filename)?, fallback)) }
fn write_app_json(app: &AppHandle, filename: &str, value: &Value) -> R<()> { write_json(app_path(app, filename)?, value) }
fn av(config: &Value) -> Option<Value> {
  let active_id = config.get("activeVaultId")?.as_str()?;
  config.get("vaults")?.as_array()?.iter().find(|vault| vault.get("id").and_then(Value::as_str) == Some(active_id)).cloned()
}
fn workspace_default(root: &str) -> Value {
  json!({ "version": 1, "vaultName": bn(Path::new(root)), "sidebar": [{ "id": "getting-started", "title": "Getting started", "type": "folder", "path": "Getting Started", "collapsed": false }] })
}
fn default_features() -> Value { json!({ "askAi": true, "sitePreview": false, "gitSync": false }) }
fn default_ai_config() -> Value {
  json!({ "localAi": { "enabled": true, "showModelLibraryInSidebar": true }, "providers": { "list": [], "codex": { "connected": false, "mode": "account", "model": "" } }, "routes": {}, "localModelSelection": {} })
}
fn init(root: &str) -> R<Value> {
  let root_path = PathBuf::from(root);
  let meta_path = root_path.join(META);
  let dirs = vec![
    meta_path.clone(),
    root_path.join("Getting Started"),
    meta_path.join("wiki"),
    meta_path.join("attachments"),
    meta_path.join("drawings"),
  ];
  for dir in dirs {
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
  }
  ensure_json(wp(root, "workspace.json"), workspace_default(root))?;
  ensure_json(wp(root, "index.json"), json!({ "version": 1, "updatedAt": ts(), "entries": [] }))?;
  ensure_json(wp(root, "calendar.json"), json!({ "version": 1, "updatedAt": ts(), "events": [] }))?;
  ensure_json(wp(root, "sources.json"), json!({ "version": 1, "updatedAt": ts(), "sources": [] }))?;
  ensure_json(wp(root, "wiki.json"), json!({ "version": 1, "updatedAt": ts(), "records": [] }))?;
  let welcome_path = root_path.join("Getting Started").join("Welcome.md");
  if !welcome_path.exists() {
    fs::write(welcome_path, format!("---\ntitle: \"Welcome\"\ntype: \"note\"\ntags: [\"getting-started\"]\ncreatedAt: \"{}\"\nupdatedAt: \"{}\"\n---\n\n# Welcome to ElephantNote\n", ts(), ts())).map_err(|error| error.to_string())?;
  }
  Ok(read_json(wp(root, "workspace.json"), workspace_default(root)))
}
fn ignored(name: &str) -> bool { name == META || name == ".git" || name == "node_modules" || name.starts_with('.') || name.ends_with('~') || name.ends_with(".tmp") }
fn mt(path: &Path) -> String {
  fs::metadata(path).and_then(|metadata| metadata.modified()).ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map(|duration| duration.as_secs().to_string()).unwrap_or_else(ts)
}
fn meta(markdown: &str, fallback_filename: &str) -> Value {
  let mut title = String::new();
  let mut tags = Vec::<String>::new();
  if let Some(rest) = markdown.strip_prefix("---") {
    if let Some(end) = rest.find("\n---") {
      for line in rest[..end].lines() {
        if let Some((key, value)) = line.split_once(':') {
          if key.trim() == "title" { title = value.trim().trim_matches('"').to_string(); }
          if key.trim() == "tags" {
            tags = value.trim().trim_matches(&['[', ']'][..]).split(',').map(|tag| tag.trim().trim_matches('"').trim_start_matches('#').to_string()).filter(|tag| !tag.is_empty()).collect();
          }
        }
      }
    }
  }
  let body = if markdown.starts_with("---") { markdown.splitn(3, "---").nth(2).unwrap_or(markdown) } else { markdown };
  if title.is_empty() {
    title = body.lines().find_map(|line| line.strip_prefix("# ").map(|value| value.trim().to_string())).unwrap_or_else(|| no_md(fallback_filename));
  }
  let excerpt = body.lines().map(|line| line.trim().trim_start_matches('#').trim()).filter(|line| !line.is_empty()).take(3).collect::<Vec<_>>().join(" ");
  json!({ "title": title, "type": "note", "tags": tags, "createdAt": "", "updatedAt": "", "excerpt": excerpt, "coverImage": "" })
}
fn list(vault: &Value, relative_path: &str) -> R<Vec<Value>> {
  let root = vault.get("path").and_then(Value::as_str).ok_or("invalid vault")?;
  let directory = inside(root, relative_path);
  let mut output = Vec::new();
  if !directory.exists() { return Ok(output); }
  for item in fs::read_dir(&directory).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let name = item.file_name().to_string_lossy().to_string();
    if ignored(&name) { continue; }
    let path = item.path();
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    let current_relative_path = rel(&format!("{}/{}", relative_path, name));
    if metadata.is_dir() {
      let note_count = fs::read_dir(&path).ok().map(|children| children.filter_map(Result::ok).filter(|child| child.file_name().to_string_lossy().to_lowercase().ends_with(".md")).count()).unwrap_or(0);
      output.push(json!({ "kind": "folder", "title": name, "path": current_relative_path, "noteCount": note_count, "updatedAt": mt(&path), "type": "folder", "tags": [], "createdAt": "", "excerpt": "", "coverImage": "" }));
    } else if metadata.is_file() && name.to_lowercase().ends_with(".md") {
      let markdown = fs::read_to_string(&path).unwrap_or_default();
      let mut entry = meta(&markdown, &name);
      entry["kind"] = json!("note");
      entry["path"] = json!(current_relative_path);
      entry["filename"] = json!(name);
      entry["updatedAt"] = json!(mt(&path));
      output.push(entry);
    }
  }
  Ok(output)
}
fn payload(app: &AppHandle, active_vault: Option<Value>) -> R<Value> {
  let config = rc(app)?;
  if let Some(vault) = active_vault {
    let root = vault.get("path").and_then(Value::as_str).unwrap_or("");
    Ok(json!({ "vaults": config.get("vaults").cloned().unwrap_or(json!([])), "activeVaultId": config.get("activeVaultId").cloned().unwrap_or(Value::Null), "activeVault": vault, "workspace": init(root)?, "entries": list(&vault, "")? }))
  } else {
    Ok(json!({ "vaults": config.get("vaults").cloned().unwrap_or(json!([])), "activeVaultId": config.get("activeVaultId").cloned().unwrap_or(Value::Null), "activeVault": null, "workspace": null, "entries": [] }))
  }
}
fn active(app: &AppHandle) -> R<Value> { av(&rc(app)?).ok_or_else(|| "No active ElephantNote vault.".to_string()) }
fn upsert(app: &AppHandle, path: String) -> R<Value> {
  let mut config = rc(app)?;
  let absolute_path = sl(PathBuf::from(path).to_string_lossy());
  let vaults = config.get_mut("vaults").and_then(Value::as_array_mut).ok_or("invalid config")?;
  if let Some(index) = vaults.iter().position(|vault| vault.get("path").and_then(Value::as_str) == Some(absolute_path.as_str())) {
    let vault_id = vaults[index].get("id").and_then(Value::as_str).unwrap_or("vault").to_string();
    vaults[index]["lastOpenedAt"] = json!(ts());
    let vault = vaults[index].clone();
    config["activeVaultId"] = json!(vault_id);
    wc(app, &config)?;
    return Ok(vault);
  }
  let name = bn(Path::new(&absolute_path));
  let mut vault_id = id(&name);
  let base_id = vault_id.clone();
  let mut suffix = 2;
  while vaults.iter().any(|vault| vault.get("id").and_then(Value::as_str) == Some(vault_id.as_str())) { vault_id = format!("{}-{}", base_id, suffix); suffix += 1; }
  let vault = json!({ "id": vault_id, "name": name, "path": absolute_path, "icon": "", "lastOpenedAt": ts() });
  config["activeVaultId"] = vault.get("id").cloned().unwrap_or(Value::Null);
  config.get_mut("vaults").and_then(Value::as_array_mut).unwrap().push(vault.clone());
  wc(app, &config)?;
  Ok(vault)
}
fn next_available_name(dir: &Path, name: &str) -> String {
  if !dir.join(name).exists() { return name.into(); }
  let ext = Path::new(name).extension().and_then(|ext| ext.to_str()).map(|ext| format!(".{}", ext)).unwrap_or_default();
  let stem = name.strip_suffix(&ext).unwrap_or(name);
  let mut index = 2;
  loop { let candidate = format!("{} {}{}", stem, index, ext); if !dir.join(&candidate).exists() { return candidate; } index += 1; }
}
fn scan(root: &Path, current: &Path, output: &mut Vec<(String, PathBuf, String)>) -> R<()> {
  for item in fs::read_dir(current).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let name = item.file_name().to_string_lossy().to_string();
    if ignored(&name) { continue; }
    let path = item.path();
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.is_dir() { scan(root, &path, output)?; }
    else if metadata.is_file() && name.to_lowercase().ends_with(".md") { output.push((sl(path.strip_prefix(root).unwrap_or(&path).to_string_lossy()), path.clone(), fs::read_to_string(&path).unwrap_or_default())); }
  }
  Ok(())
}
fn all_notes(vault: &Value) -> R<Vec<(String, PathBuf, String)>> {
  let root = PathBuf::from(vault.get("path").and_then(Value::as_str).unwrap_or(""));
  let mut notes = Vec::new();
  if root.exists() { scan(&root, &root, &mut notes)?; }
  Ok(notes)
}
fn note_payload(vault: &Value, relative_path: &str, markdown: String) -> Value {
  let root = vault.get("path").and_then(Value::as_str).unwrap_or("");
  let path = inside(root, relative_path);
  let filename = path.file_name().and_then(|name| name.to_str()).unwrap_or(relative_path);
  let metadata = meta(&markdown, filename);
  let content = markdown.clone();
  json!({ "path": rel(relative_path), "fullPath": path.to_string_lossy(), "markdown": markdown, "content": content, "title": metadata.get("title").cloned().unwrap_or(json!(no_md(filename))), "tags": metadata.get("tags").cloned().unwrap_or(json!([])), "excerpt": metadata.get("excerpt").cloned().unwrap_or(json!("")), "updatedAt": mt(&path), "kind": "note", "type": "note" })
}
fn search_result(relative_path: String, full_path: PathBuf, markdown: &str, score: f64) -> Value {
  let metadata = meta(markdown, &relative_path);
  json!({
    "id": format!("tauri:{}", relative_path),
    "path": relative_path,
    "relativePath": relative_path,
    "fullPath": full_path.to_string_lossy(),
    "title": metadata.get("title").cloned().unwrap_or(json!("Untitled")),
    "tags": metadata.get("tags").cloned().unwrap_or(json!([])),
    "excerpt": metadata.get("excerpt").cloned().unwrap_or(json!("")),
    "score": score,
    "matchType": "keyword"
  })
}

#[tauri::command] pub fn tauri_vaults_get(app: AppHandle) -> R<Value> { let config = rc(&app)?; payload(&app, av(&config)) }
#[tauri::command] pub fn tauri_vaults_select_path(app: AppHandle, vault_path: String) -> R<Value> { let vault = upsert(&app, vault_path)?; payload(&app, Some(vault)) }
#[tauri::command] pub fn tauri_vaults_set_active(app: AppHandle, vault_id: String) -> R<Value> { let mut config = rc(&app)?; config["activeVaultId"] = json!(vault_id); let vault = av(&config); wc(&app, &config)?; payload(&app, vault) }
#[tauri::command] pub fn tauri_vaults_set_icon(app: AppHandle, vault_id: String, icon: Option<String>) -> R<Value> { let mut config = rc(&app)?; if let Some(vaults) = config.get_mut("vaults").and_then(Value::as_array_mut) { for vault in vaults { if vault.get("id").and_then(Value::as_str) == Some(vault_id.as_str()) { vault["icon"] = json!(icon.clone().unwrap_or_default()); } } } let vault = av(&config); wc(&app, &config)?; payload(&app, vault) }
#[tauri::command] pub fn tauri_vaults_set_name(app: AppHandle, vault_id: String, name: String) -> R<Value> { let mut config = rc(&app)?; if let Some(vaults) = config.get_mut("vaults").and_then(Value::as_array_mut) { for vault in vaults { if vault.get("id").and_then(Value::as_str) == Some(vault_id.as_str()) { vault["name"] = json!(name.trim()); } } } let vault = av(&config); wc(&app, &config)?; payload(&app, vault) }
#[tauri::command] pub fn tauri_vaults_remove(app: AppHandle, vault_id: String) -> R<Value> { let mut config = rc(&app)?; if let Some(vaults) = config.get_mut("vaults").and_then(Value::as_array_mut) { vaults.retain(|vault| vault.get("id").and_then(Value::as_str) != Some(vault_id.as_str())); } if config.get("activeVaultId").and_then(Value::as_str) == Some(vault_id.as_str()) { config["activeVaultId"] = config.get("vaults").and_then(Value::as_array).and_then(|vaults| vaults.first()).and_then(|vault| vault.get("id")).cloned().unwrap_or(Value::Null); } let vault = av(&config); wc(&app, &config)?; payload(&app, vault) }
#[tauri::command] pub fn tauri_directory_list(app: AppHandle, relative_path: Option<String>) -> R<Vec<Value>> { list(&active(&app)?, relative_path.as_deref().unwrap_or("")) }
#[tauri::command] pub fn tauri_notes_create(app: AppHandle, relative_path: Option<String>, filename: Option<String>, title: Option<String>) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let relative_dir = relative_path.unwrap_or_default(); let dir = inside(root, &relative_dir); fs::create_dir_all(&dir).map_err(|error| error.to_string())?; let filename = filename.filter(|name| !name.trim().is_empty()).unwrap_or_else(|| next_available_name(&dir, "Untitled.md")); let path = dir.join(&filename); let title = title.filter(|title| !title.trim().is_empty()).unwrap_or_else(|| no_md(&filename)); if !path.exists() { fs::write(&path, format!("---\ntitle: \"{}\"\ntype: \"note\"\ntags: []\ncreatedAt: \"{}\"\nupdatedAt: \"{}\"\n---\n\n# {}\n", title.replace('"', "\\\""), ts(), ts(), title)).map_err(|error| error.to_string())?; } Ok(json!({ "note": { "path": rel(&format!("{}/{}", relative_dir, filename)), "fullPath": path.to_string_lossy(), "title": title, "kind": "note", "type": "note" }, "entries": list(&vault, &relative_dir)? })) }
#[tauri::command] pub fn tauri_notes_read(app: AppHandle, relative_path: String) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let path = inside(root, &relative_path); let markdown = fs::read_to_string(&path).map_err(|error| error.to_string())?; Ok(note_payload(&vault, &relative_path, markdown)) }
#[tauri::command] pub fn tauri_notes_write(app: AppHandle, relative_path: String, markdown: String) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let path = inside(root, &relative_path); if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|error| error.to_string())?; } fs::write(&path, &markdown).map_err(|error| error.to_string())?; let parent = Path::new(&relative_path).parent().and_then(|path| path.to_str()).unwrap_or(""); Ok(json!({ "note": note_payload(&vault, &relative_path, markdown), "entries": list(&vault, parent)? })) }
#[tauri::command] pub fn tauri_folders_create(app: AppHandle, relative_path: Option<String>) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let relative_dir = relative_path.unwrap_or_default(); let dir = inside(root, &relative_dir); fs::create_dir_all(&dir).map_err(|error| error.to_string())?; let filename = next_available_name(&dir, "New Folder"); let path = dir.join(&filename); fs::create_dir_all(&path).map_err(|error| error.to_string())?; Ok(json!({ "folder": { "path": rel(&format!("{}/{}", relative_dir, filename)), "fullPath": path.to_string_lossy() }, "entries": list(&vault, &relative_dir)? })) }
#[tauri::command] pub fn tauri_sidebar_attach(app: AppHandle, relative_path: String, title: Option<String>, entry_type: Option<String>) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let path = rel(&relative_path); let mut workspace = read_json(wp(root, "workspace.json"), workspace_default(root)); let mut sidebar = workspace.get("sidebar").and_then(Value::as_array).cloned().unwrap_or_default(); sidebar.retain(|entry| entry.get("path").and_then(Value::as_str) != Some(path.as_str())); sidebar.push(json!({ "id": id(&path), "title": title.unwrap_or_else(|| no_md(&bn(Path::new(&path)))), "type": entry_type.unwrap_or_else(|| if path.ends_with(".md") { "note".into() } else { "folder".into() }), "path": path, "collapsed": false })); workspace["sidebar"] = json!(sidebar); write_json(wp(root, "workspace.json"), &workspace)?; Ok(json!({ "workspace": workspace, "entries": list(&vault, "")? })) }
#[tauri::command] pub fn tauri_sidebar_detach(app: AppHandle, relative_path: String) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let path = rel(&relative_path); let mut workspace = read_json(wp(root, "workspace.json"), workspace_default(root)); let mut sidebar = workspace.get("sidebar").and_then(Value::as_array).cloned().unwrap_or_default(); sidebar.retain(|entry| entry.get("path").and_then(Value::as_str) != Some(path.as_str())); workspace["sidebar"] = json!(sidebar); write_json(wp(root, "workspace.json"), &workspace)?; Ok(json!({ "workspace": workspace, "entries": list(&vault, "")? })) }
#[tauri::command] pub fn tauri_entries_rename(app: AppHandle, relative_path: String, title: String) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let source = inside(root, &relative_path); let parent = source.parent().ok_or("Cannot rename vault root")?; let safe_title = title.trim().replace('/', "-").replace('\\', "-"); let extension = if source.is_file() && source.extension().is_some() && Path::new(&safe_title).extension().is_none() { source.extension().and_then(|ext| ext.to_str()).map(|ext| format!(".{}", ext)).unwrap_or_default() } else { String::new() }; fs::rename(&source, parent.join(format!("{}{}", safe_title, extension))).map_err(|error| error.to_string())?; payload(&app, Some(vault)) }
#[tauri::command] pub fn tauri_entries_move(app: AppHandle, relative_path: String, target_directory_path: Option<String>) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let source = inside(root, &relative_path); let destination = inside(root, target_directory_path.as_deref().unwrap_or("")); fs::create_dir_all(&destination).map_err(|error| error.to_string())?; let name = source.file_name().ok_or("Invalid source path")?; fs::rename(&source, destination.join(name)).map_err(|error| error.to_string())?; payload(&app, Some(vault)) }
#[tauri::command] pub fn tauri_entries_delete(app: AppHandle, relative_path: String) -> R<Value> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); let target = inside(root, &relative_path); if target.is_dir() { fs::remove_dir_all(&target).map_err(|error| error.to_string())?; } else if target.is_file() { fs::remove_file(&target).map_err(|error| error.to_string())?; } payload(&app, Some(vault)) }
#[tauri::command] pub fn tauri_calendar_list(app: AppHandle) -> R<Vec<Value>> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); Ok(read_json(wp(root, "calendar.json"), json!({ "events": [] })).get("events").and_then(Value::as_array).cloned().unwrap_or_default()) }
#[tauri::command] pub fn tauri_sources_list(app: AppHandle) -> R<Vec<Value>> { let vault = active(&app)?; let root = vault.get("path").and_then(Value::as_str).unwrap_or(""); Ok(read_json(wp(root, "sources.json"), json!({ "sources": [] })).get("sources").and_then(Value::as_array).cloned().unwrap_or_default()) }
#[tauri::command] pub fn tauri_wiki_list(app: AppHandle) -> R<Vec<Value>> { let vault = active(&app)?; list(&vault, &format!("{}/wiki", META)) }

#[tauri::command]
pub fn tauri_search_query(app: AppHandle, params: Option<Value>) -> R<Vec<Value>> {
  let vault = active(&app)?;
  let query = params
    .and_then(|value| value.get("query").or_else(|| value.get("q")).and_then(Value::as_str).map(|value| value.to_lowercase()))
    .unwrap_or_default();
  if query.trim().is_empty() { return Ok(Vec::new()); }

  let mut results = Vec::new();
  for (relative_path, full_path, markdown) in all_notes(&vault)? {
    if markdown.to_lowercase().contains(&query) || relative_path.to_lowercase().contains(&query) {
      results.push(search_result(relative_path, full_path, &markdown, 1.0));
    }
  }
  Ok(results)
}

#[tauri::command] pub fn tauri_search_status(app: AppHandle) -> R<Value> { let active_vault = av(&rc(&app)?); let indexed_notes = match active_vault.as_ref() { Some(vault) => all_notes(vault).map(|notes| notes.len()).unwrap_or(0), None => 0 }; Ok(json!({ "enabled": true, "runtime": "tauri-rust", "activeVault": active_vault, "indexedNotes": indexed_notes, "notesIndexed": indexed_notes, "status": "ready" })) }
#[tauri::command] pub fn tauri_search_rebuild(app: AppHandle) -> R<Value> { tauri_search_status(app) }

#[tauri::command]
pub fn tauri_search_inspect(app: AppHandle) -> R<Value> {
  let active_vault = active(&app)?;
  let notes = all_notes(&active_vault)?;
  let documents = notes.iter().map(|(path, full_path, markdown)| {
    let metadata = meta(markdown, path);
    json!({
      "id": path,
      "path": path,
      "relativePath": path,
      "fullPath": full_path.to_string_lossy(),
      "title": metadata.get("title").cloned().unwrap_or(json!(path)),
      "tags": metadata.get("tags").cloned().unwrap_or(json!([])),
      "excerpt": metadata.get("excerpt").cloned().unwrap_or(json!("")),
      "kind": "note"
    })
  }).collect::<Vec<Value>>();
  let nodes = documents.iter().map(|document| json!({
    "id": document.get("relativePath").cloned().unwrap_or(json!("")),
    "label": document.get("title").cloned().unwrap_or(json!("Untitled")),
    "title": document.get("title").cloned().unwrap_or(json!("Untitled")),
    "path": document.get("relativePath").cloned().unwrap_or(json!("")),
    "relativePath": document.get("relativePath").cloned().unwrap_or(json!("")),
    "kind": "note",
    "type": "note"
  })).collect::<Vec<Value>>();
  Ok(json!({ "runtime": "tauri-rust", "notesIndexed": documents.len(), "documents": documents, "folders": [], "semanticLinks": [], "graph": { "nodes": nodes, "edges": [], "clusters": [] } }))
}

#[tauri::command] pub fn tauri_features_get(app: AppHandle) -> R<Value> { app_json(&app, FEATURES_CFG, default_features()) }
#[tauri::command] pub fn tauri_features_set(app: AppHandle, key: String, enabled: Option<bool>) -> R<Value> { let mut features = app_json(&app, FEATURES_CFG, default_features())?; if !features.is_object() { features = default_features(); } features[key.as_str()] = json!(enabled.unwrap_or(true)); write_app_json(&app, FEATURES_CFG, &features)?; Ok(features) }
#[tauri::command] pub fn tauri_ai_config_get(app: AppHandle) -> R<Value> { app_json(&app, AI_CFG, default_ai_config()) }
#[tauri::command] pub fn tauri_ai_config_set(app: AppHandle, config: Value) -> R<Value> { let normalized = if config.is_object() { config } else { default_ai_config() }; write_app_json(&app, AI_CFG, &normalized)?; Ok(normalized) }
#[tauri::command] pub fn tauri_ai_config_test(config: Option<Value>) -> R<Value> { let started = Instant::now(); Ok(json!({ "ok": true, "runtime": "tauri-rust", "latencyMs": started.elapsed().as_millis() as u64, "message": "Tauri bridge configuration is reachable.", "config": config.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_get_selection(app: AppHandle) -> R<Value> { app_json(&app, MODEL_SELECTION_CFG, json!({})) }
#[tauri::command] pub fn tauri_models_set_selection(app: AppHandle, selection: Value) -> R<Value> { let normalized = if selection.is_object() { selection } else { json!({}) }; write_app_json(&app, MODEL_SELECTION_CFG, &normalized)?; let mut ai_config = app_json(&app, AI_CFG, default_ai_config())?; if ai_config.is_object() { ai_config["localModelSelection"] = normalized.clone(); let _ = write_app_json(&app, AI_CFG, &ai_config); } Ok(normalized) }
#[tauri::command] pub fn tauri_models_list() -> R<Vec<Value>> { Ok(Vec::new()) }
#[tauri::command] pub fn tauri_models_list_local() -> R<Vec<Value>> { Ok(Vec::new()) }
#[tauri::command] pub fn tauri_models_active(app: AppHandle) -> R<Value> { Ok(json!({ "runtime": "tauri-rust", "selection": tauri_models_get_selection(app)? })) }
#[tauri::command] pub fn tauri_models_search_hugging_face(payload: Option<Value>) -> R<Value> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Hugging Face search is handled by the Electron backend until the Rust model library is implemented.", "payload": payload.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_info(payload: Option<Value>) -> R<Value> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Model info is not implemented in the Rust Tauri backend yet.", "payload": payload.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_download(payload: Option<Value>) -> R<Value> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Model download is not implemented in the Rust Tauri backend yet.", "payload": payload.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_cancel_download(payload: Option<Value>) -> R<Value> { Ok(json!({ "ok": true, "runtime": "tauri-rust", "cancelled": false, "payload": payload.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_download_status(payload: Option<Value>) -> R<Value> { Ok(json!({ "ok": true, "runtime": "tauri-rust", "status": "not_started", "payload": payload.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_activate(payload: Option<Value>) -> R<Value> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Model activation is not implemented in the Rust Tauri backend yet.", "payload": payload.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_deactivate(payload: Option<Value>) -> R<Value> { Ok(json!({ "ok": true, "runtime": "tauri-rust", "payload": payload.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_delete(payload: Option<Value>) -> R<Value> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Model deletion is not implemented in the Rust Tauri backend yet.", "payload": payload.unwrap_or(json!({})) })) }
#[tauri::command] pub fn tauri_models_refresh_index() -> R<Value> { Ok(json!({ "ok": true, "runtime": "tauri-rust", "models": [] })) }

#[tauri::command]
pub fn tauri_rag_chat(app: AppHandle, payload: Option<Value>) -> R<Value> {
  let payload = payload.unwrap_or(json!({}));
  let message = payload.get("message").or_else(|| payload.get("query")).and_then(Value::as_str).unwrap_or("").to_string();
  let limit = payload.get("limit").and_then(Value::as_u64).unwrap_or(6).max(1).min(20) as usize;
  let active_vault = active(&app)?;
  let query = message.to_lowercase();
  let mut citations = Vec::new();
  if !query.trim().is_empty() {
    for (relative_path, full_path, markdown) in all_notes(&active_vault)? {
      if citations.len() >= limit { break; }
      if markdown.to_lowercase().contains(&query) || relative_path.to_lowercase().contains(&query) {
        citations.push(search_result(relative_path, full_path, &markdown, 1.0));
      }
    }
  }
  Ok(json!({
    "answer": if citations.is_empty() { "Le runtime RAG Tauri est joignable, mais aucun contexte local correspondant n'a été trouvé." } else { "Le runtime RAG Tauri est joignable. J'ai trouvé du contexte local correspondant dans la vault." },
    "citations": citations,
    "runtime": "tauri-rust",
    "model": "tauri-local-search-fallback"
  }))
}

#[tauri::command] pub fn tauri_sync_status(app: AppHandle) -> R<Value> { Ok(json!({ "runtime": "tauri-rust", "activeVault": av(&rc(&app)?), "queued": 0, "running": false, "lastRunAt": null })) }
#[tauri::command] pub fn tauri_sync_plan(app: AppHandle) -> R<Value> { Ok(json!({ "runtime": "tauri-rust", "activeVault": av(&rc(&app)?), "operations": [], "changes": [] })) }
#[tauri::command] pub fn tauri_sync_enqueue(operation: String, payload: Option<Value>) -> R<Value> { Ok(json!({ "queued": false, "operation": operation, "payload": payload, "reason": "queue-not-enabled-yet" })) }
#[tauri::command] pub fn tauri_sync_run(app: AppHandle, payload_by_operation: Option<Value>) -> R<Value> { Ok(json!({ "ok": true, "runtime": "tauri-rust", "activeVault": av(&rc(&app)?), "payload": payload_by_operation })) }

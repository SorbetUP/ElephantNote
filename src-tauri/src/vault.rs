use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const WORKSPACE_DIR: &str = ".elephantnote";
const WORKSPACE_FILE: &str = "workspace.json";
const INDEX_FILE: &str = "index.json";
const CALENDAR_FILE: &str = "calendar.json";
const SOURCES_FILE: &str = "sources.json";
const WIKI_FILE: &str = "wiki.json";
const CONFIG_FILE: &str = "tauri-vaults.json";

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultConfig {
  pub vaults: Vec<Vault>,
  pub active_vault_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Vault {
  pub id: String,
  pub name: String,
  pub path: String,
  pub icon: String,
  pub last_opened_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
  pub version: u32,
  pub vault_name: String,
  pub sidebar: Vec<SidebarEntry>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SidebarEntry {
  pub id: String,
  pub title: String,
  #[serde(rename = "type")]
  pub entry_type: String,
  pub path: String,
  pub collapsed: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultEntry {
  pub kind: String,
  pub title: String,
  pub path: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub filename: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub note_count: Option<usize>,
  pub updated_at: String,
  #[serde(rename = "type")]
  pub note_type: String,
  pub tags: Vec<String>,
  pub created_at: String,
  pub excerpt: String,
  pub cover_image: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultPayload {
  pub vaults: Vec<Vault>,
  pub active_vault_id: Option<String>,
  pub active_vault: Option<Vault>,
  pub workspace: Option<Workspace>,
  pub entries: Vec<VaultEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteCreateResult {
  pub note: Value,
  pub entries: Vec<VaultEntry>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderCreateResult {
  pub folder: Value,
  pub entries: Vec<VaultEntry>,
}

fn now_string() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn modified_string(path: &Path) -> String {
  fs::metadata(path)
    .and_then(|metadata| metadata.modified())
    .ok()
    .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(now_string)
}

fn normalize_slashes(value: &str) -> String {
  value.replace('\\', "/")
}

fn basename(path: &Path) -> String {
  path.file_name()
    .and_then(|name| name.to_str())
    .unwrap_or("Personal")
    .to_string()
}

fn strip_markdown_extension(value: &str) -> String {
  value
    .strip_suffix(".md")
    .or_else(|| value.strip_suffix(".MD"))
    .unwrap_or(value)
    .to_string()
}

fn create_id(value: &str) -> String {
  let mut out = String::new();
  let mut last_dash = false;
  for ch in value.trim().to_lowercase().chars() {
    if ch.is_ascii_alphanumeric() {
      out.push(ch);
      last_dash = false;
    } else if !last_dash {
      out.push('-');
      last_dash = true;
    }
  }
  let id = out.trim_matches('-').to_string();
  if id.is_empty() { "vault".to_string() } else { id }
}

fn normalize_relative_path(relative_path: &str) -> String {
  let mut parts = Vec::new();
  for component in Path::new(relative_path).components() {
    match component {
      Component::Normal(value) => {
        if let Some(value) = value.to_str() {
          if !value.is_empty() && value != "." && value != ".." {
            parts.push(value.to_string());
          }
        }
      }
      _ => {}
    }
  }
  parts.join("/")
}

fn resolve_inside_vault(vault_root: &str, relative_path: &str) -> Result<PathBuf, String> {
  let normalized = normalize_relative_path(relative_path);
  let root = PathBuf::from(vault_root);
  if normalized.is_empty() {
    return Ok(root);
  }
  Ok(root.join(normalized))
}

fn workspace_path(vault_root: &str, file: &str) -> PathBuf {
  PathBuf::from(vault_root).join(WORKSPACE_DIR).join(file)
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
  let dir = app
    .path()
    .app_config_dir()
    .map_err(|error| format!("failed to resolve Tauri config directory: {error}"))?;
  fs::create_dir_all(&dir).map_err(|error| format!("failed to create config directory: {error}"))?;
  Ok(dir.join(CONFIG_FILE))
}

fn read_config(app: &AppHandle) -> Result<VaultConfig, String> {
  let path = config_path(app)?;
  if !path.exists() {
    return Ok(VaultConfig::default());
  }
  let raw = fs::read_to_string(&path).map_err(|error| format!("failed to read vault config: {error}"))?;
  serde_json::from_str(&raw).map_err(|error| format!("failed to parse vault config: {error}"))
}

fn write_config(app: &AppHandle, config: &VaultConfig) -> Result<(), String> {
  let path = config_path(app)?;
  let raw = serde_json::to_string_pretty(config).map_err(|error| format!("failed to serialize vault config: {error}"))?;
  fs::write(&path, raw).map_err(|error| format!("failed to write vault config: {error}"))
}

fn active_vault(config: &VaultConfig) -> Option<Vault> {
  let active_id = config.active_vault_id.as_ref()?;
  config.vaults.iter().find(|vault| &vault.id == active_id).cloned()
}

fn create_workspace(vault_root: &str) -> Workspace {
  Workspace {
    version: 1,
    vault_name: basename(Path::new(vault_root)),
    sidebar: vec![SidebarEntry {
      id: "getting-started".to_string(),
      title: "Getting started".to_string(),
      entry_type: "folder".to_string(),
      path: "Getting Started".to_string(),
      collapsed: false,
    }],
  }
}

fn create_welcome_markdown() -> String {
  let now = now_string();
  format!(
    "---\ntitle: \"Welcome\"\ntype: \"note\"\ntags: [\"getting-started\"]\ncreatedAt: \"{now}\"\nupdatedAt: \"{now}\"\n---\n\n# Welcome to ElephantNote\n\nWelcome to ElephantNote running through the Tauri backend.\n\n- Your vault is a normal folder.\n- Notes are Markdown files.\n- Desktop, mobile and web can share the same frontend/runtime contract.\n"
  )
}

fn ensure_json_file(path: &Path, value: Value) -> Result<(), String> {
  if path.exists() {
    return Ok(());
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("failed to create metadata directory: {error}"))?;
  }
  let raw = serde_json::to_string_pretty(&value).map_err(|error| format!("failed to serialize metadata: {error}"))?;
  fs::write(path, raw).map_err(|error| format!("failed to write metadata file: {error}"))
}

fn initialize_vault(vault_root: &str) -> Result<Workspace, String> {
  let root = PathBuf::from(vault_root);
  let meta_dir = root.join(WORKSPACE_DIR);
  let getting_started_dir = root.join("Getting Started");
  fs::create_dir_all(&meta_dir).map_err(|error| format!("failed to create vault metadata directory: {error}"))?;
  fs::create_dir_all(&getting_started_dir).map_err(|error| format!("failed to create getting started directory: {error}"))?;

  let workspace_path = workspace_path(vault_root, WORKSPACE_FILE);
  if !workspace_path.exists() {
    write_workspace(vault_root, &create_workspace(vault_root))?;
  }

  ensure_json_file(&root.join(WORKSPACE_DIR).join(INDEX_FILE), json!({ "version": 1, "updatedAt": now_string(), "entries": [] }))?;
  ensure_json_file(&root.join(WORKSPACE_DIR).join(CALENDAR_FILE), json!({ "version": 1, "updatedAt": now_string(), "events": [] }))?;
  ensure_json_file(&root.join(WORKSPACE_DIR).join(SOURCES_FILE), json!({ "version": 1, "updatedAt": now_string(), "sources": [] }))?;
  ensure_json_file(&root.join(WORKSPACE_DIR).join(WIKI_FILE), json!({ "version": 1, "updatedAt": now_string(), "records": [] }))?;

  let welcome_path = getting_started_dir.join("Welcome.md");
  if !welcome_path.exists() {
    fs::write(&welcome_path, create_welcome_markdown()).map_err(|error| format!("failed to write welcome note: {error}"))?;
  }

  read_workspace(vault_root)
}

fn read_workspace(vault_root: &str) -> Result<Workspace, String> {
  let path = workspace_path(vault_root, WORKSPACE_FILE);
  if !path.exists() {
    return Ok(create_workspace(vault_root));
  }
  let raw = fs::read_to_string(&path).map_err(|error| format!("failed to read workspace: {error}"))?;
  serde_json::from_str(&raw).or_else(|_| Ok(create_workspace(vault_root)))
}

fn write_workspace(vault_root: &str, workspace: &Workspace) -> Result<(), String> {
  let path = workspace_path(vault_root, WORKSPACE_FILE);
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("failed to create workspace directory: {error}"))?;
  }
  let raw = serde_json::to_string_pretty(workspace).map_err(|error| format!("failed to serialize workspace: {error}"))?;
  fs::write(&path, raw).map_err(|error| format!("failed to write workspace: {error}"))
}

fn read_json_or(path: &Path, fallback: Value) -> Value {
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or(fallback)
}

fn parse_tags(raw: &str) -> Vec<String> {
  raw.trim()
    .trim_start_matches('[')
    .trim_end_matches(']')
    .split(',')
    .map(|item| item.trim().trim_matches('"').trim_matches('\'').trim_start_matches('#').to_string())
    .filter(|item| !item.is_empty())
    .collect()
}

fn parse_markdown_meta(markdown: &str, fallback_name: &str) -> (String, String, Vec<String>, String, String, String, String) {
  let mut title = String::new();
  let mut note_type = "note".to_string();
  let mut tags = Vec::new();
  let mut created_at = String::new();
  let mut updated_at = String::new();

  if let Some(rest) = markdown.strip_prefix("---") {
    if let Some(end) = rest.find("\n---") {
      let frontmatter = &rest[..end];
      for line in frontmatter.lines() {
        if let Some((key, value)) = line.split_once(':') {
          let key = key.trim();
          let value = value.trim().trim_matches('"').to_string();
          match key {
            "title" => title = value,
            "type" => note_type = value,
            "tags" => tags = parse_tags(line.split_once(':').map(|(_, raw)| raw).unwrap_or("")),
            "createdAt" => created_at = value,
            "updatedAt" => updated_at = value,
            _ => {}
          }
        }
      }
    }
  }

  let body = if markdown.starts_with("---") {
    markdown.splitn(3, "---").nth(2).unwrap_or(markdown)
  } else {
    markdown
  };

  if title.is_empty() {
    title = body
      .lines()
      .find_map(|line| line.strip_prefix("# ").map(|value| value.trim().to_string()))
      .unwrap_or_else(|| strip_markdown_extension(fallback_name));
  }

  let excerpt = body
    .lines()
    .map(|line| line.trim().trim_start_matches('#').trim().to_string())
    .filter(|line| !line.is_empty())
    .take(3)
    .collect::<Vec<_>>()
    .join(" ");

  let cover_image = body
    .split("![](")
    .nth(1)
    .and_then(|rest| rest.split(')').next())
    .unwrap_or("")
    .to_string();

  (title, note_type, tags, created_at, updated_at, excerpt, cover_image)
}

fn is_ignored_vault_entry(name: &str) -> bool {
  name == WORKSPACE_DIR || name == ".git" || name == "node_modules" || name.starts_with('.') || name.ends_with('~') || name.ends_with(".tmp")
}

fn list_directory_for_vault(vault: &Vault, relative_path: &str) -> Result<Vec<VaultEntry>, String> {
  let directory = resolve_inside_vault(&vault.path, relative_path)?;
  let dirents = fs::read_dir(&directory).map_err(|error| format!("failed to read directory: {error}"))?;
  let mut entries = Vec::new();

  for dirent in dirents {
    let dirent = dirent.map_err(|error| format!("failed to read directory entry: {error}"))?;
    let name = dirent.file_name().to_string_lossy().to_string();
    if is_ignored_vault_entry(&name) {
      continue;
    }
    let full_path = dirent.path();
    let child_relative = normalize_relative_path(&format!("{}/{}", relative_path, name));
    let metadata = fs::metadata(&full_path).map_err(|error| format!("failed to stat entry: {error}"))?;

    if metadata.is_dir() {
      let note_count = fs::read_dir(&full_path)
        .ok()
        .map(|children| {
          children
            .filter_map(Result::ok)
            .filter(|child| child.file_name().to_string_lossy().to_lowercase().ends_with(".md"))
            .count()
        })
        .unwrap_or(0);
      entries.push(VaultEntry {
        kind: "folder".to_string(),
        title: name.clone(),
        path: child_relative,
        filename: None,
        note_count: Some(note_count),
        updated_at: modified_string(&full_path),
        note_type: "folder".to_string(),
        tags: Vec::new(),
        created_at: String::new(),
        excerpt: String::new(),
        cover_image: String::new(),
      });
    } else if metadata.is_file() && name.to_lowercase().ends_with(".md") {
      let markdown = fs::read_to_string(&full_path).unwrap_or_default();
      let (title, note_type, tags, created_at, updated_at, excerpt, cover_image) = parse_markdown_meta(&markdown, &name);
      entries.push(VaultEntry {
        kind: "note".to_string(),
        title,
        path: child_relative,
        filename: Some(name),
        note_count: None,
        updated_at: if updated_at.is_empty() { modified_string(&full_path) } else { updated_at },
        note_type,
        tags,
        created_at,
        excerpt,
        cover_image,
      });
    }
  }

  entries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
  Ok(entries)
}

fn load_vault_payload(app: &AppHandle, vault: Option<Vault>) -> Result<VaultPayload, String> {
  let config = read_config(app)?;
  if let Some(vault) = vault {
    let workspace = initialize_vault(&vault.path)?;
    let entries = list_directory_for_vault(&vault, "")?;
    Ok(VaultPayload {
      vaults: config.vaults,
      active_vault_id: config.active_vault_id,
      active_vault: Some(vault),
      workspace: Some(workspace),
      entries,
    })
  } else {
    Ok(VaultPayload {
      vaults: config.vaults,
      active_vault_id: config.active_vault_id,
      active_vault: None,
      workspace: None,
      entries: Vec::new(),
    })
  }
}

fn upsert_vault(app: &AppHandle, vault_path: String) -> Result<Vault, String> {
  let absolute = normalize_slashes(&PathBuf::from(vault_path).to_string_lossy());
  let mut config = read_config(app)?;
  if let Some(index) = config.vaults.iter().position(|vault| vault.path == absolute) {
    config.vaults[index].last_opened_at = now_string();
    config.active_vault_id = Some(config.vaults[index].id.clone());
    let vault = config.vaults[index].clone();
    write_config(app, &config)?;
    return Ok(vault);
  }

  let vault_name = basename(Path::new(&absolute));
  let mut id = create_id(&vault_name);
  let base_id = id.clone();
  let mut suffix = 2;
  while config.vaults.iter().any(|vault| vault.id == id) {
    id = format!("{base_id}-{suffix}");
    suffix += 1;
  }
  let vault = Vault {
    id: id.clone(),
    name: vault_name,
    path: absolute,
    icon: String::new(),
    last_opened_at: now_string(),
  };
  config.vaults.push(vault.clone());
  config.active_vault_id = Some(id);
  write_config(app, &config)?;
  Ok(vault)
}

fn next_available_name(directory: &Path, base_name: &str) -> String {
  let target = directory.join(base_name);
  if !target.exists() {
    return base_name.to_string();
  }
  let extension = Path::new(base_name)
    .extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| format!(".{ext}"))
    .unwrap_or_default();
  let stem = base_name.strip_suffix(&extension).unwrap_or(base_name);
  let mut index = 2;
  loop {
    let candidate = format!("{stem} {index}{extension}");
    if !directory.join(&candidate).exists() {
      return candidate;
    }
    index += 1;
  }
}

fn active_or_error(app: &AppHandle) -> Result<Vault, String> {
  let config = read_config(app)?;
  active_vault(&config).ok_or_else(|| "No active ElephantNote vault.".to_string())
}

fn list_markdown_recursive(root: &Path, current: &Path, notes: &mut Vec<(String, PathBuf, String)>) -> Result<(), String> {
  for entry in fs::read_dir(current).map_err(|error| format!("failed to scan vault: {error}"))? {
    let entry = entry.map_err(|error| format!("failed to read vault entry: {error}"))?;
    let name = entry.file_name().to_string_lossy().to_string();
    if is_ignored_vault_entry(&name) {
      continue;
    }
    let path = entry.path();
    let metadata = fs::metadata(&path).map_err(|error| format!("failed to stat vault entry: {error}"))?;
    if metadata.is_dir() {
      list_markdown_recursive(root, &path, notes)?;
    } else if metadata.is_file() && name.to_lowercase().ends_with(".md") {
      let relative = path.strip_prefix(root).unwrap_or(&path).to_string_lossy().replace('\\', "/");
      let markdown = fs::read_to_string(&path).unwrap_or_default();
      notes.push((relative, path, markdown));
    }
  }
  Ok(())
}

#[tauri::command]
pub fn tauri_vaults_get(app: AppHandle) -> Result<VaultPayload, String> {
  let config = read_config(&app)?;
  load_vault_payload(&app, active_vault(&config))
}

#[tauri::command]
pub fn tauri_vaults_select_path(app: AppHandle, vault_path: String) -> Result<VaultPayload, String> {
  let vault = upsert_vault(&app, vault_path)?;
  load_vault_payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_vaults_set_active(app: AppHandle, vault_id: String) -> Result<VaultPayload, String> {
  let mut config = read_config(&app)?;
  config.active_vault_id = Some(vault_id);
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  load_vault_payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_set_icon(app: AppHandle, vault_id: String, icon: String) -> Result<VaultPayload, String> {
  let mut config = read_config(&app)?;
  for vault in &mut config.vaults {
    if vault.id == vault_id {
      vault.icon = icon.clone();
    }
  }
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  load_vault_payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_set_name(app: AppHandle, vault_id: String, name: String) -> Result<VaultPayload, String> {
  let mut config = read_config(&app)?;
  let trimmed = name.trim().to_string();
  if trimmed.is_empty() {
    return Err("Vault name cannot be empty.".to_string());
  }
  for vault in &mut config.vaults {
    if vault.id == vault_id {
      vault.name = trimmed.clone();
    }
  }
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  load_vault_payload(&app, vault)
}

#[tauri::command]
pub fn tauri_vaults_remove(app: AppHandle, vault_id: String) -> Result<VaultPayload, String> {
  let mut config = read_config(&app)?;
  config.vaults.retain(|vault| vault.id != vault_id);
  if config.active_vault_id.as_deref() == Some(&vault_id) {
    config.active_vault_id = config.vaults.first().map(|vault| vault.id.clone());
  }
  let vault = active_vault(&config);
  write_config(&app, &config)?;
  load_vault_payload(&app, vault)
}

#[tauri::command]
pub fn tauri_directory_list(app: AppHandle, relative_path: Option<String>) -> Result<Vec<VaultEntry>, String> {
  let vault = active_or_error(&app)?;
  list_directory_for_vault(&vault, relative_path.as_deref().unwrap_or(""))
}

#[tauri::command]
pub fn tauri_notes_create(app: AppHandle, relative_path: Option<String>, filename: Option<String>, title: Option<String>) -> Result<NoteCreateResult, String> {
  let vault = active_or_error(&app)?;
  let relative_path = relative_path.unwrap_or_default();
  let directory = resolve_inside_vault(&vault.path, &relative_path)?;
  fs::create_dir_all(&directory).map_err(|error| format!("failed to create note directory: {error}"))?;
  let final_name = filename
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| next_available_name(&directory, "Untitled.md"));
  let full_path = directory.join(&final_name);
  let note_title = title
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| strip_markdown_extension(&final_name));
  if !full_path.exists() {
    let now = now_string();
    let markdown = format!(
      "---\ntitle: \"{}\"\ntype: \"note\"\ntags: []\ncreatedAt: \"{}\"\nupdatedAt: \"{}\"\n---\n\n# {}\n",
      note_title.replace('"', "\\\""),
      now,
      now,
      note_title
    );
    fs::write(&full_path, markdown).map_err(|error| format!("failed to write note: {error}"))?;
  }
  let note_relative = normalize_relative_path(&format!("{}/{}", relative_path, final_name));
  Ok(NoteCreateResult {
    note: json!({ "path": note_relative, "fullPath": full_path.to_string_lossy(), "title": note_title }),
    entries: list_directory_for_vault(&vault, &relative_path)?,
  })
}

#[tauri::command]
pub fn tauri_folders_create(app: AppHandle, relative_path: Option<String>) -> Result<FolderCreateResult, String> {
  let vault = active_or_error(&app)?;
  let relative_path = relative_path.unwrap_or_default();
  let directory = resolve_inside_vault(&vault.path, &relative_path)?;
  fs::create_dir_all(&directory).map_err(|error| format!("failed to create parent directory: {error}"))?;
  let folder_name = next_available_name(&directory, "New Folder");
  let full_path = directory.join(&folder_name);
  fs::create_dir_all(&full_path).map_err(|error| format!("failed to create folder: {error}"))?;
  let folder_relative = normalize_relative_path(&format!("{}/{}", relative_path, folder_name));
  Ok(FolderCreateResult {
    folder: json!({ "path": folder_relative, "fullPath": full_path.to_string_lossy() }),
    entries: list_directory_for_vault(&vault, &relative_path)?,
  })
}

#[tauri::command]
pub fn tauri_sidebar_attach(app: AppHandle, relative_path: String, title: Option<String>, entry_type: Option<String>) -> Result<Value, String> {
  let vault = active_or_error(&app)?;
  let normalized = normalize_relative_path(&relative_path);
  let mut workspace = read_workspace(&vault.path)?;
  workspace.sidebar.retain(|entry| entry.path != normalized);
  workspace.sidebar.push(SidebarEntry {
    id: create_id(&format!("{}-{}", entry_type.clone().unwrap_or_else(|| "entry".to_string()), normalized)),
    title: title.unwrap_or_else(|| strip_markdown_extension(&basename(Path::new(&normalized)))),
    entry_type: entry_type.unwrap_or_else(|| if normalized.to_lowercase().ends_with(".md") { "note".to_string() } else { "folder".to_string() }),
    path: normalized.clone(),
    collapsed: false,
  });
  write_workspace(&vault.path, &workspace)?;
  Ok(json!({ "workspace": workspace, "entries": list_directory_for_vault(&vault, "")? }))
}

#[tauri::command]
pub fn tauri_sidebar_detach(app: AppHandle, relative_path: String) -> Result<Value, String> {
  let vault = active_or_error(&app)?;
  let normalized = normalize_relative_path(&relative_path);
  let mut workspace = read_workspace(&vault.path)?;
  workspace.sidebar.retain(|entry| entry.path != normalized);
  write_workspace(&vault.path, &workspace)?;
  Ok(json!({ "workspace": workspace, "entries": list_directory_for_vault(&vault, "")? }))
}

#[tauri::command]
pub fn tauri_entries_rename(app: AppHandle, relative_path: String, title: String) -> Result<VaultPayload, String> {
  let vault = active_or_error(&app)?;
  let normalized = normalize_relative_path(&relative_path);
  let source = resolve_inside_vault(&vault.path, &normalized)?;
  let parent = source.parent().ok_or_else(|| "Cannot rename vault root.".to_string())?;
  let safe_title = title.trim().replace(['/', '\\'], "-");
  if safe_title.is_empty() {
    return Err("A non-empty title is required.".to_string());
  }
  let extension = if source.is_file() && source.extension().is_some() && Path::new(&safe_title).extension().is_none() {
    source.extension().and_then(|ext| ext.to_str()).map(|ext| format!(".{ext}")).unwrap_or_default()
  } else {
    String::new()
  };
  let target = parent.join(format!("{safe_title}{extension}"));
  fs::rename(&source, &target).map_err(|error| format!("failed to rename entry: {error}"))?;
  load_vault_payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_entries_move(app: AppHandle, relative_path: String, target_directory_path: Option<String>) -> Result<VaultPayload, String> {
  let vault = active_or_error(&app)?;
  let source = resolve_inside_vault(&vault.path, &relative_path)?;
  let target_dir = resolve_inside_vault(&vault.path, target_directory_path.as_deref().unwrap_or(""))?;
  fs::create_dir_all(&target_dir).map_err(|error| format!("failed to create target directory: {error}"))?;
  let name = source.file_name().ok_or_else(|| "Invalid source path.".to_string())?;
  let target = target_dir.join(name);
  fs::rename(&source, &target).map_err(|error| format!("failed to move entry: {error}"))?;
  load_vault_payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_entries_delete(app: AppHandle, relative_path: String) -> Result<VaultPayload, String> {
  let vault = active_or_error(&app)?;
  let target = resolve_inside_vault(&vault.path, &relative_path)?;
  if target.is_dir() {
    fs::remove_dir_all(&target).map_err(|error| format!("failed to delete folder: {error}"))?;
  } else if target.is_file() {
    fs::remove_file(&target).map_err(|error| format!("failed to delete file: {error}"))?;
  }
  load_vault_payload(&app, Some(vault))
}

#[tauri::command]
pub fn tauri_calendar_list(app: AppHandle) -> Result<Vec<Value>, String> {
  let vault = active_or_error(&app)?;
  let data = read_json_or(&workspace_path(&vault.path, CALENDAR_FILE), json!({ "events": [] }));
  Ok(data.get("events").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_sources_list(app: AppHandle) -> Result<Vec<Value>, String> {
  let vault = active_or_error(&app)?;
  let data = read_json_or(&workspace_path(&vault.path, SOURCES_FILE), json!({ "sources": [] }));
  Ok(data.get("sources").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_wiki_list(app: AppHandle) -> Result<Vec<Value>, String> {
  let vault = active_or_error(&app)?;
  let data = read_json_or(&workspace_path(&vault.path, WIKI_FILE), json!({ "records": [] }));
  Ok(data.get("records").and_then(Value::as_array).cloned().unwrap_or_default())
}

#[tauri::command]
pub fn tauri_search_query(app: AppHandle, params: Option<Value>) -> Result<Value, String> {
  let vault = active_or_error(&app)?;
  let query = params
    .and_then(|value| value.get("query").or_else(|| value.get("q")).and_then(Value::as_str).map(str::to_string))
    .unwrap_or_default()
    .to_lowercase();
  if query.trim().is_empty() {
    return Ok(json!({ "results": [] }));
  }

  let root = PathBuf::from(&vault.path);
  let mut notes = Vec::new();
  list_markdown_recursive(&root, &root, &mut notes)?;
  let mut results = Vec::new();
  for (relative, path, markdown) in notes {
    let haystack = markdown.to_lowercase();
    if !haystack.contains(&query) && !relative.to_lowercase().contains(&query) {
      continue;
    }
    let (title, _, tags, _, _, excerpt, _) = parse_markdown_meta(&markdown, &relative);
    results.push(json!({
      "path": relative,
      "fullPath": path.to_string_lossy(),
      "title": title,
      "tags": tags,
      "excerpt": excerpt,
      "score": 1
    }));
  }
  Ok(json!({ "results": results }))
}

#[tauri::command]
pub fn tauri_search_status(app: AppHandle) -> Result<Value, String> {
  let vault = active_vault(&read_config(&app)?);
  Ok(json!({ "enabled": true, "runtime": "tauri-rust", "vaultPath": vault.map(|item| item.path) }))
}

#[tauri::command]
pub fn tauri_sync_status(app: AppHandle) -> Result<Value, String> {
  let vault = active_vault(&read_config(&app)?);
  Ok(json!({
    "runtime": "tauri-rust",
    "activeVault": vault,
    "queued": 0,
    "running": false,
    "lastRunAt": null
  }))
}

#[tauri::command]
pub fn tauri_sync_enqueue(operation: String, payload: Option<Value>) -> Result<Value, String> {
  Ok(json!({ "queued": false, "operation": operation, "payload": payload, "reason": "queue-not-enabled-yet" }))
}

#[tauri::command]
pub fn tauri_sync_run(app: AppHandle, payload_by_operation: Option<Value>) -> Result<Value, String> {
  let vault = active_vault(&read_config(&app)?);
  Ok(json!({ "ok": true, "runtime": "tauri-rust", "activeVault": vault, "payload": payload_by_operation }))
}

mod vault_backend;

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[derive(Serialize)]
struct ShellExecResult {
  success: bool,
  stdout: String,
  stderr: String,
  status: Option<i32>,
}

#[tauri::command]
fn healthcheck() -> &'static str {
  "ok"
}

#[tauri::command]
fn tauri_debug_log(level: String, message: String, details: Option<Value>) -> Result<(), String> {
  let normalized_level = match level.as_str() {
    "error" | "warn" | "info" | "debug" | "trace" => level.as_str(),
    _ => "info",
  };
  match details {
    Some(value) => eprintln!("[tauri:{normalized_level}] {message} {value}"),
    None => eprintln!("[tauri:{normalized_level}] {message}"),
  }
  Ok(())
}

#[derive(Serialize)]
struct MarkTextWriteResult {
  ok: bool,
  pathname: String,
  bytes: usize,
}

#[tauri::command]
fn tauri_marktext_write_file(pathname: String, content: String) -> Result<MarkTextWriteResult, String> {
  let trimmed = pathname.trim();
  if trimmed.is_empty() {
    return Err("tauri_marktext_write_file requires a pathname.".to_string());
  }

  let path = PathBuf::from(trimmed);
  if path.is_dir() {
    return Err(format!("Cannot write markdown content to a directory: {}", path.to_string_lossy()));
  }
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| format!("Unable to create parent directory {}: {error}", parent.to_string_lossy()))?;
  }

  let bytes = content.as_bytes().len();
  fs::write(&path, content).map_err(|error| format!("Unable to write {}: {error}", path.to_string_lossy()))?;
  eprintln!("[tauri:info] marktext_write_file:done path={} bytes={}", path.to_string_lossy(), bytes);
  Ok(MarkTextWriteResult {
    ok: true,
    pathname: path.to_string_lossy().to_string(),
    bytes,
  })
}

fn allowed_shell_command(command: &str) -> bool {
  if command.contains('/') || command.contains('\\') {
    return false;
  }

  let mut allowed = vec!["pandoc".to_string()];
  if let Ok(extra) = std::env::var("ELEPHANTNOTE_TAURI_ALLOWED_COMMANDS") {
    allowed.extend(
      extra
        .split(',')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty() && !item.contains('/') && !item.contains('\\')),
    );
  }

  allowed.iter().any(|item| item == command)
}

#[tauri::command]
fn shell_exec(
  command: String,
  args: Vec<String>,
  cwd: Option<String>,
  env: Option<HashMap<String, String>>,
) -> Result<ShellExecResult, String> {
  if !allowed_shell_command(&command) {
    return Err(format!(
      "shell_exec blocked `{command}`. Add it to ELEPHANTNOTE_TAURI_ALLOWED_COMMANDS only for trusted desktop development."
    ));
  }

  let mut process = Command::new(&command);
  process.args(args);

  if let Some(cwd) = cwd {
    process.current_dir(cwd);
  }

  if let Some(env) = env {
    let filtered = env
      .into_iter()
      .filter(|(key, _)| matches!(key.as_str(), "PATH" | "HOME" | "TMPDIR" | "TEMP" | "TMP"));
    process.envs(filtered);
  }

  let output = process
    .output()
    .map_err(|error| format!("failed to execute `{command}`: {error}"))?;

  Ok(ShellExecResult {
    success: output.status.success(),
    stdout: String::from_utf8_lossy(&output.stdout).to_string(),
    stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    status: output.status.code(),
  })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let builder = tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init());

  #[cfg(not(mobile))]
  let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

  builder
    .invoke_handler(tauri::generate_handler![
      healthcheck,
      tauri_debug_log,
      tauri_marktext_write_file,
      shell_exec,
      vault_backend::tauri_vaults_get,
      vault_backend::tauri_vaults_select_path,
      vault_backend::tauri_vaults_set_active,
      vault_backend::tauri_vaults_set_icon,
      vault_backend::tauri_vaults_set_name,
      vault_backend::tauri_vaults_remove,
      vault_backend::tauri_directory_list,
      vault_backend::tauri_notes_create,
      vault_backend::tauri_notes_read,
      vault_backend::tauri_notes_write,
      vault_backend::tauri_folders_create,
      vault_backend::tauri_sidebar_attach,
      vault_backend::tauri_sidebar_detach,
      vault_backend::tauri_entries_rename,
      vault_backend::tauri_entries_move,
      vault_backend::tauri_entries_delete,
      vault_backend::tauri_calendar_list,
      vault_backend::tauri_sources_list,
      vault_backend::tauri_wiki_list,
      vault_backend::tauri_search_query,
      vault_backend::tauri_search_status,
      vault_backend::tauri_search_rebuild,
      vault_backend::tauri_search_inspect,
      vault_backend::tauri_features_get,
      vault_backend::tauri_features_set,
      vault_backend::tauri_ai_config_get,
      vault_backend::tauri_ai_config_set,
      vault_backend::tauri_ai_config_test,
      vault_backend::tauri_models_get_selection,
      vault_backend::tauri_models_set_selection,
      vault_backend::tauri_sync_status,
      vault_backend::tauri_sync_plan,
      vault_backend::tauri_sync_enqueue,
      vault_backend::tauri_sync_run
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Tauri application");
}

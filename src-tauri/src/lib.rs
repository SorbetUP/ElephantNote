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

fn escape_html(value: &str) -> String {
  value
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
}

fn fallback_markdown_text(markdown: &str) -> String {
  markdown
    .lines()
    .map(|line| line.trim().trim_start_matches('#').trim_start_matches(['-', '*', ' ']).trim())
    .filter(|line| !line.is_empty() && *line != "---")
    .collect::<Vec<_>>()
    .join("\n")
}

fn fallback_markdown_html(markdown: &str) -> String {
  let mut html = String::new();
  for line in markdown.lines() {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed == "---" { continue; }
    if let Some(title) = trimmed.strip_prefix("# ") {
      html.push_str(&format!("<h1>{}</h1>", escape_html(title.trim())));
    } else if let Some(title) = trimmed.strip_prefix("## ") {
      html.push_str(&format!("<h2>{}</h2>", escape_html(title.trim())));
    } else {
      html.push_str(&format!("<p>{}</p>", escape_html(trimmed)));
    }
  }
  html
}

#[tauri::command]
fn tauri_markdown_parse(markdown: Option<String>) -> Result<Value, String> {
  let markdown = markdown.unwrap_or_default();
  Ok(json!({ "markdown": markdown, "html": fallback_markdown_html(&markdown), "text": fallback_markdown_text(&markdown), "tokens": [] }))
}

#[tauri::command]
fn tauri_markdown_render_html(markdown: Option<String>) -> Result<String, String> {
  Ok(fallback_markdown_html(&markdown.unwrap_or_default()))
}

#[tauri::command]
fn tauri_markdown_to_text(markdown: Option<String>) -> Result<String, String> {
  Ok(fallback_markdown_text(&markdown.unwrap_or_default()))
}

#[tauri::command]
fn tauri_markdown_extract_frontmatter(markdown: Option<String>) -> Result<Value, String> {
  let markdown = markdown.unwrap_or_default();
  let mut title = String::new();
  let mut tags = Vec::<String>::new();
  if let Some(rest) = markdown.strip_prefix("---") {
    if let Some(end) = rest.find("\n---") {
      for line in rest[..end].lines() {
        if let Some((key, value)) = line.split_once(':') {
          let key = key.trim();
          let value = value.trim();
          if key == "title" { title = value.trim_matches('"').to_string(); }
          if key == "tags" {
            tags = value.trim_matches(&['[', ']'][..]).split(',').map(|tag| tag.trim().trim_matches('"').trim_start_matches('#').to_string()).filter(|tag| !tag.is_empty()).collect();
          }
        }
      }
    }
  }
  Ok(json!({ "title": title, "tags": tags }))
}

#[tauri::command]
fn tauri_markdown_extract_links(markdown: Option<String>) -> Result<Vec<Value>, String> {
  let markdown = markdown.unwrap_or_default();
  let mut links = Vec::new();
  for token in markdown.split_whitespace() {
    if token.starts_with("http://") || token.starts_with("https://") {
      links.push(json!({ "href": token.trim_matches(|c| matches!(c, ')' | ']' | ',' | '.')), "title": "" }));
    }
  }
  Ok(links)
}

#[tauri::command]
fn tauri_muya_parse(markdown: Option<String>) -> Result<Value, String> { tauri_markdown_parse(markdown) }
#[tauri::command]
fn tauri_muya_render_html(markdown: Option<String>) -> Result<String, String> { tauri_markdown_render_html(markdown) }
#[tauri::command]
fn tauri_muya_tokens(markdown: Option<String>) -> Result<Vec<Value>, String> { Ok(vec![json!({ "type": "text", "raw": markdown.unwrap_or_default() })]) }
#[tauri::command]
fn tauri_muya_extras(markdown: Option<String>) -> Result<Value, String> { Ok(json!({ "text": fallback_markdown_text(&markdown.unwrap_or_default()) })) }
#[tauri::command]
fn tauri_muya_contract() -> Result<Value, String> { Ok(json!({ "runtime": "tauri-rust", "fallback": true })) }
#[tauri::command]
fn tauri_muya_clipboard() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_copy_markdown() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_copy_html() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_paste() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_backspace() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_remove_next() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_undo() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_redo() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_move_cursor() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_input_rule() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_table_insert_row() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_table_insert_column() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_table_contract() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_image_selection() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_start_composition() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_update_composition() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_commit_composition() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_cancel_composition() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust" })) }
#[tauri::command]
fn tauri_muya_editor_snapshot() -> Result<Value, String> { Ok(json!({ "ok": true, "runtime": "tauri-rust", "snapshot": null })) }

#[tauri::command]
fn tauri_attachments_list() -> Result<Vec<Value>, String> { Ok(Vec::new()) }
#[tauri::command]
fn tauri_attachments_write_text() -> Result<Value, String> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Attachment write fallback is not implemented yet." })) }
#[tauri::command]
fn tauri_drawings_list() -> Result<Vec<Value>, String> { Ok(Vec::new()) }
#[tauri::command]
fn tauri_drawings_create() -> Result<Value, String> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Drawing create fallback is not implemented yet." })) }
#[tauri::command]
fn tauri_drawings_read() -> Result<Value, String> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Drawing read fallback is not implemented yet." })) }
#[tauri::command]
fn tauri_drawings_write() -> Result<Value, String> { Ok(json!({ "ok": false, "runtime": "tauri-rust", "reason": "Drawing write fallback is not implemented yet." })) }

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
      tauri_markdown_parse,
      tauri_markdown_render_html,
      tauri_markdown_to_text,
      tauri_markdown_extract_frontmatter,
      tauri_markdown_extract_links,
      tauri_muya_parse,
      tauri_muya_render_html,
      tauri_muya_tokens,
      tauri_muya_extras,
      tauri_muya_contract,
      tauri_muya_clipboard,
      tauri_muya_copy_markdown,
      tauri_muya_copy_html,
      tauri_muya_paste,
      tauri_muya_backspace,
      tauri_muya_remove_next,
      tauri_muya_undo,
      tauri_muya_redo,
      tauri_muya_move_cursor,
      tauri_muya_input_rule,
      tauri_muya_table_insert_row,
      tauri_muya_table_insert_column,
      tauri_muya_table_contract,
      tauri_muya_image_selection,
      tauri_muya_start_composition,
      tauri_muya_update_composition,
      tauri_muya_commit_composition,
      tauri_muya_cancel_composition,
      tauri_muya_editor_snapshot,
      tauri_attachments_list,
      tauri_attachments_write_text,
      tauri_drawings_list,
      tauri_drawings_create,
      tauri_drawings_read,
      tauri_drawings_write,
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
      vault_backend::tauri_models_list,
      vault_backend::tauri_models_list_local,
      vault_backend::tauri_models_active,
      vault_backend::tauri_models_search_hugging_face,
      vault_backend::tauri_models_info,
      vault_backend::tauri_models_download,
      vault_backend::tauri_models_cancel_download,
      vault_backend::tauri_models_download_status,
      vault_backend::tauri_models_activate,
      vault_backend::tauri_models_deactivate,
      vault_backend::tauri_models_delete,
      vault_backend::tauri_models_refresh_index,
      vault_backend::tauri_rag_chat,
      vault_backend::tauri_sync_status,
      vault_backend::tauri_sync_plan,
      vault_backend::tauri_sync_enqueue,
      vault_backend::tauri_sync_run
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Tauri application");
}

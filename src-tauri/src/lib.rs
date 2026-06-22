use serde::Serialize;
use std::collections::HashMap;
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
fn shell_exec(
  command: String,
  args: Vec<String>,
  cwd: Option<String>,
  env: Option<HashMap<String, String>>,
) -> Result<ShellExecResult, String> {
  let mut process = Command::new(&command);
  process.args(args);
  if let Some(cwd) = cwd {
    process.current_dir(cwd);
  }
  if let Some(env) = env {
    process.envs(env);
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
    .invoke_handler(tauri::generate_handler![healthcheck, shell_exec])
    .run(tauri::generate_context!())
    .expect("failed to run Tauri application");
}

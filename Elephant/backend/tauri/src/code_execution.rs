// Keep the mature built-in runtime implementation isolated while this entrypoint
// adds user-defined interpreters without changing its internal execution logic.
#![allow(dead_code, unused_mut)]

#[path = "code_execution_v2.rs"]
mod builtin;
#[path = "code_execution_custom.rs"]
mod custom;

use serde_json::{json, Value};
use tauri::AppHandle;

pub type R<T> = Result<T, String>;

fn merge_custom_payload(app: &AppHandle, mut base: Value) -> R<Value> {
  let custom_interpreters = custom::read(app)?;
  let custom_payload = custom::payload(&custom_interpreters);
  if let Some(object) = base.as_object_mut() {
    object.insert("customEnvironments".into(), Value::Array(custom_payload));
    object.insert("interpreterTemplates".into(), custom::templates_payload());
  }
  Ok(base)
}

#[tauri::command]
pub fn tauri_programs_list_with_custom(app: AppHandle) -> R<Value> {
  let base = builtin::tauri_programs_list(app.clone())?;
  merge_custom_payload(&app, base)
}

#[tauri::command]
pub fn tauri_programs_set_with_custom(app: AppHandle, environments: Option<Value>) -> R<Value> {
  let value = environments.unwrap_or_else(|| json!({}));
  let custom_value = value
    .get("customEnvironments")
    .cloned()
    .unwrap_or_else(|| Value::Array(Vec::new()));
  custom::write(&app, custom_value)?;
  let base = builtin::tauri_programs_set(app.clone(), Some(value))?;
  merge_custom_payload(&app, base)
}

#[tauri::command]
pub async fn tauri_programs_run_with_custom(
  app: AppHandle,
  id: String,
  command: String,
  cwd: Option<String>,
  execution_id: Option<String>,
  stop: Option<bool>,
) -> R<Value> {
  let resolved_execution_id = execution_id
    .clone()
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| format!("custom-{}", id));

  if stop.unwrap_or(false) && custom::stop(&resolved_execution_id).await {
    return Ok(json!({
      "runtime": "tauri-rust-custom",
      "executionId": resolved_execution_id,
      "success": true,
      "stopped": true
    }));
  }

  if let Some(interpreter) = custom::resolve(&app, &id)? {
    let base = builtin::tauri_programs_list(app.clone())?;
    if base["executionEnabled"].as_bool() != Some(true) {
      return Err("Code execution is disabled. Enable the Code execution addon.".to_string());
    }
    let output_line_limit = base["outputLineLimit"].as_u64().unwrap_or(200) as usize;
    return custom::run(
      app,
      interpreter,
      command,
      cwd,
      resolved_execution_id,
      output_line_limit,
    )
    .await;
  }

  builtin::tauri_programs_run(app, id, command, cwd, execution_id, stop).await
}

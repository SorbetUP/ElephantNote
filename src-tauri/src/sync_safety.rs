use serde_json::{json, Value};
use tauri::AppHandle;

use crate::vault::{config, sync};

type R<T> = Result<T, String>;

fn has_explicit_operations(payload: &Value) -> bool {
  payload
    .get("operations")
    .and_then(Value::as_array)
    .is_some_and(|operations| !operations.is_empty())
}

fn has_any_git_operation(payload: &Value) -> bool {
  ["init", "pull", "snapshot", "push", "sync"].iter().any(|operation| payload.get(*operation).is_some())
}

fn reordered_payload(payload: Value) -> Value {
  if !payload.is_object() || has_explicit_operations(&payload) {
    return payload;
  }

  if payload.get("sync").is_some() || !has_any_git_operation(&payload) {
    return json!({
      "operations": ["init", "pull", "snapshot", "push"],
      "init": payload.get("init").or_else(|| payload.get("sync")).cloned().unwrap_or_else(|| json!({})),
      "pull": payload.get("pull").or_else(|| payload.get("sync")).cloned().unwrap_or_else(|| json!({})),
      "snapshot": payload.get("snapshot").or_else(|| payload.get("sync")).cloned().unwrap_or_else(|| json!({})),
      "push": payload.get("push").or_else(|| payload.get("sync")).cloned().unwrap_or_else(|| json!({}))
    });
  }

  if payload.get("pull").is_some() && payload.get("snapshot").is_some() {
    let mut next = payload.clone();
    if let Some(object) = next.as_object_mut() {
      object.insert("operations".to_string(), json!(["init", "pull", "snapshot", "push"]));
    }
    return next;
  }

  payload
}

#[tauri::command]
pub fn tauri_sync_run(app: AppHandle, payload_by_operation: Option<Value>) -> R<Value> {
  let vault = config::get_active_vault(&app)?;
  let payload = reordered_payload(payload_by_operation.unwrap_or_else(|| json!({})));
  sync::sync_run(vault, Some(payload))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn empty_sync_payload_pulls_before_snapshot() {
    let payload = reordered_payload(json!({}));
    assert_eq!(payload["operations"], json!(["init", "pull", "snapshot", "push"]));
  }

  #[test]
  fn explicit_operation_order_is_not_changed() {
    let payload = reordered_payload(json!({ "operations": ["init", "snapshot"] }));
    assert_eq!(payload["operations"], json!(["init", "snapshot"]));
  }
}

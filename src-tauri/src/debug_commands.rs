use serde_json::Value;

fn verbose_renderer_logs_enabled() -> bool {
  std::env::var("ELEPHANT_TAURI_VERBOSE_LOGS")
    .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"))
    .unwrap_or(false)
}

#[tauri::command]
pub fn tauri_debug_log(level: String, message: String, details: Option<Value>) -> bool {
  let details_text = details
    .as_ref()
    .map(|value| value.to_string())
    .unwrap_or_default();

  match level.as_str() {
    "error" => eprintln!("[renderer:error] {message} {details_text}"),
    "warn" => eprintln!("[renderer:warn] {message} {details_text}"),
    "debug" => {
      if verbose_renderer_logs_enabled() {
        println!("[renderer:debug] {message} {details_text}");
      }
    }
    _ => {
      if verbose_renderer_logs_enabled() {
        println!("[renderer:info] {message} {details_text}");
      }
    }
  }

  true
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn accepts_info_logs_when_verbose_logging_is_disabled() {
    assert!(tauri_debug_log("info".to_string(), "boot".to_string(), None));
  }

  #[test]
  fn accepts_warning_logs_without_verbose_flag() {
    assert!(tauri_debug_log("warn".to_string(), "warning".to_string(), Some(serde_json::json!({ "ok": true }))));
  }
}

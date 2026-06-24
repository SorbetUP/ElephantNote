use serde_json::Value;

fn verbose_renderer_logs_enabled() -> bool {
  std::env::var("ELEPHANT_TAURI_VERBOSE_LOGS")
    .map(|value| matches!(value.as_str(), "1" | "true" | "TRUE" | "yes" | "YES" | "on" | "ON"))
    .unwrap_or(false)
}

fn details_text(details: Option<&Value>) -> String {
  details.map(|value| value.to_string()).unwrap_or_default()
}

#[tauri::command]
pub fn tauri_debug_log(level: String, message: String, details: Option<Value>) -> bool {
  match level.as_str() {
    "error" => eprintln!("[renderer:error] {message} {}", details_text(details.as_ref())),
    "warn" => eprintln!("[renderer:warn] {message} {}", details_text(details.as_ref())),
    "debug" | "trace" => {
      if verbose_renderer_logs_enabled() {
        println!("[renderer:{level}] {message} {}", details_text(details.as_ref()));
      }
    }
    _ => {
      if verbose_renderer_logs_enabled() {
        println!("[renderer:info] {message} {}", details_text(details.as_ref()));
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

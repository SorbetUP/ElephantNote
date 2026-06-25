use serde_json::Value;

fn details_text(details: Option<&Value>) -> String {
  details.map(|value| value.to_string()).unwrap_or_default()
}

#[tauri::command]
pub fn tauri_debug_log(level: String, message: String, details: Option<Value>) -> bool {
  match level.as_str() {
    "error" => eprintln!("[renderer:error] {message} {}", details_text(details.as_ref())),
    "warn" => eprintln!("[renderer:warn] {message} {}", details_text(details.as_ref())),
    "debug" | "trace" => println!("[renderer:{level}] {message} {}", details_text(details.as_ref())),
    _ => println!("[renderer:info] {message} {}", details_text(details.as_ref())),
  }

  true
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn accepts_info_logs() {
    assert!(tauri_debug_log("info".to_string(), "boot".to_string(), None));
  }

  #[test]
  fn accepts_warning_logs() {
    assert!(tauri_debug_log("warn".to_string(), "warning".to_string(), Some(serde_json::json!({ "ok": true }))));
  }
}

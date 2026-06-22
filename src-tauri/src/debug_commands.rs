use serde_json::Value;

#[tauri::command]
pub fn tauri_debug_log(level: String, message: String, details: Option<Value>) -> bool {
  let details_text = details
    .as_ref()
    .map(|value| value.to_string())
    .unwrap_or_default();

  match level.as_str() {
    "error" => eprintln!("[renderer:error] {message} {details_text}"),
    "warn" => eprintln!("[renderer:warn] {message} {details_text}"),
    "debug" => println!("[renderer:debug] {message} {details_text}"),
    _ => println!("[renderer:info] {message} {details_text}"),
  }

  true
}

use serde_json::json;
use std::{env, fs, path::PathBuf};

fn isolated_model_dir(name: &str) -> PathBuf {
  let dir = env::temp_dir().join(format!(
    "elephantnote-tauri-models-{name}-{}",
    std::process::id()
  ));
  let _ = fs::remove_dir_all(&dir);
  fs::create_dir_all(&dir).expect("create isolated model directory");
  env::set_var("ELEPHANTNOTE_MODEL_DIR", &dir);
  dir
}

#[test]
fn tauri_model_library_lists_local_gguf_models() {
  let dir = isolated_model_dir("list");
  let model_path = dir.join("tiny.Q4_K_M.gguf");
  fs::write(&model_path, b"dummy gguf bytes").expect("write fake gguf model");

  let listing = elephantnote_tauri::model_library::tauri_models_list_local()
    .expect("list local tauri models");
  let models = listing
    .get("models")
    .and_then(|value| value.as_array())
    .expect("models array");

  assert_eq!(models.len(), 1);
  assert_eq!(models[0].get("fileName").and_then(|value| value.as_str()), Some("tiny.Q4_K_M.gguf"));
  assert_eq!(models[0].get("provider").and_then(|value| value.as_str()), Some("node-llama-cpp"));
  assert_eq!(models[0].get("modelPath").and_then(|value| value.as_str()), Some(model_path.to_string_lossy().as_ref()));
}

#[test]
fn tauri_model_library_can_activate_and_delete_local_models() {
  let dir = isolated_model_dir("activate-delete");
  let model_path = dir.join("local-model.gguf");
  fs::write(&model_path, b"dummy gguf bytes").expect("write fake gguf model");

  let activated = elephantnote_tauri::model_library::tauri_models_activate(json!({
    "modelRef": "local-model.gguf"
  }))
  .expect("activate local model");
  assert_eq!(activated.get("active").and_then(|value| value.as_bool()), Some(true));

  let active = elephantnote_tauri::model_library::tauri_models_active()
    .expect("read active model");
  assert_eq!(active.get("fileName").and_then(|value| value.as_str()), Some("local-model.gguf"));

  let deleted = elephantnote_tauri::model_library::tauri_models_delete(json!({
    "modelRef": "local-model.gguf"
  }))
  .expect("delete local model");
  assert_eq!(deleted.get("deleted").and_then(|value| value.as_bool()), Some(true));
  assert!(!model_path.exists());
}

#[test]
fn tauri_model_library_reports_idle_download_status() {
  let _dir = isolated_model_dir("download-status");

  let status = elephantnote_tauri::model_library::tauri_models_download_status(json!({
    "downloadId": "missing-download"
  }))
  .expect("read idle download status");

  assert_eq!(status.get("downloadId").and_then(|value| value.as_str()), Some("missing-download"));
  assert_eq!(status.get("phase").and_then(|value| value.as_str()), Some("idle"));
}

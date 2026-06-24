use serde_json::json;

pub mod markdown_engine;
pub mod markdown;
pub mod path_utils;
pub mod vault_layout;
pub mod vault_lib;
pub mod vault;
pub mod note_domain;
pub mod folder_domain;
pub mod media_domain;
pub mod drawing_domain;
pub mod model_domain;
pub mod model_library;
pub mod model_safety;
pub mod local_llama_runtime;
pub mod chat_runtime;
pub mod search_logic;

mod tauri_extra_commands;
mod debug_commands;

#[cfg(test)]
mod sync_contract_tests;

#[tauri::command]
fn healthcheck() -> &'static str {
  "ok"
}

#[tauri::command]
fn tauri_platform_info() -> serde_json::Value {
  json!({
    "os": std::env::consts::OS,
    "family": std::env::consts::FAMILY,
    "arch": std::env::consts::ARCH,
    "mobile": cfg!(mobile),
    "desktop": !cfg!(mobile),
    "linux": cfg!(target_os = "linux"),
    "macos": cfg!(target_os = "macos"),
    "android": cfg!(target_os = "android")
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
      tauri_platform_info,
      debug_commands::tauri_debug_log,
      vault::commands::tauri_vaults_get,
      vault::commands::tauri_vaults_select_path,
      vault::commands::tauri_vaults_set_active,
      vault::commands::tauri_vaults_set_icon,
      vault::commands::tauri_vaults_set_name,
      vault::commands::tauri_vaults_remove,
      vault::commands::tauri_directory_list,
      vault::commands::tauri_notes_create,
      vault::commands::tauri_folders_create,
      vault::commands::tauri_sidebar_attach,
      vault::commands::tauri_sidebar_detach,
      vault::commands::tauri_entries_rename,
      vault::commands::tauri_entries_move,
      vault::commands::tauri_entries_delete,
      vault::commands::tauri_calendar_list,
      vault::commands::tauri_sources_list,
      vault::commands::tauri_wiki_list,
      vault::commands::tauri_search_query,
      vault::commands::tauri_search_status,
      vault::commands::tauri_sync_status,
      vault::commands::tauri_sync_enqueue,
      vault::commands::tauri_sync_run,
      markdown::commands::tauri_markdown_parse,
      markdown::commands::tauri_markdown_render_html,
      markdown::commands::tauri_markdown_to_text,
      markdown::commands::tauri_markdown_extract_frontmatter,
      markdown::commands::tauri_markdown_extract_links,
      markdown::commands::tauri_muya_parse,
      markdown::commands::tauri_muya_render_html,
      markdown::commands::tauri_muya_tokens,
      markdown::commands::tauri_muya_extras,
      markdown::commands_contract::tauri_muya_contract,
      markdown::commands::tauri_muya_clipboard,
      markdown::commands::tauri_muya_copy_markdown,
      markdown::commands::tauri_muya_copy_html,
      markdown::commands::tauri_muya_paste,
      markdown::commands::tauri_muya_backspace,
      markdown::commands::tauri_muya_remove_next,
      markdown::commands::tauri_muya_undo,
      markdown::commands::tauri_muya_redo,
      markdown::commands::tauri_muya_move_cursor,
      markdown::commands::tauri_muya_input_rule,
      markdown::commands::tauri_muya_table_insert_row,
      markdown::commands::tauri_muya_table_insert_column,
      markdown::commands::tauri_muya_table_contract,
      markdown::commands::tauri_muya_image_selection,
      markdown::commands::tauri_muya_start_composition,
      markdown::commands::tauri_muya_update_composition,
      markdown::commands::tauri_muya_commit_composition,
      markdown::commands::tauri_muya_cancel_composition,
      markdown::commands::tauri_muya_editor_snapshot,
      tauri_extra_commands::shell_exec,
      tauri_extra_commands::tauri_notes_read,
      tauri_extra_commands::tauri_notes_write,
      tauri_extra_commands::tauri_marktext_write_file,
      tauri_extra_commands::tauri_attachments_list,
      tauri_extra_commands::tauri_attachments_write_text,
      tauri_extra_commands::tauri_drawings_list,
      tauri_extra_commands::tauri_drawings_create,
      tauri_extra_commands::tauri_drawings_read,
      tauri_extra_commands::tauri_drawings_write,
      tauri_extra_commands::tauri_models_get_selection,
      tauri_extra_commands::tauri_models_set_selection,
      tauri_extra_commands::tauri_search_inspect,
      tauri_extra_commands::tauri_ai_config_get,
      tauri_extra_commands::tauri_ai_config_set,
      tauri_extra_commands::tauri_ai_config_test,
      tauri_extra_commands::tauri_features_get,
      tauri_extra_commands::tauri_features_set,
      model_library::tauri_models_list,
      model_library::tauri_models_list_local,
      model_library::tauri_models_search_hugging_face,
      model_library::tauri_models_info,
      model_library::tauri_models_download,
      model_library::tauri_models_cancel_download,
      model_library::tauri_models_download_status,
      model_library::tauri_models_activate,
      model_library::tauri_models_deactivate,
      model_safety::tauri_models_delete,
      model_library::tauri_models_active,
      model_library::tauri_models_refresh_index,
      chat_runtime::tauri_rag_chat,
      tauri_extra_commands::tauri_search_rebuild,
      tauri_extra_commands::tauri_sync_plan
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Tauri application");
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn platform_info_contains_target_flags() {
    let info = tauri_platform_info();
    assert!(info.get("os").and_then(|value| value.as_str()).is_some());
    assert!(info.get("arch").and_then(|value| value.as_str()).is_some());
    assert_eq!(info.get("desktop").and_then(|value| value.as_bool()), Some(!cfg!(mobile)));
  }
}

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
pub mod search_logic;

mod tauri_extra_commands;

#[tauri::command]
fn healthcheck() -> &'static str {
  "ok"
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
      tauri_extra_commands::tauri_notes_read,
      tauri_extra_commands::tauri_notes_write,
      tauri_extra_commands::tauri_attachments_list,
      tauri_extra_commands::tauri_attachments_write_text,
      tauri_extra_commands::tauri_drawings_list,
      tauri_extra_commands::tauri_drawings_create,
      tauri_extra_commands::tauri_drawings_read,
      tauri_extra_commands::tauri_drawings_write,
      tauri_extra_commands::tauri_models_get_selection,
      tauri_extra_commands::tauri_models_set_selection,
      tauri_extra_commands::tauri_search_rebuild,
      tauri_extra_commands::tauri_sync_plan
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Tauri application");
}

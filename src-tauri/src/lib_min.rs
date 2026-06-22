mod vault_min;

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
      vault_min::tauri_vaults_get,
      vault_min::tauri_vaults_select_path,
      vault_min::tauri_vaults_set_active,
      vault_min::tauri_vaults_set_icon,
      vault_min::tauri_vaults_set_name,
      vault_min::tauri_vaults_remove,
      vault_min::tauri_directory_list,
      vault_min::tauri_notes_create,
      vault_min::tauri_folders_create,
      vault_min::tauri_sidebar_attach,
      vault_min::tauri_sidebar_detach,
      vault_min::tauri_entries_rename,
      vault_min::tauri_entries_move,
      vault_min::tauri_entries_delete,
      vault_min::tauri_calendar_list,
      vault_min::tauri_sources_list,
      vault_min::tauri_wiki_list,
      vault_min::tauri_search_query,
      vault_min::tauri_search_status,
      vault_min::tauri_sync_status,
      vault_min::tauri_sync_enqueue,
      vault_min::tauri_sync_run
    ])
    .run(tauri::generate_context!())
    .expect("failed to run Tauri application");
}

use serde_json::json;
#[cfg(not(mobile))]
use std::path::{Path, PathBuf};
#[allow(unused_imports)]
use tauri::Manager;

pub mod chat_runtime;
pub mod code_execution;
pub mod drawing_domain;
pub mod folder_domain;
#[cfg(not(mobile))]
pub mod local_llama_runtime;
pub mod markdown;
pub mod markdown_engine;
pub mod media_domain;
pub mod model_domain;
pub mod model_library;
pub mod note_domain;
pub mod path_utils;
pub mod search_logic;
pub mod vault;
pub mod vault_layout;

mod debug_commands;
mod sync_commands;
mod tauri_extra_commands;

pub mod atomic_features;
pub mod buffer_store;
pub mod data_center;
pub mod embeddings;
pub mod filesystem;
pub mod fts;
pub mod infra;
pub mod keybindings;
pub mod ocr;
pub mod ollama;
pub mod preferences;
pub mod rag_prompt;
pub mod recents;
pub mod site_preview;
pub mod state;
pub mod sync;
pub mod watcher;
pub mod wiki;

#[cfg(test)]
mod sync_contract_tests;

#[cfg(test)]
mod platform_contract_tests;

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

#[cfg(not(mobile))]
fn codex_binary_name() -> &'static str {
    if cfg!(windows) {
        "codex.exe"
    } else {
        "codex"
    }
}

#[cfg(not(mobile))]
fn bundled_codex_candidates(resource_dir: Option<&Path>, manifest_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(resource_dir) = resource_dir {
        candidates.push(resource_dir.join("bin").join(codex_binary_name()));
        candidates.push(resource_dir.join(codex_binary_name()));
    }
    candidates.push(manifest_dir.join("bin").join(codex_binary_name()));
    candidates
}

#[cfg(not(mobile))]
fn configure_bundled_codex_runtime(app: &tauri::App) {
    let resource_dir = app.path().resource_dir().ok();
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    if let Some(path) = bundled_codex_candidates(resource_dir.as_deref(), manifest_dir)
        .into_iter()
        .find(|path| path.is_file())
    {
        std::env::set_var("ELEPHANTNOTE_CODEX_PATH", &path);
        eprintln!("[Codex][bundle] ready path={}", path.display());
    } else {
        eprintln!("[Codex][bundle] missing; rebuild with pnpm tauri:codex:install");
    }
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
        .setup(|app| {
            #[cfg(not(mobile))]
            configure_bundled_codex_runtime(app);
            let handle = app.handle().clone();
            app.manage(state::AppState::new(&handle));
            app.manage(watcher::WatcherState::new());
            app.manage(sync::IrohSyncState::new());
            app.manage(markdown::muya_session::MuyaEngineSessions::default());
            let sync_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let state = sync_handle.state::<sync::IrohSyncState>();
                if let Err(error) = state.runtime(&sync_handle).await {
                    eprintln!("[ElephantNote Sync] Failed to start Iroh runtime: {error}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            healthcheck,
            tauri_platform_info,
            sync_commands::iroh_sync_create_invite,
            sync_commands::iroh_sync_accept_invite,
            sync_commands::iroh_sync_status,
            sync_commands::iroh_sync_enqueue,
            sync_commands::iroh_sync_run,
            sync_commands::iroh_sync_conflict_settings_get,
            sync_commands::iroh_sync_conflict_settings_set,
            sync_commands::iroh_sync_conflict_restore,
            sync_commands::iroh_sync_conflict_delete,
            debug_commands::tauri_debug_log,
            state::tauri_prefs_get,
            state::tauri_prefs_all,
            state::tauri_prefs_set,
            state::tauri_prefs_set_many,
            state::tauri_user_data_get,
            state::tauri_user_data_all,
            state::tauri_user_data_set,
            state::tauri_user_data_set_many,
            state::tauri_secret_set,
            state::tauri_secret_get,
            state::tauri_secret_delete,
            state::tauri_buffer_save,
            state::tauri_buffer_load,
            state::tauri_buffer_clear,
            filesystem::tauri_fs_read_markdown,
            filesystem::tauri_fs_write_markdown,
            filesystem::tauri_fs_resolve_path,
            filesystem::tauri_fs_detect_encoding,
            filesystem::tauri_fs_trash_item,
            watcher::tauri_watcher_watch_file,
            watcher::tauri_watcher_watch_directory,
            watcher::tauri_watcher_unwatch_file,
            watcher::tauri_watcher_unwatch_directory,
            watcher::tauri_watcher_unwatch_all,
            watcher::tauri_watcher_ignore_next,
            state::tauri_recents_list,
            state::tauri_recents_add,
            state::tauri_recents_clear,
            state::tauri_keybindings_get,
            state::tauri_keybindings_save,
            embeddings::tauri_embeddings_embed,
            embeddings::tauri_embeddings_store,
            embeddings::tauri_embeddings_search,
            embeddings::tauri_embeddings_count,
            embeddings::tauri_embeddings_clear_vault,
            wiki::tauri_wiki_proposals,
            rag_prompt::tauri_rag_build_prompt,
            state::tauri_atomic_features_list,
            state::tauri_atomic_features_get,
            state::tauri_atomic_features_toggle,
            state::tauri_atomic_features_set,
            ollama::tauri_ollama_status,
            ollama::tauri_ollama_list,
            ollama::tauri_ollama_generate,
            ollama::tauri_ollama_embed,
            site_preview::tauri_site_preview_open,
            site_preview::tauri_site_preview_status,
            ocr::tauri_ocr_status,
            ocr::tauri_ocr_image,
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
            markdown::commands::tauri_muya_engine_create,
            markdown::commands::tauri_muya_engine_sync_document,
            markdown::commands::tauri_muya_engine_apply,
            markdown::commands::tauri_muya_engine_apply_grouped,
            markdown::commands::tauri_muya_engine_apply_batch,
            markdown::commands::tauri_muya_engine_commit_composition,
            markdown::commands::tauri_muya_engine_apply_parity,
            markdown::commands::tauri_muya_engine_query,
            markdown::commands::tauri_muya_engine_capabilities,
            markdown::muya_clipboard_commands::tauri_muya_engine_paste_clipboard,
            markdown::muya_session::tauri_muya_session_create,
            markdown::muya_session::tauri_muya_session_sync_document,
            markdown::muya_session::tauri_muya_session_apply,
            markdown::muya_session::tauri_muya_session_apply_parity,
            markdown::muya_session::tauri_muya_session_apply_complete,
            markdown::muya_session::tauri_muya_session_paste_clipboard,
            markdown::muya_session::tauri_muya_session_commit_composition,
            markdown::muya_session::tauri_muya_session_query,
            markdown::muya_session::tauri_muya_session_close,
            code_execution::tauri_programs_list,
            code_execution::tauri_programs_set,
            code_execution::tauri_programs_run,
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
            model_library::tauri_models_delete,
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

    #[cfg(not(mobile))]
    #[test]
    fn bundled_codex_candidates_prefer_packaged_resources() {
        let resource = Path::new("/app/resources");
        let manifest = Path::new("/source/tauri");
        let candidates = bundled_codex_candidates(Some(resource), manifest);
        assert_eq!(
            candidates[0],
            resource.join("bin").join(codex_binary_name())
        );
        assert_eq!(
            candidates.last(),
            Some(&manifest.join("bin").join(codex_binary_name()))
        );
    }

    #[test]
    fn platform_info_contains_target_flags() {
        let info = tauri_platform_info();
        assert!(info.get("os").and_then(|value| value.as_str()).is_some());
        assert!(info.get("arch").and_then(|value| value.as_str()).is_some());
        assert_eq!(
            info.get("desktop").and_then(|value| value.as_bool()),
            Some(!cfg!(mobile))
        );
    }
}

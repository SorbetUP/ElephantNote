use std::path::PathBuf;
use std::sync::Arc;

use tauri::{AppHandle, Manager};

use tokio::net::TcpListener;

use crate::local_db::LocalDb;
use crate::local_runtime::config::{save_config, LocalConfig};
use crate::local_runtime::paths::RuntimePaths;
use crate::local_runtime::LocalDataState;

pub mod google_keep;
pub mod handlers_auth;
pub mod handlers_conflicts;
pub mod handlers_files;
pub mod handlers_notes;
pub mod handlers_settings;
pub mod handlers_share;
pub mod handlers_sync;
pub mod handlers_trpc;
pub mod local_user;
pub mod middleware;
pub mod router;

#[cfg(test)]
mod tests;

#[derive(Clone)]
pub struct LocalApiContext {
    pub data_state: LocalDataState,
    pub paths: RuntimePaths,
    pub token: String,
    pub device_id: String,
    pub vditor_root: Option<PathBuf>,
    pub plugin_marketplace_url: String,
}

const DEFAULT_PLUGIN_MARKETPLACE_URL: &str =
    "https://raw.githubusercontent.com/blinko-space/blinko-plugin-marketplace/main/index.json";

pub async fn start_local_api(context: Arc<LocalApiContext>) -> Result<u16, String> {
    let app = router::build_router(context.clone());
    let preferred_port = context.data_state.config_snapshot().local_api.port;
    let (listener, port) = match preferred_port {
        Some(port) => match TcpListener::bind(("127.0.0.1", port)).await {
            Ok(listener) => (listener, port),
            Err(err) => {
                eprintln!("Failed to bind preferred local API port {port}: {err}");
                let listener = TcpListener::bind("127.0.0.1:0")
                    .await
                    .map_err(|e| format!("Failed to bind local API: {e}"))?;
                let port = listener
                    .local_addr()
                    .map_err(|e| format!("Failed to read local addr: {e}"))?
                    .port();
                update_local_api_port(&context, port);
                (listener, port)
            }
        },
        None => {
            let listener = TcpListener::bind("127.0.0.1:0")
                .await
                .map_err(|e| format!("Failed to bind local API: {e}"))?;
            let port = listener
                .local_addr()
                .map_err(|e| format!("Failed to read local addr: {e}"))?
                .port();
            update_local_api_port(&context, port);
            (listener, port)
        }
    };

    tokio::spawn(async move {
        if let Err(err) = axum::serve(listener, app).await {
            eprintln!("local API server error: {err}");
        }
    });

    Ok(port)
}

fn update_local_api_port(context: &Arc<LocalApiContext>, port: u16) {
    let mut config = context.data_state.config_snapshot();
    if config.local_api.port == Some(port) {
        return;
    }
    config.local_api.port = Some(port);
    context.data_state.update_config(config.clone());
    if let Err(err) = save_config(&context.paths, &config) {
        eprintln!("Failed to save local API port: {err}");
    }
}

pub fn build_context(
    paths: RuntimePaths,
    config: &LocalConfig,
    _db: LocalDb,
    data_state: LocalDataState,
    vditor_root: Option<PathBuf>,
    plugin_marketplace_url: Option<String>,
) -> Result<Arc<LocalApiContext>, String> {
    let token = config
        .local_api
        .token
        .clone()
        .ok_or_else(|| "local_api.token missing".to_string())?;
    let device_id = config
        .device_id
        .clone()
        .ok_or_else(|| "device_id missing".to_string())?;
    Ok(Arc::new(LocalApiContext {
        data_state,
        paths,
        token,
        device_id,
        vditor_root,
        plugin_marketplace_url: plugin_marketplace_url
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| DEFAULT_PLUGIN_MARKETPLACE_URL.to_string()),
    }))
}

pub fn resolve_vditor_root(app: &AppHandle) -> Option<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.clone());
        candidates.push(resource_dir.join("server"));
        candidates.push(resource_dir.join("_up_").join("server"));
        candidates.push(resource_dir.join("_up_").join("_up_").join("server"));
    }

    let dev_server_root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../server");
    candidates.push(dev_server_root);

    candidates.into_iter().find(|candidate| {
        candidate.join("vditor").exists() && candidate.join("lute.min.js").exists()
    })
}

#[tauri::command]
pub fn get_local_api_base_url(state: tauri::State<'_, crate::local_runtime::LocalRuntimeState>) -> Option<String> {
    state
        .snapshot()
        .api_port
        .map(|port| format!("http://127.0.0.1:{port}"))
}

#[tauri::command]
pub fn get_local_api_token(state: tauri::State<'_, LocalDataState>) -> Option<String> {
    state.config_snapshot().local_api.token
}

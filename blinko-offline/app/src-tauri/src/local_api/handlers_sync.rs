use std::sync::Arc;

use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};

use super::LocalApiContext;
use crate::local_db::notes::NoteRepository;
use crate::local_db::outbox::{
    OutboxRepository, OUTBOX_STATUS_PENDING, OUTBOX_STATUS_PUSHED,
};
use crate::local_db::settings::SettingsRepository;
use crate::local_db::sync_state::SyncStateRepository;
use crate::local_runtime::config::{save_config, LocalMode, RemoteEndpoint};
use reqwest::header::{HeaderValue, AUTHORIZATION};
use reqwest::Client;
use std::time::Duration;
use tokio::net::lookup_host;

#[derive(Debug, Deserialize)]
pub struct SyncSettingsUpdate {
    // Deprecated: mode is derived from presence of endpoints (kept for backward compatibility).
    pub mode: Option<LocalMode>,
    pub remote_endpoints: Option<Vec<RemoteEndpoint>>,
    pub allow_insecure_http: Option<bool>,
    pub sync_auto: Option<bool>,
    pub sync_interval_secs: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct SyncTestRequest {
    pub remote_url: String,
    pub token: Option<String>,
    pub allow_insecure_http: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct SyncStatusEndpoint {
    pub id: String,
    pub url: String,
    pub last_pull_cursor: Option<String>,
    pub last_push_cursor: Option<String>,
    pub last_sync_at: Option<String>,
    pub status: Option<String>,
    pub outbox_pending_count: i64,
    pub outbox_pushed_count: i64,
    pub pending_attachment_uploads_count: i64,
    pub last_attachment_upload_error: Option<String>,
}

fn extract_attachment_upload_error(status: &str) -> Option<String> {
    let marker = "attachment_upload_error:";
    let idx = status.find(marker)?;
    let msg = status[(idx + marker.len())..].trim();
    if msg.is_empty() {
        None
    } else {
        Some(msg.to_string())
    }
}

pub async fn get_sync_settings(State(state): State<Arc<LocalApiContext>>) -> impl IntoResponse {
    let config = state.data_state.config_snapshot();
    (
        StatusCode::OK,
        Json(serde_json::json!({
            "mode": config.mode,
            "remote_endpoints": config.remote_endpoints,
            "allow_insecure_http": config.allow_insecure_http,
            "sync_auto": config.sync_auto,
            "sync_interval_secs": config.sync_interval_secs,
        })),
    )
}

pub async fn get_sync_status(State(state): State<Arc<LocalApiContext>>) -> impl IntoResponse {
    let config = state.data_state.config_snapshot();
    let repo = SyncStateRepository::new(state.data_state.db.pool.clone());
    let outbox = OutboxRepository::new(state.data_state.db.pool.clone());

    let outbox_pending_count = outbox
        .count_by_status(OUTBOX_STATUS_PENDING)
        .await
        .unwrap_or(0);
    let outbox_pushed_count = outbox
        .count_by_status(OUTBOX_STATUS_PUSHED)
        .await
        .unwrap_or(0);
    let pending_attachment_uploads_count = outbox
        .count_by_status_and_entity_type(OUTBOX_STATUS_PUSHED, "attachment")
        .await
        .unwrap_or(0);

    let mut endpoints: Vec<SyncStatusEndpoint> = Vec::new();
    for endpoint in config.remote_endpoints.iter() {
        let sync_state = repo.get(&endpoint.id).await.ok().flatten();
        let last_attachment_upload_error = sync_state
            .as_ref()
            .and_then(|s| s.status.as_deref())
            .and_then(extract_attachment_upload_error);
        endpoints.push(SyncStatusEndpoint {
            id: endpoint.id.clone(),
            url: endpoint.url.clone(),
            last_pull_cursor: sync_state
                .as_ref()
                .and_then(|s| s.last_pull_cursor.clone()),
            last_push_cursor: sync_state
                .as_ref()
                .and_then(|s| s.last_push_cursor.clone()),
            last_sync_at: sync_state
                .as_ref()
                .and_then(|s| s.last_sync_at.map(|dt| dt.to_rfc3339())),
            status: sync_state.as_ref().and_then(|s| s.status.clone()),
            outbox_pending_count,
            outbox_pushed_count,
            pending_attachment_uploads_count,
            last_attachment_upload_error,
        });
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "mode": config.mode,
            "endpoints": endpoints,
            "outbox_pending_count": outbox_pending_count,
            "outbox_pushed_count": outbox_pushed_count,
            "pending_attachment_uploads_count": pending_attachment_uploads_count,
        })),
    )
}

fn is_private_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local(),
        std::net::IpAddr::V6(v6) => {
            v6.is_loopback() || v6.is_unique_local() || v6.is_unicast_link_local()
        }
    }
}

async fn is_private_http_url(url: &str) -> bool {
    let Ok(parsed) = reqwest::Url::parse(url) else {
        return false;
    };
    let Some(host) = parsed.host_str().map(|h| h.to_string()) else {
        return false;
    };

    if host == "localhost" {
        return true;
    }

    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        return is_private_ip(ip);
    }

    // Allow LAN HTTP for hostnames that resolve to private/loopback/link-local IPs.
    // This avoids forcing users to use raw IPs (e.g. `blinko.local`).
    let port = parsed.port_or_known_default().unwrap_or(80);
    let Ok(addrs) = lookup_host((host.as_str(), port)).await else {
        return false;
    };
    for addr in addrs {
        if is_private_ip(addr.ip()) {
            return true;
        }
    }
    false
}

fn normalize_bearer_token(token: &str) -> String {
    let trimmed = token.trim();
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("bearer ") {
        // Keep original case for the remainder by slicing the original string.
        return trimmed[("bearer ".len())..].trim().to_string();
    }
    trimmed.to_string()
}

fn normalize_bearer_token_opt(token: Option<String>) -> Option<String> {
    let token = token?;
    let normalized = normalize_bearer_token(&token);
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

pub async fn test_sync_connection(
    State(state): State<Arc<LocalApiContext>>,
    Json(input): Json<SyncTestRequest>,
) -> impl IntoResponse {
    let config = state.data_state.config_snapshot();
    let remote_url = input.remote_url.trim().trim_end_matches('/').to_string();

    if !(remote_url.starts_with("http://") || remote_url.starts_with("https://")) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Remote URL must start with http:// or https://" })),
        );
    }

    if remote_url.starts_with("http://") {
        let allow_insecure_http = input
            .allow_insecure_http
            .unwrap_or(config.allow_insecure_http);
        let allow_http = allow_insecure_http && is_private_http_url(&remote_url).await;
        if !allow_http {
            return (
                StatusCode::BAD_REQUEST,
                Json(
                    serde_json::json!({ "error": "Remote sync requires HTTPS (or allow LAN HTTP in settings)." }),
                ),
            );
        }
    }

    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(client) => client,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("Failed to init HTTP client: {err}") })),
            );
        }
    };

    let health_url = format!("{remote_url}/health");
    let health_res = match client.get(&health_url).send().await {
        Ok(res) => res,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": format!("Health check failed: {err}") })),
            );
        }
    };

    if !health_res.status().is_success() {
        return (
            StatusCode::BAD_GATEWAY,
            Json(
                serde_json::json!({ "error": format!("Health check failed ({})", health_res.status()) }),
            ),
        );
    }

    let Some(token) = normalize_bearer_token_opt(input.token) else {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Token required" })),
        );
    };

    // /changes is the source of truth for sync auth; validate the token there.
    let changes_url = format!("{remote_url}/changes");
    let mut req = client
        .get(&changes_url)
        .query(&[
            ("since", "0"),
            ("limit", "0"),
            ("include_self", "true"),
        ]);
    if let Ok(hv) = HeaderValue::from_str(&format!("Bearer {token}")) {
        req = req.header(AUTHORIZATION, hv);
    }
    let changes_res = match req.send().await {
        Ok(res) => res,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(serde_json::json!({ "error": format!("Token check failed: {err}") })),
            );
        }
    };
    if !changes_res.status().is_success() {
        let status = changes_res.status();
        let code = if status == StatusCode::UNAUTHORIZED || status == StatusCode::FORBIDDEN {
            StatusCode::UNAUTHORIZED
        } else {
            StatusCode::BAD_GATEWAY
        };
        return (
            code,
            Json(serde_json::json!({ "error": format!("Token invalid for /changes ({status})") })),
        );
    }

    (StatusCode::OK, Json(serde_json::json!({ "ok": true })))
}

pub async fn update_sync_settings(
    State(state): State<Arc<LocalApiContext>>,
    Json(input): Json<SyncSettingsUpdate>,
) -> impl IntoResponse {
    let mut config = state.data_state.config_snapshot();
    if let Some(allow_insecure_http) = input.allow_insecure_http {
        config.allow_insecure_http = allow_insecure_http;
    }
    if let Some(sync_auto) = input.sync_auto {
        config.sync_auto = sync_auto;
    }
    if let Some(sync_interval_secs) = input.sync_interval_secs {
        // Guard rails: keep a sane range so a bad UI/client doesn't DoS the app.
        config.sync_interval_secs = sync_interval_secs.clamp(30, 60 * 60);
    }
    if let Some(mut endpoints) = input.remote_endpoints {
        for endpoint in endpoints.iter_mut() {
            endpoint.url = endpoint.url.trim().trim_end_matches('/').to_string();
            endpoint.token = normalize_bearer_token_opt(endpoint.token.clone());

            let url = endpoint.url.trim();
            let is_local =
                url.starts_with("http://127.0.0.1") || url.starts_with("http://localhost");
            let is_https = url.starts_with("https://");
            let is_http = url.starts_with("http://");
            let allow_http =
                config.allow_insecure_http && is_http && is_private_http_url(url).await;
            if !is_https && !is_local && !allow_http {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(
                        serde_json::json!({ "error": "Remote sync requires HTTPS (or allow LAN HTTP in settings)." }),
                    ),
                );
            }
        }
        config.remote_endpoints = endpoints;
    }

    // Mode is derived from endpoint presence (local-first). Remote-only mode is deprecated.
    config.mode = if config.remote_endpoints.is_empty() {
        LocalMode::Local
    } else {
        LocalMode::Sync
    };
    if let Some(first) = config.remote_endpoints.first() {
        let repo = SettingsRepository::new(state.data_state.db.pool.clone());
        let _ = repo
            .set("remote_base_url", &first.url, &state.device_id)
            .await;
        if let Some(token) = &first.token {
            let _ = repo.set("remote_token", token, &state.device_id).await;
        }
    }

    if let Err(err) = save_config(&state.paths, &config) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        );
    }
    state.data_state.update_config(config.clone());
    // Wake the scheduler so interval/auto changes take effect immediately.
    crate::sync::scheduler::request_sync_soon();

    // Bootstrap behavior: when a user enables sync mode, existing local notes may not be in the outbox yet
    // (outbox is append-only on edits). Enqueue a one-time full export so the remote UI gets all PC notes.
    if matches!(config.mode, LocalMode::Sync) && !config.remote_endpoints.is_empty() {
        let endpoint_id = config.remote_endpoints[0].id.clone();
        let bootstrap_key = format!("sync_bootstrap_done:{endpoint_id}");
        let pool = state.data_state.db.pool.clone();
        let device_id = state.device_id.clone();
        let repo = SettingsRepository::new(pool.clone());
        let already_bootstrapped = repo
            .get(&bootstrap_key)
            .await
            .ok()
            .flatten()
            .map(|s| s.value == "true" || s.value == "in_progress")
            .unwrap_or(false);

        // Trigger once per endpoint (id). This covers both: switching into sync mode,
        // and restoring configs after reinstall/migration.
        if !already_bootstrapped {
            let _ = repo.set(&bootstrap_key, "in_progress", &device_id).await;
            tokio::spawn(async move {
                let note_repo = NoteRepository::new(pool.clone());
                let outbox = OutboxRepository::new(pool.clone());
                let settings_repo = SettingsRepository::new(pool.clone());

                if let Ok(notes) = note_repo.list_all_notes().await {
                    for note in notes {
                        let payload =
                            serde_json::to_string(&note).unwrap_or_else(|_| "{}".to_string());
                        let _ = outbox
                            .append("note", &note.sync_id, "upsert", &payload, &device_id)
                            .await;
                    }
                }

                // Keep settings export consistent with note export; harmless if remote ignores.
                if let Ok(settings) = settings_repo.list_all().await {
                    for setting in settings {
                        let payload =
                            serde_json::to_string(&setting).unwrap_or_else(|_| "{}".to_string());
                        let _ = outbox
                            .append("setting", &setting.key, "upsert", &payload, &device_id)
                            .await;
                    }
                }

                let _ = settings_repo.set(&bootstrap_key, "true", &device_id).await;
            });
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "mode": config.mode,
            "remote_endpoints": config.remote_endpoints,
            "allow_insecure_http": config.allow_insecure_http,
            "sync_auto": config.sync_auto,
            "sync_interval_secs": config.sync_interval_secs,
        })),
    )
}

pub async fn sync_now(State(state): State<Arc<LocalApiContext>>) -> impl IntoResponse {
    match crate::sync::scheduler::run_sync_once_manual(&state.data_state).await {
        Ok(_) => (StatusCode::OK, Json(serde_json::json!({ "status": "ok" }))),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        ),
    }
}

use std::sync::OnceLock;
use std::time::Duration;

use tokio::sync::Notify;
use tokio::sync::Mutex;
use tokio::time::sleep;

use crate::local_db::notes::NoteRepository;
use crate::local_db::outbox::{
    OutboxRepository, OUTBOX_STATUS_PENDING, OUTBOX_STATUS_PUSHED, OUTBOX_STATUS_SENT,
};
use crate::local_db::sync_state::SyncStateRepository;
use crate::local_runtime::LocalDataState;

use super::migration::export_local_to_remote;
use super::remote_client::RemoteClient;
use super::{apply_ops, SyncOp};
use sha2::{Digest, Sha256};

static SYNC_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static SYNC_NOTIFY: OnceLock<Notify> = OnceLock::new();

fn sync_lock() -> &'static Mutex<()> {
    SYNC_LOCK.get_or_init(|| Mutex::new(()))
}

fn sync_notify() -> &'static Notify {
    SYNC_NOTIFY.get_or_init(Notify::new)
}

pub fn request_sync_soon() {
    sync_notify().notify_one();
}

async fn run_sync_once_inner(state: &LocalDataState) -> Result<(), String> {
    let config = state.config_snapshot();
    if config.remote_endpoints.is_empty() {
        return Ok(());
    }

    for endpoint in config.remote_endpoints.clone() {
        let sync_repo = SyncStateRepository::new(state.db.pool.clone());

        let last_state = sync_repo.get(&endpoint.id).await?;
        let last_pull_cursor = last_state.as_ref().and_then(|s| s.last_pull_cursor.clone());
        let last_push_cursor = last_state.as_ref().and_then(|s| s.last_push_cursor.clone());

        if endpoint
            .token
            .as_ref()
            .map(|t| t.trim().is_empty())
            .unwrap_or(true)
        {
            let _ = sync_repo
                .upsert(
                    &endpoint.id,
                    last_pull_cursor.as_deref(),
                    last_push_cursor.as_deref(),
                    Some("error: Missing token"),
                )
                .await?;
            continue;
        }

        let client = RemoteClient::new(endpoint.url.clone(), endpoint.token.clone());
        let outbox_repo = OutboxRepository::new(state.db.pool.clone());
        let note_repo = NoteRepository::new(state.db.pool.clone());
        let device_id = config
            .device_id
            .clone()
            .unwrap_or_else(|| "local".to_string());

        // Restore scenario: if the local DB has no notes (fresh install / wiped DB),
        // allow pulling our own ops and force a full pull from cursor 0.
        let local_note_count = note_repo.count_all_notes().await.unwrap_or(0);
        let include_self = local_note_count == 0;
        let pull_since = if include_self {
            Some("0".to_string())
        } else {
            last_pull_cursor.clone()
        };

        // Pull first (remote may have been reset/wiped). Pull multiple pages so a single `/sync/now`
        // can complete a restore/bootstrap instead of requiring many repeats.
        let mut new_pull_cursor = pull_since.clone();
        let mut status: Option<String> = Some("ok".to_string());
        let mut pull_ok = true;
        let max_pages = if include_self { 50 } else { 10 };

        for _ in 0..max_pages {
            let pulled = match client
                .pull_ops(
                    new_pull_cursor.as_deref(),
                    Some(&device_id),
                    include_self,
                    Some(500),
                )
                .await
            {
                Ok(pulled) => pulled,
                Err(err) => {
                    status = Some(format!("error: {err}"));
                    pull_ok = false;
                    break;
                }
            };

            if pulled.reset && new_pull_cursor.is_some() {
                // Remote cursor was reset/truncated. Re-export local state so remote UI is repopulated.
                if let Err(err) =
                    export_local_to_remote(&state.db, &state.paths.attachments_dir, &client).await
                {
                    status = Some(format!("error: {err}"));
                    pull_ok = false;
                    break;
                }

                // Peek remote max cursor (without downloading ops) so future pulls work even if the
                // remote ID sequence restarted.
                let peek = client.peek_cursor().await.unwrap_or(None);
                new_pull_cursor = peek.or(Some("0".to_string()));
                status = Some("remote_reset_exported".to_string());
                break;
            }

            if pulled.ops.is_empty() {
                new_pull_cursor = pulled.cursor.or(new_pull_cursor);
                break;
            }

            if let Err(err) = apply_ops(&state.db, &pulled.ops).await {
                status = Some(format!("error: {err}"));
                pull_ok = false;
                break;
            }

            for op in pulled
                .ops
                .iter()
                .filter(|op| op.entity_type == "attachment")
            {
                if let Ok(att) = serde_json::from_str::<crate::local_db::attachments::Attachment>(
                    &op.payload_json,
                ) {
                    let file_path = state.paths.attachments_dir.join(&att.path);
                    if !file_path.exists() {
                        if let Ok(bytes) = client.download_attachment(&att.sync_id).await {
                            if hash_matches(&bytes, &att.sha256) {
                                let _ = tokio::fs::write(&file_path, bytes).await;
                            } else {
                                eprintln!("Attachment hash mismatch for {}", att.sync_id);
                            }
                        }
                    }
                }
            }

            let next_cursor = pulled.cursor.or(new_pull_cursor.clone());
            // If the server didn't advance the cursor, don't spin forever.
            if next_cursor == new_pull_cursor {
                break;
            }
            new_pull_cursor = next_cursor;

            // Heuristic: server pages are capped; if we got less than a full page, we're done.
            if pulled.ops.len() < 500 {
                break;
            }
        }

        // Then push local ops. Drain several batches so manual `/sync/now` can complete bootstrap quickly.
        let mut new_push_cursor = last_push_cursor.clone();
        if pull_ok {
            // Phase 1: push pending ops to /changes. Attachments transition to `pushed` so uploads can be retried
            // reliably (do not mark as `sent` until the binary upload succeeds).
            for _ in 0..50 {
                let pending_entries = outbox_repo
                    .list_by_statuses(&[OUTBOX_STATUS_PENDING], 200)
                    .await?;
                if pending_entries.is_empty() {
                    break;
                }

                let local_ops: Vec<SyncOp> =
                    pending_entries.iter().cloned().map(SyncOp::from).collect();
                if let Err(err) = client.push_ops(&local_ops).await {
                    status = Some(format!("error: {err}"));
                    break;
                }

                let last_id = local_ops
                    .last()
                    .and_then(|op| op.id.map(|id| id.to_string()));
                new_push_cursor = last_id.or(new_push_cursor);

                let mut mark_sent_ids: Vec<i64> = Vec::new();
                let mut mark_pushed_ids: Vec<i64> = Vec::new();

                for entry in pending_entries.iter() {
                    if entry.entity_type == "attachment" {
                        // Deletes don't need an upload.
                        if entry.op == "delete" {
                            mark_sent_ids.push(entry.id);
                        } else {
                            mark_pushed_ids.push(entry.id);
                        }
                    } else {
                        mark_sent_ids.push(entry.id);
                    }
                }

                if !mark_sent_ids.is_empty() {
                    outbox_repo.mark_status(&mark_sent_ids, OUTBOX_STATUS_SENT).await?;
                }
                if !mark_pushed_ids.is_empty() {
                    outbox_repo
                        .mark_status(&mark_pushed_ids, OUTBOX_STATUS_PUSHED)
                        .await?;
                }
            }

            // Phase 2: upload binaries for pushed attachments. Keep `pushed` on failure so next sync retries.
            let mut last_upload_error: Option<String> = None;
            // Process a single batch per sync run; do not spin on failures in a tight loop.
            // Remaining `pushed` entries will be retried on the next scheduled/manual sync.
            let pushed_entries = outbox_repo
                .list_by_statuses(&[OUTBOX_STATUS_PUSHED], 200)
                .await?;
            let attachment_entries = pushed_entries
                .into_iter()
                .filter(|e| e.entity_type == "attachment")
                .collect::<Vec<_>>();

            for entry in attachment_entries.iter() {
                if entry.op == "delete" {
                    let _ = outbox_repo.mark_status(&[entry.id], OUTBOX_STATUS_SENT).await;
                    continue;
                }

                let att = match serde_json::from_str::<crate::local_db::attachments::Attachment>(
                    &entry.payload_json,
                ) {
                    Ok(att) => att,
                    Err(err) => {
                        last_upload_error = Some(format!("Invalid attachment payload: {err}"));
                        continue;
                    }
                };

                // Attachment payload contains the local stored filename under `att.path`.
                let file_path = state.paths.attachments_dir.join(&att.path);
                if !file_path.exists() {
                    last_upload_error = Some(format!(
                        "Missing local attachment file for sync_id={}",
                        att.sync_id
                    ));
                    continue;
                }

                match client.upload_attachment(&att, &file_path).await {
                    Ok(()) => {
                        let _ = outbox_repo
                            .mark_status(&[entry.id], OUTBOX_STATUS_SENT)
                            .await;
                    }
                    Err(err) => {
                        last_upload_error = Some(err);
                    }
                }
            }

            // Surface pending uploads/errors in sync state so UI can show actionable diagnostics.
            let pending_uploads = outbox_repo
                .count_by_status_and_entity_type(OUTBOX_STATUS_PUSHED, "attachment")
                .await
                .unwrap_or(0);
            if pending_uploads > 0 {
                let suffix = last_upload_error
                    .as_deref()
                    .map(|e| format!(" attachment_upload_error:{e}"))
                    .unwrap_or_default();
                let pending_msg =
                    format!("attachment_upload_pending:{pending_uploads}{suffix}");
                status = match status.as_deref() {
                    None | Some("ok") => Some(pending_msg),
                    Some(existing) => Some(format!("{existing} {pending_msg}")),
                };
            }
        }

        let _ = sync_repo
            .upsert(
                &endpoint.id,
                new_pull_cursor.as_deref(),
                new_push_cursor.as_deref(),
                status.as_deref(),
            )
            .await?;
    }

    Ok(())
}

pub async fn run_sync_once_manual(state: &LocalDataState) -> Result<(), String> {
    let _guard = sync_lock().lock().await;
    run_sync_once_inner(state).await
}

pub async fn run_sync_once_auto(state: &LocalDataState) -> Result<(), String> {
    let config = state.config_snapshot();
    if !config.sync_auto {
        return Ok(());
    }
    if config.remote_endpoints.is_empty() {
        return Ok(());
    }

    let guard = sync_lock().try_lock();
    let Ok(_guard) = guard else {
        // Avoid stacking auto runs; a manual run will still wait on the lock.
        return Ok(());
    };

    run_sync_once_inner(state).await
}

fn hash_matches(bytes: &[u8], expected: &str) -> bool {
    if expected.trim().is_empty() {
        // Server may not provide a hash for legacy attachment ops; accept and rely on transport integrity.
        return true;
    }
    format_hash(bytes) == expected
}

fn format_hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest.iter() {
        out.push_str(&format!("{:02x}", byte));
    }
    out
}

pub fn start_sync_scheduler(state: LocalDataState) {
    tauri::async_runtime::spawn(async move {
        loop {
            let config = state.config_snapshot();
            let interval_secs = config.sync_interval_secs.max(30);
            let interval = Duration::from_secs(interval_secs);

            tokio::select! {
                _ = sleep(interval) => {}
                _ = sync_notify().notified() => {
                    // Debounce bursts of local changes (keeps the UI snappy without hammering the network).
                    sleep(Duration::from_secs(2)).await;
                }
            }

            let _ = run_sync_once_auto(&state).await;
        }
    });
}

#[tauri::command]
pub async fn sync_now(state: tauri::State<'_, LocalDataState>) -> Result<(), String> {
    run_sync_once_manual(&state).await
}

#[cfg(test)]
mod tests {
    use super::run_sync_once_manual;
    use axum::{
        body::Body,
        extract::{Query, State},
        http::StatusCode,
        response::IntoResponse,
        routing::{get, post},
        Json, Router,
    };
    use serde::Deserialize;
    use std::sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    };

    use crate::local_db::attachments::AttachmentRepository;
    use crate::local_db::outbox::{
        OutboxRepository, OUTBOX_STATUS_PUSHED, OUTBOX_STATUS_SENT,
    };
    use crate::local_db::LocalDb;
    use crate::local_runtime::config::{LocalConfig, LocalMode, RemoteEndpoint};
    use crate::local_runtime::paths::RuntimePaths;
    use crate::local_runtime::LocalDataState;

    #[derive(Debug, Deserialize)]
    struct ChangesQuery {
        since: Option<String>,
    }

    async fn health() -> impl IntoResponse {
        (StatusCode::OK, Json(serde_json::json!({ "status": "ok" })))
    }

    async fn changes_get(Query(q): Query<ChangesQuery>) -> impl IntoResponse {
        (
            StatusCode::OK,
            Json(serde_json::json!({
                "cursor": q.since.unwrap_or_else(|| "0".to_string()),
                "ops": [],
                "reset": false
            })),
        )
    }

    async fn changes_post(_body: Body) -> impl IntoResponse {
        (StatusCode::OK, Json(serde_json::json!({ "ok": true })))
    }

    async fn upload_post(
        State(attempts): State<Arc<AtomicUsize>>,
        body: Body,
    ) -> impl IntoResponse {
        // Drain the request body so the underlying HTTP/1.1 connection can be cleanly reused by
        // reqwest across multiple upload attempts (matches real server behavior which parses multipart).
        let _ = axum::body::to_bytes(body, usize::MAX).await;
        let n = attempts.fetch_add(1, Ordering::SeqCst);
        if n == 0 {
            return (StatusCode::PAYLOAD_TOO_LARGE, "too large").into_response();
        }
        (StatusCode::OK, Json(serde_json::json!({ "ok": true }))).into_response()
    }

    fn temp_root() -> std::path::PathBuf {
        let pid = std::process::id();
        let nonce = uuid::Uuid::new_v4();
        std::env::temp_dir().join(format!("blinko_sync_scheduler_test_{pid}_{nonce}"))
    }

    #[tokio::test]
    async fn attachment_upload_retries_and_eventually_marks_sent() {
        let attempts = Arc::new(AtomicUsize::new(0));
        let app = Router::new()
            .route("/health", get(health))
            .route("/changes", get(changes_get).post(changes_post))
            .route("/api/file/upload", post(upload_post))
            .with_state(attempts.clone());

        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let remote_url = format!("http://127.0.0.1:{}", addr.port());

        let root = temp_root();
        let paths = RuntimePaths::from_root(root.clone());
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();

        let mut config = LocalConfig::default();
        config.mode = LocalMode::Sync;
        config.allow_insecure_http = true;
        config.device_id = Some("test-device".to_string());
        config.remote_endpoints = vec![RemoteEndpoint {
            id: "default".to_string(),
            url: remote_url,
            token: Some("test-token".to_string()),
            last_sync_at: None,
        }];

        let state = LocalDataState::new(db.clone(), config, paths.clone());

        // Create a local attachment + outbox entry (pending).
        let repo = AttachmentRepository::new(db.pool.clone(), paths.attachments_dir.clone());
        let att = repo
            .save_file(b"hello", "a.bin", "application/octet-stream", None)
            .await
            .unwrap();
        let outbox = OutboxRepository::new(db.pool.clone());
        let entry = outbox
            .append(
                "attachment",
                &att.sync_id,
                "create",
                &serde_json::to_string(&att).unwrap(),
                "test-device",
            )
            .await
            .unwrap();

        // First sync: upload fails => entry transitions to pushed (not sent).
        run_sync_once_manual(&state).await.unwrap();
        let after_1 = outbox.get_by_id(entry.id).await.unwrap();
        assert_eq!(after_1.status, OUTBOX_STATUS_PUSHED);

        // Second sync: upload succeeds => entry becomes sent.
        run_sync_once_manual(&state).await.unwrap();
        let after_2 = outbox.get_by_id(entry.id).await.unwrap();
        assert_eq!(after_2.status, OUTBOX_STATUS_SENT);

        let _ = std::fs::remove_dir_all(root);
    }
}

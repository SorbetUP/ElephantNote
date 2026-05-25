use std::sync::Arc;

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use chrono::Utc;
use serde::Deserialize;

use super::LocalApiContext;
use crate::local_db::conflicts::ConflictRepository;
use crate::local_db::notes::NoteRepository;
use crate::local_db::oplog::OplogRepository;
use crate::local_db::outbox::OutboxRepository;
use crate::local_db::settings::SettingsRepository;
use crate::local_db::tags::{extract_tag_names, TagRepository};

#[derive(Debug, Deserialize)]
pub struct ConflictListQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_conflicts(
    State(state): State<Arc<LocalApiContext>>,
    Query(q): Query<ConflictListQuery>,
) -> impl IntoResponse {
    let repo = ConflictRepository::new(state.data_state.db.pool.clone());
    let unresolved_count = repo.unresolved_count().await.unwrap_or(0);

    let limit = q.limit.unwrap_or(50).clamp(1, 200);
    let offset = q.offset.unwrap_or(0).max(0);
    let conflicts = match repo.list_unresolved(limit, offset).await {
        Ok(rows) => rows
            .into_iter()
            .map(|c| {
                serde_json::json!({
                    "id": c.id,
                    "entity_type": c.entity_type,
                    "entity_id": c.entity_id,
                    "created_at": c.created_at.to_rfc3339(),
                })
            })
            .collect::<Vec<_>>(),
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": err })),
            );
        }
    };

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "unresolved_count": unresolved_count,
            "conflicts": conflicts,
        })),
    )
}

pub async fn get_conflict(
    State(state): State<Arc<LocalApiContext>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let repo = ConflictRepository::new(state.data_state.db.pool.clone());
    match repo.get_by_id(id).await {
        Ok(c) => (
            StatusCode::OK,
            Json(serde_json::json!({
                "id": c.id,
                "entity_type": c.entity_type,
                "entity_id": c.entity_id,
                "local_payload": c.local_payload,
                "remote_payload": c.remote_payload,
                "resolved_payload": c.resolved_payload,
                "created_at": c.created_at.to_rfc3339(),
            })),
        ),
        Err(err) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": err })),
        ),
    }
}

#[derive(Debug, Deserialize)]
pub struct ConflictResolveRequest {
    pub choice: String, // "local" | "remote"
}

pub async fn resolve_conflict(
    State(state): State<Arc<LocalApiContext>>,
    Path(id): Path<i64>,
    Json(input): Json<ConflictResolveRequest>,
) -> impl IntoResponse {
    let repo = ConflictRepository::new(state.data_state.db.pool.clone());
    let conflict = match repo.get_by_id(id).await {
        Ok(c) => c,
        Err(err) => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": err })),
            );
        }
    };

    let chosen_payload = match input.choice.as_str() {
        "local" => conflict.local_payload.clone(),
        "remote" => conflict.remote_payload.clone(),
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "choice must be 'local' or 'remote'" })),
            );
        }
    };
    let chosen_payload = match chosen_payload {
        Some(p) if !p.trim().is_empty() => p,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": "chosen payload is missing" })),
            );
        }
    };

    let now = Utc::now();
    let device_id = state.device_id.clone();

    let oplog = OplogRepository::new(state.data_state.db.pool.clone());
    let outbox = OutboxRepository::new(state.data_state.db.pool.clone());

    let resolved_payload = match conflict.entity_type.as_str() {
        "note" => {
            let mut note: crate::local_db::notes::Note = match serde_json::from_str(&chosen_payload)
            {
                Ok(v) => v,
                Err(err) => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(serde_json::json!({ "error": format!("invalid note payload: {err}") })),
                    );
                }
            };

            let note_repo = NoteRepository::new(state.data_state.db.pool.clone());
            let existing = note_repo.get_note_by_sync_id(&note.sync_id).await.ok().flatten();
            note.rev = existing.as_ref().map(|n| n.rev + 1).unwrap_or(1);
            note.updated_at = now;
            note.device_id = device_id.clone();

            let saved = match note_repo.upsert_note_by_sync_id(&note).await {
                Ok(n) => n,
                Err(err) => {
                    return (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(serde_json::json!({ "error": err })),
                    );
                }
            };

            let tag_repo = TagRepository::new(state.data_state.db.pool.clone());
            let tag_names = extract_tag_names(&saved.content);
            let _ = tag_repo.set_note_tags_by_names(saved.id, &tag_names).await;

            let payload_json = serde_json::to_string(&saved).unwrap_or_else(|_| "{}".to_string());
            let _ = oplog
                .append("note", &saved.sync_id, "upsert", &payload_json, &device_id)
                .await;
            let _ = outbox
                .append("note", &saved.sync_id, "upsert", &payload_json, &device_id)
                .await;

            payload_json
        }
        "setting" => {
            let mut setting: crate::local_db::settings::Setting =
                match serde_json::from_str(&chosen_payload) {
                    Ok(v) => v,
                    Err(err) => {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(serde_json::json!({ "error": format!("invalid setting payload: {err}") })),
                        );
                    }
                };

            setting.updated_at = now;
            setting.device_id = device_id.clone();

            let settings_repo = SettingsRepository::new(state.data_state.db.pool.clone());
            if let Err(err) = settings_repo.upsert_setting(&setting).await {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": err })),
                );
            }

            let payload_json =
                serde_json::to_string(&setting).unwrap_or_else(|_| "{}".to_string());
            let _ = oplog
                .append("setting", &setting.key, "upsert", &payload_json, &device_id)
                .await;
            let _ = outbox
                .append("setting", &setting.key, "upsert", &payload_json, &device_id)
                .await;

            payload_json
        }
        other => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("unsupported entity_type: {other}") })),
            );
        }
    };

    if let Err(err) = repo.mark_resolved(conflict.id, &resolved_payload).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        );
    }

    crate::sync::scheduler::request_sync_soon();

    (StatusCode::OK, Json(serde_json::json!({ "ok": true })))
}


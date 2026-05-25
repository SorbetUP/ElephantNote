use std::sync::Arc;

use axum::extract::{Json, Path, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::{Deserialize, Serialize};

use crate::local_db::notes::{NoteInput, NoteRepository};
use crate::local_db::tags::{extract_tag_names, TagRepository};
use crate::local_db::oplog::OplogRepository;
use crate::local_db::outbox::OutboxRepository;

use super::LocalApiContext;

#[derive(Debug, Deserialize)]
pub struct NoteRequest {
    pub title: Option<String>,
    pub content: Option<String>,
    #[serde(rename = "isArchived")]
    pub is_archived: Option<bool>,
    #[serde(rename = "isRecycle")]
    pub is_recycle: Option<bool>,
    #[serde(rename = "isShare")]
    pub is_share: Option<bool>,
    #[serde(rename = "isTop")]
    pub is_top: Option<bool>,
    #[serde(rename = "type")]
    pub note_type: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct NotesResponse<T> {
    pub data: T,
}

pub async fn list_notes(State(state): State<Arc<LocalApiContext>>) -> Response {
    let repo = NoteRepository::new(state.data_state.db.pool.clone());
    match repo.list_notes().await {
        Ok(notes) => (StatusCode::OK, Json(NotesResponse { data: notes })).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

pub async fn get_note(State(state): State<Arc<LocalApiContext>>, Path(id): Path<i64>) -> Response {
    let repo = NoteRepository::new(state.data_state.db.pool.clone());
    match repo.get_note(id).await {
        Ok(Some(note)) => (StatusCode::OK, Json(note)).into_response(),
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

pub async fn create_note(
    State(state): State<Arc<LocalApiContext>>,
    Json(input): Json<NoteRequest>,
) -> Response {
    let repo = NoteRepository::new(state.data_state.db.pool.clone());
    let payload = NoteInput {
        title: input.title.unwrap_or_else(|| "".to_string()),
        content: input.content.unwrap_or_else(|| "".to_string()),
        is_archived: input.is_archived.unwrap_or(false),
        is_recycle: input.is_recycle.unwrap_or(false),
        is_share: input.is_share.unwrap_or(false),
        is_top: input.is_top.unwrap_or(false),
        note_type: input.note_type.unwrap_or(0),
        created_at: None,
        updated_at: None,
    };

    match repo.create_note(payload, &state.device_id).await {
        Ok(note) => {
            let tag_repo = TagRepository::new(state.data_state.db.pool.clone());
            let tag_names = extract_tag_names(&note.content);
            let _ = tag_repo.set_note_tags_by_names(note.id, &tag_names).await;
            let oplog = OplogRepository::new(state.data_state.db.pool.clone());
            let _ = oplog
                .append(
                    "note",
                    &note.sync_id,
                    "create",
                    &serde_json::to_string(&note).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;

            let outbox = OutboxRepository::new(state.data_state.db.pool.clone());
            let appended = outbox
                .append(
                    "note",
                    &note.sync_id,
                    "create",
                    &serde_json::to_string(&note).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;
            if appended.is_ok() {
                crate::sync::scheduler::request_sync_soon();
            }

            (StatusCode::CREATED, Json(note)).into_response()
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

pub async fn update_note(
    State(state): State<Arc<LocalApiContext>>,
    Path(id): Path<i64>,
    Json(input): Json<NoteRequest>,
) -> Response {
    let repo = NoteRepository::new(state.data_state.db.pool.clone());
    let existing = match repo.get_note(id).await {
        Ok(Some(note)) => note,
        Ok(None) => {
            return (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Not found" })))
                .into_response();
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": err })),
            )
                .into_response();
        }
    };

    let payload = NoteInput {
        title: input.title.unwrap_or(existing.title),
        content: input.content.unwrap_or(existing.content),
        is_archived: input.is_archived.unwrap_or(existing.is_archived),
        is_recycle: input.is_recycle.unwrap_or(existing.is_recycle),
        is_share: input.is_share.unwrap_or(existing.is_share),
        is_top: input.is_top.unwrap_or(existing.is_top),
        note_type: input.note_type.unwrap_or(existing.note_type),
        created_at: None,
        updated_at: None,
    };

    match repo.update_note(id, payload, &state.device_id).await {
        Ok(Some(note)) => {
            let tag_repo = TagRepository::new(state.data_state.db.pool.clone());
            let tag_names = extract_tag_names(&note.content);
            let _ = tag_repo.set_note_tags_by_names(note.id, &tag_names).await;
            let oplog = OplogRepository::new(state.data_state.db.pool.clone());
            let _ = oplog
                .append(
                    "note",
                    &note.sync_id,
                    "update",
                    &serde_json::to_string(&note).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;

            let outbox = OutboxRepository::new(state.data_state.db.pool.clone());
            let appended = outbox
                .append(
                    "note",
                    &note.sync_id,
                    "update",
                    &serde_json::to_string(&note).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;
            if appended.is_ok() {
                crate::sync::scheduler::request_sync_soon();
            }

            (StatusCode::OK, Json(note)).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Not found" })))
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

pub async fn delete_note(State(state): State<Arc<LocalApiContext>>, Path(id): Path<i64>) -> Response {
    let repo = NoteRepository::new(state.data_state.db.pool.clone());
    match repo.delete_note(id, &state.device_id).await {
        Ok(Some(note)) => {
            let oplog = OplogRepository::new(state.data_state.db.pool.clone());
            let _ = oplog
                .append(
                    "note",
                    &note.sync_id,
                    "delete",
                    &serde_json::to_string(&note).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;

            let outbox = OutboxRepository::new(state.data_state.db.pool.clone());
            let appended = outbox
                .append(
                    "note",
                    &note.sync_id,
                    "delete",
                    &serde_json::to_string(&note).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;
            if appended.is_ok() {
                crate::sync::scheduler::request_sync_soon();
            }

            (StatusCode::OK, Json(note)).into_response()
        }
        Ok(None) => (StatusCode::NOT_FOUND, Json(serde_json::json!({ "error": "Not found" })))
            .into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

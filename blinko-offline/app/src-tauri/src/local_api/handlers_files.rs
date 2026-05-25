use std::sync::Arc;

use axum::extract::{Multipart, Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use chrono::Utc;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use tokio::io::AsyncWriteExt;
use uuid::Uuid;

use super::LocalApiContext;
use crate::local_db::attachments::AttachmentRepository;
use crate::local_db::notes::NoteRepository;
use crate::local_db::oplog::OplogRepository;
use crate::local_db::outbox::OutboxRepository;

#[derive(Debug, Deserialize)]
pub struct DeleteByPathRequest {
    pub attachment_path: String,
}

pub async fn upload_file(
    State(state): State<Arc<LocalApiContext>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let repo = AttachmentRepository::new(
        state.data_state.db.pool.clone(),
        state.paths.attachments_dir.clone(),
    );

    while let Ok(Some(mut field)) = multipart.next_field().await {
        if field.name() != Some("file") {
            continue;
        }

        let filename = field.file_name().unwrap_or("upload.bin").to_string();
        let mime = field
            .content_type()
            .unwrap_or("application/octet-stream")
            .to_string();
        let sync_id = Uuid::new_v4().to_string();
        let safe_name = filename.replace(['/', '\\'], "_");
        let stored_name = format!("{}_{}", sync_id, safe_name);
        let file_path = state.paths.attachments_dir.join(&stored_name);

        if let Err(err) = tokio::fs::create_dir_all(&state.paths.attachments_dir).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(
                    serde_json::json!({ "error": format!("Failed to create attachments dir: {err}") }),
                ),
            );
        }

        let mut out = match tokio::fs::File::create(&file_path).await {
            Ok(file) => file,
            Err(err) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json(
                        serde_json::json!({ "error": format!("Failed to write attachment: {err}") }),
                    ),
                );
            }
        };

        let mut hasher = Sha256::new();
        let mut size: i64 = 0;
        loop {
            match field.chunk().await {
                Ok(Some(chunk)) => {
                    size += chunk.len() as i64;
                    hasher.update(&chunk);
                    if let Err(err) = out.write_all(&chunk).await {
                        let _ = tokio::fs::remove_file(&file_path).await;
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            axum::Json(
                                serde_json::json!({ "error": format!("Failed to write attachment: {err}") }),
                            ),
                        );
                    }
                }
                Ok(None) => break,
                Err(err) => {
                    let _ = tokio::fs::remove_file(&file_path).await;
                    return (
                        StatusCode::BAD_REQUEST,
                        axum::Json(serde_json::json!({ "error": err.to_string() })),
                    );
                }
            }
        }

        let sha256 = {
            let digest = hasher.finalize();
            let mut out = String::with_capacity(digest.len() * 2);
            for byte in digest.iter() {
                out.push_str(&format!("{:02x}", byte));
            }
            out
        };

        let now = Utc::now();
        return match repo
            .create_attachment_record(
                &sync_id,
                None,
                &filename,
                &mime,
                size,
                &sha256,
                &stored_name,
                now,
            )
            .await
        {
            Ok(att) => {
                let oplog = OplogRepository::new(state.data_state.db.pool.clone());
                let _ = oplog
                    .append(
                        "attachment",
                        &att.sync_id,
                        "create",
                        &serde_json::to_string(&att).unwrap_or_else(|_| "{}".to_string()),
                        &state.device_id,
                    )
                    .await;
                let outbox = OutboxRepository::new(state.data_state.db.pool.clone());
                let appended = outbox
                    .append(
                        "attachment",
                        &att.sync_id,
                        "create",
                        &serde_json::to_string(&att).unwrap_or_else(|_| "{}".to_string()),
                        &state.device_id,
                    )
                    .await;
                if appended.is_ok() {
                    crate::sync::scheduler::request_sync_soon();
                }
                (
                    StatusCode::OK,
                    axum::Json(serde_json::json!({
                        "Message": "Success",
                        "status": 200,
                        "filePath": format!("/api/file/{}", att.id),
                        "fileName": att.filename,
                        "type": att.mime,
                        "size": att.size
                    })),
                )
            }
            Err(err) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                axum::Json(serde_json::json!({ "error": err })),
            ),
        };
    }

    (
        StatusCode::BAD_REQUEST,
        axum::Json(serde_json::json!({ "error": "No file uploaded" })),
    )
}

pub async fn overwrite_file(
    State(state): State<Arc<LocalApiContext>>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let repo = AttachmentRepository::new(
        state.data_state.db.pool.clone(),
        state.paths.attachments_dir.clone(),
    );

    let mut attachment_path: Option<String> = None;
    let mut file_bytes: Option<bytes::Bytes> = None;
    let mut filename: Option<String> = None;
    let mut mime: Option<String> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        if name == "attachment_path" || name == "attachmentPath" {
            if let Ok(text) = field.text().await {
                attachment_path = Some(text);
            }
            continue;
        }

        if name != "file" {
            continue;
        }

        filename = Some(field.file_name().unwrap_or("upload.bin").to_string());
        mime = Some(
            field
                .content_type()
                .unwrap_or("application/octet-stream")
                .to_string(),
        );
        match field.bytes().await {
            Ok(bytes) => {
                file_bytes = Some(bytes);
            }
            Err(err) => {
                return (
                    StatusCode::BAD_REQUEST,
                    axum::Json(serde_json::json!({ "error": err.to_string() })),
                );
            }
        }
    }

    let Some(path) = attachment_path else {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "Missing attachment_path" })),
        );
    };
    let Some(bytes) = file_bytes else {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "No file uploaded" })),
        );
    };

    let prefix = "/api/file/";
    let Some(id_str) = path.strip_prefix(prefix) else {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "Unsupported attachment_path" })),
        );
    };
    let Ok(id) = id_str.parse::<i64>() else {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "Invalid attachment id" })),
        );
    };

    let name = filename.unwrap_or_else(|| "upload.bin".to_string());
    let mime = mime.unwrap_or_else(|| "application/octet-stream".to_string());

    match repo.overwrite_file(id, bytes.as_ref(), &name, &mime).await {
        Ok(att) => {
            let oplog = OplogRepository::new(state.data_state.db.pool.clone());
            let _ = oplog
                .append(
                    "attachment",
                    &att.sync_id,
                    "update",
                    &serde_json::to_string(&att).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;
            let outbox = OutboxRepository::new(state.data_state.db.pool.clone());
            let appended = outbox
                .append(
                    "attachment",
                    &att.sync_id,
                    "update",
                    &serde_json::to_string(&att).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;
            if appended.is_ok() {
                crate::sync::scheduler::request_sync_soon();
            }
            (
                StatusCode::OK,
                axum::Json(serde_json::json!({
                    "Message": "Success",
                    "status": 200,
                    "filePath": format!("/api/file/{}", att.id),
                    "fileName": att.filename,
                    "type": att.mime,
                    "size": att.size
                })),
            )
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({ "error": err })),
        ),
    }
}

pub async fn upload_by_url(
    State(state): State<Arc<LocalApiContext>>,
    axum::Json(payload): axum::Json<serde_json::Value>,
) -> impl IntoResponse {
    let repo = AttachmentRepository::new(
        state.data_state.db.pool.clone(),
        state.paths.attachments_dir.clone(),
    );
    let url = payload.get("url").and_then(|v| v.as_str()).unwrap_or("");
    if url.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "No URL provided" })),
        );
    }

    match reqwest::get(url).await {
        Ok(response) => {
            let mime = response
                .headers()
                .get(reqwest::header::CONTENT_TYPE)
                .and_then(|v| v.to_str().ok())
                .unwrap_or("application/octet-stream")
                .to_string();
            let filename = url
                .split('/')
                .last()
                .filter(|s| !s.is_empty())
                .unwrap_or("download")
                .to_string();
            match response.bytes().await {
                Ok(bytes) => match repo.save_file(&bytes, &filename, &mime, None).await {
                    Ok(att) => {
                        let oplog = OplogRepository::new(state.data_state.db.pool.clone());
                        let _ = oplog
                            .append(
                                "attachment",
                                &att.sync_id,
                                "create",
                                &serde_json::to_string(&att).unwrap_or_else(|_| "{}".to_string()),
                                &state.device_id,
                            )
                            .await;
                        let outbox = OutboxRepository::new(state.data_state.db.pool.clone());
                        let appended = outbox
                            .append(
                                "attachment",
                                &att.sync_id,
                                "create",
                                &serde_json::to_string(&att).unwrap_or_else(|_| "{}".to_string()),
                                &state.device_id,
                            )
                            .await;
                        if appended.is_ok() {
                            crate::sync::scheduler::request_sync_soon();
                        }
                        (
                            StatusCode::OK,
                            axum::Json(serde_json::json!({
                                "Message": "Success",
                                "status": 200,
                                "filePath": format!("/api/file/{}", att.id),
                                "fileName": att.filename,
                                "type": att.mime,
                                "size": att.size,
                                "originalURL": url
                            })),
                        )
                    }
                    Err(err) => (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        axum::Json(serde_json::json!({ "error": err })),
                    ),
                },
                Err(err) => (
                    StatusCode::BAD_REQUEST,
                    axum::Json(serde_json::json!({ "error": err.to_string() })),
                ),
            }
        }
        Err(err) => (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": err.to_string() })),
        ),
    }
}

pub async fn download_file(
    State(state): State<Arc<LocalApiContext>>,
    Path(id): Path<i64>,
    Query(query): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let repo = AttachmentRepository::new(
        state.data_state.db.pool.clone(),
        state.paths.attachments_dir.clone(),
    );
    let note_repo = NoteRepository::new(state.data_state.db.pool.clone());

    let header_token = extract_bearer(headers.get(axum::http::header::AUTHORIZATION));
    let query_token = query.get("token").cloned();
    let is_authed = matches!(header_token.as_deref(), Some(t) if t == state.token)
        || matches!(query_token.as_deref(), Some(t) if t == state.token);
    let query_password = query.get("password").cloned();

    match repo.get_by_id(id).await {
        Ok(Some(att)) => {
            if !is_authed {
                // Public download is only allowed when the attachment belongs to a shared note
                // that hasn't expired. This enables the `/share/:id` flow in local mode without
                // exposing every attachment publicly.
                let Some(note_id) = att.note_id else {
                    return StatusCode::UNAUTHORIZED.into_response();
                };
                let note = note_repo.get_note(note_id).await.ok().flatten();
                let Some(note) = note else {
                    return StatusCode::UNAUTHORIZED.into_response();
                };
                if !note.is_share || note.is_recycle || note.deleted_at.is_some() {
                    return StatusCode::UNAUTHORIZED.into_response();
                }
                if let Some(exp) = note.share_expiry_date.as_ref() {
                    if chrono::Utc::now() > *exp {
                        return StatusCode::NOT_FOUND.into_response();
                    }
                }
                if !note.share_password.is_empty()
                    && query_password.as_deref() != Some(note.share_password.as_str())
                {
                    return StatusCode::UNAUTHORIZED.into_response();
                }
            }

            let file_path = state.paths.attachments_dir.join(&att.path);
            match tokio::fs::read(file_path).await {
                Ok(bytes) => (
                    StatusCode::OK,
                    [(axum::http::header::CONTENT_TYPE, att.mime.clone())],
                    Bytes::from(bytes),
                )
                    .into_response(),
                Err(err) => (
                    StatusCode::NOT_FOUND,
                    axum::Json(serde_json::json!({ "error": err.to_string() })),
                )
                    .into_response(),
            }
        }
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

fn extract_bearer(header: Option<&axum::http::HeaderValue>) -> Option<String> {
    let raw = header?.to_str().ok()?;
    let prefix = "Bearer ";
    if raw.starts_with(prefix) {
        Some(raw[prefix.len()..].to_string())
    } else {
        None
    }
}

pub async fn delete_file(
    State(state): State<Arc<LocalApiContext>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let repo = AttachmentRepository::new(
        state.data_state.db.pool.clone(),
        state.paths.attachments_dir.clone(),
    );
    match repo.get_by_id(id).await {
        Ok(Some(att)) => {
            let file_path = state.paths.attachments_dir.join(&att.path);
            let _ = tokio::fs::remove_file(&file_path).await;
            match repo.delete_attachment(id).await {
                Ok(Some(updated)) => {
                    let oplog = OplogRepository::new(state.data_state.db.pool.clone());
                    let _ = oplog
                        .append(
                            "attachment",
                            &updated.sync_id,
                            "delete",
                            &serde_json::to_string(&updated).unwrap_or_else(|_| "{}".to_string()),
                            &state.device_id,
                        )
                        .await;
                    let outbox = OutboxRepository::new(state.data_state.db.pool.clone());
                    let appended = outbox
                        .append(
                            "attachment",
                            &updated.sync_id,
                            "delete",
                            &serde_json::to_string(&updated).unwrap_or_else(|_| "{}".to_string()),
                            &state.device_id,
                        )
                        .await;
                    if appended.is_ok() {
                        crate::sync::scheduler::request_sync_soon();
                    }
                    (
                        StatusCode::OK,
                        axum::Json(serde_json::json!({ "status": 200 })),
                    )
                }
                Ok(None) => (
                    StatusCode::NOT_FOUND,
                    axum::Json(serde_json::json!({ "error": "Not found" })),
                ),
                Err(err) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json(serde_json::json!({ "error": err })),
                ),
            }
        }
        Ok(None) => (
            StatusCode::NOT_FOUND,
            axum::Json(serde_json::json!({ "error": "Not found" })),
        ),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            axum::Json(serde_json::json!({ "error": err })),
        ),
    }
}

pub async fn delete_by_path(
    State(state): State<Arc<LocalApiContext>>,
    axum::Json(payload): axum::Json<DeleteByPathRequest>,
) -> Response {
    let prefix = "/api/file/";
    if let Some(id) = payload.attachment_path.strip_prefix(prefix) {
        if let Ok(id) = id.parse::<i64>() {
            return delete_file(State(state), Path(id)).await.into_response();
        }
        return (
            StatusCode::BAD_REQUEST,
            axum::Json(serde_json::json!({ "error": "Invalid attachment id" })),
        )
            .into_response();
    }

    (
        StatusCode::BAD_REQUEST,
        axum::Json(serde_json::json!({ "error": "Unsupported attachment_path" })),
    )
        .into_response()
}

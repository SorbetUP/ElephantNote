use std::sync::Arc;

use axum::extract::{Json, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Deserialize;

use crate::local_db::settings::SettingsRepository;
use crate::local_db::oplog::OplogRepository;
use crate::local_db::outbox::OutboxRepository;
use super::LocalApiContext;

#[derive(Debug, Deserialize)]
pub struct SettingUpdateRequest {
    pub key: String,
    pub value: String,
}

pub async fn list_settings(State(state): State<Arc<LocalApiContext>>) -> Response {
    let repo = SettingsRepository::new(state.data_state.db.pool.clone());
    match repo.list_all().await {
        Ok(settings) => (StatusCode::OK, Json(settings)).into_response(),
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

pub async fn update_setting(
    State(state): State<Arc<LocalApiContext>>,
    Json(input): Json<SettingUpdateRequest>,
) -> Response {
    let repo = SettingsRepository::new(state.data_state.db.pool.clone());
    match repo.set(&input.key, &input.value, &state.device_id).await {
        Ok(setting) => {
            let oplog = OplogRepository::new(state.data_state.db.pool.clone());
            let _ = oplog
                .append(
                    "setting",
                    &setting.key,
                    "update",
                    &serde_json::to_string(&setting).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;
            let outbox = OutboxRepository::new(state.data_state.db.pool.clone());
            let appended = outbox
                .append(
                    "setting",
                    &setting.key,
                    "update",
                    &serde_json::to_string(&setting).unwrap_or_else(|_| "{}".to_string()),
                    &state.device_id,
                )
                .await;
            if appended.is_ok() {
                crate::sync::scheduler::request_sync_soon();
            }
            (StatusCode::OK, Json(setting)).into_response()
        }
        Err(err) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": err })),
        )
            .into_response(),
    }
}

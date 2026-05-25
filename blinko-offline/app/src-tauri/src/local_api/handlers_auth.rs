use std::sync::Arc;

use axum::extract::{Json, State};
use axum::http::{HeaderMap, StatusCode};
use axum::response::IntoResponse;
use serde::{Deserialize, Serialize};

use crate::local_db::settings::SettingsRepository;

use super::LocalApiContext;
use super::local_user;

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: Option<String>,
    pub password: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserInfo {
    pub id: String,
    pub name: String,
    pub role: String,
    pub nickname: String,
    pub image: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user: UserInfo,
    pub token: String,
}

pub async fn health() -> impl IntoResponse {
    Json(serde_json::json!({ "ok": true, "version": "local" }))
}

pub async fn login(
    State(state): State<Arc<LocalApiContext>>,
    Json(input): Json<LoginRequest>,
) -> impl IntoResponse {
    let repo = SettingsRepository::new(state.data_state.db.pool.clone());
    let record = match local_user::load_local_user(&repo).await {
        Ok(Some(record)) => record,
        Ok(None) => {
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "No local account found. Please sign up first."
                })),
            );
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": err })),
            );
        }
    };

    let username = input.username.unwrap_or_default();
    let password = input.password.unwrap_or_default();
    let username_match = username == record.name || username == record.nickname;
    if username_match && record.verify_password(&password) {
        let user = UserInfo {
            id: record.id.clone(),
            name: record.name.clone(),
            role: record.role.clone(),
            nickname: record.nickname.clone(),
            image: record.image.clone(),
        };
        let response = AuthResponse {
            user,
            token: state.token.clone(),
        };
        let payload = serde_json::to_value(&response)
            .unwrap_or_else(|_| serde_json::json!({ "error": "Failed to serialize response" }));
        (StatusCode::OK, Json(payload))
    } else {
        (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Invalid credentials" })),
        )
    }
}

pub async fn verify_2fa(
    State(state): State<Arc<LocalApiContext>>,
) -> impl IntoResponse {
    let repo = SettingsRepository::new(state.data_state.db.pool.clone());
    let record = match local_user::load_local_user(&repo).await {
        Ok(Some(record)) => record,
        Ok(None) => {
            return (
                StatusCode::CONFLICT,
                Json(serde_json::json!({
                    "error": "No local account found. Please sign up first."
                })),
            );
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": err })),
            );
        }
    };

    let user = UserInfo {
        id: record.id.clone(),
        name: record.name.clone(),
        role: record.role.clone(),
        nickname: record.nickname.clone(),
        image: record.image.clone(),
    };

    let response = AuthResponse {
        user,
        token: state.token.clone(),
    };
    let payload = serde_json::to_value(&response)
        .unwrap_or_else(|_| serde_json::json!({ "error": "Failed to serialize response" }));

    (StatusCode::OK, Json(payload))
}

pub async fn profile(
    State(state): State<Arc<LocalApiContext>>,
    headers: HeaderMap,
) -> impl IntoResponse {
    let token = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|raw| raw.strip_prefix("Bearer "))
        .map(|s| s.to_string());

    match token {
        Some(value) if value == state.token => {
            let repo = SettingsRepository::new(state.data_state.db.pool.clone());
            match local_user::load_local_user(&repo).await {
                Ok(Some(record)) => {
                    let user = UserInfo {
                        id: record.id,
                        name: record.name,
                        role: record.role,
                        nickname: record.nickname,
                        image: record.image,
                    };
                    (StatusCode::OK, Json(serde_json::json!({ "user": user })))
                }
                Ok(None) => (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({ "error": "No local account found" })),
                ),
                Err(err) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": err })),
                ),
            }
        }
        _ => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({ "error": "Not authenticated" }))),
    }
}

pub async fn logout() -> impl IntoResponse {
    (StatusCode::OK, Json(serde_json::json!({ "message": "Logout successful" })))
}

use std::sync::Arc;

use axum::body::Body;
use axum::extract::State;
use axum::http::{Request, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

use super::LocalApiContext;

pub async fn auth_middleware(
    State(state): State<Arc<LocalApiContext>>,
    req: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Allow OPTIONS requests (CORS preflight) to pass through without authentication.
    // Preflight requests never include credentials, so they must bypass auth checks.
    if req.method() == axum::http::Method::OPTIONS {
        return Ok(next.run(req).await);
    }

    let path = req.uri().path();
    if is_public_path(path) {
        return Ok(next.run(req).await);
    }

    // Support both Authorization header and `?token=...` query param.
    // Query token is needed for `<img src=...>` and similar cases where headers can't be set.
    let token = extract_bearer(req.headers().get(axum::http::header::AUTHORIZATION))
        .or_else(|| extract_query_token(req.uri()));
    match token {
        Some(value) if value == state.token => Ok(next.run(req).await),
        _ => Ok(StatusCode::UNAUTHORIZED.into_response()),
    }
}

fn is_public_path(path: &str) -> bool {
    if path.starts_with("/dist/js/") {
        return true;
    }
    if path.starts_with("/share/") {
        return true;
    }
    // Attachments are protected at the handler level (shared-note checks, expiry, password, etc.).
    // The middleware must allow these through so public share links can work without headers.
    if path.starts_with("/api/file/") || path.starts_with("/attachments/") {
        return true;
    }
    if path.starts_with("/api/trpc/users.canRegister")
        || path.starts_with("/api/trpc/users.register")
    {
        return true;
    }
    if path.starts_with("/api/trpc/notes.publicDetail") {
        return true;
    }
    matches!(
        path,
        "/health"
            | "/api/auth/login"
            | "/api/auth/local"
            | "/api/auth/logout"
            | "/api/auth/verify-2fa"
    )
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

fn extract_query_token(uri: &axum::http::Uri) -> Option<String> {
    let query = uri.query()?;
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=')?;
        if key == "token" && !value.is_empty() {
            // Local API tokens are UUID-like strings, so this is sufficient for now.
            return Some(value.to_string());
        }
    }
    None
}

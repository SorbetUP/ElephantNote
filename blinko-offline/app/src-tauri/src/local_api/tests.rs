#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use axum::{routing::get, Router};
    use reqwest::{multipart, Client, StatusCode};
    use serde_json::Value;
    use tokio::net::TcpListener;
    use uuid::Uuid;

    use crate::local_api::{build_context, local_user, start_local_api};
    use crate::local_db::conflicts::ConflictRepository;
    use crate::local_db::settings::SettingsRepository;
    use crate::local_db::LocalDb;
    use crate::local_runtime::config::{LocalApiConfig, LocalConfig, LocalMode};
    use crate::local_runtime::paths::RuntimePaths;
    use chrono::Utc;
    use sqlx::Row;

    fn temp_paths() -> RuntimePaths {
        let pid = std::process::id();
        // Tests run concurrently; make sure each test uses an isolated DB path.
        let run_id = Uuid::new_v4();
        let root = std::env::temp_dir().join(format!("blinko_local_api_test_{pid}_{run_id}"));
        RuntimePaths::from_root(root)
    }

    async fn start_mock_plugin_marketplace() -> String {
        let app = Router::new().route(
            "/index.json",
            get(|| async {
                axum::Json(serde_json::json!([{
                    "name": "mock-plugin",
                    "author": "test",
                    "url": "https://example.invalid/mock-plugin",
                    "version": "1.0.0",
                    "minAppVersion": "0.0.0",
                    "displayName": { "default": "Mock Plugin" },
                    "description": { "default": "A test plugin entry" }
                }]))
            }),
        );

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        format!("http://127.0.0.1:{port}/index.json")
    }

    async fn start_mock_sync_remote(valid_token: &str) -> String {
        let token = valid_token.to_string();
        let app = Router::new()
            .route("/health", get(|| async { axum::Json(serde_json::json!({ "ok": true })) }))
            .route(
                "/changes",
                get(move |headers: axum::http::HeaderMap| {
                    let token = token.clone();
                    async move {
                        let auth = headers
                            .get(axum::http::header::AUTHORIZATION)
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("");
                        if auth == format!("Bearer {token}") {
                            (
                                axum::http::StatusCode::OK,
                                axum::Json(serde_json::json!({ "cursor": "0", "ops": [], "reset": false })),
                            )
                        } else {
                            (
                                axum::http::StatusCode::UNAUTHORIZED,
                                axum::Json(serde_json::json!({ "error": "Unauthorized" })),
                            )
                        }
                    }
                }),
            );

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        tokio::spawn(async move {
            let _ = axum::serve(listener, app).await;
        });
        format!("http://127.0.0.1:{port}")
    }

    #[tokio::test]
    async fn vditor_highlight_css_assets_are_public_and_theme_specific() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let vditor_root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../server");
        assert!(
            vditor_root
                .join("vditor/js/highlight.js/styles/github-dark.min.css")
                .exists(),
            "expected vditor assets under {:?}",
            vditor_root
        );
        let context = build_context(paths, &config, db, data_state, Some(vditor_root), None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");
        let client = Client::new();

        let cases = [
            (
                "/dist/js/highlight.js/styles/github.min.css",
                ".hljs{color:#24292e;background:#fff}",
            ),
            (
                "/dist/js/highlight.js/styles/github-dark.min.css",
                ".hljs{color:#c9d1d9;background:#0d1117}",
            ),
        ];

        for (path, expected_snippet) in cases {
            let response = client
                .get(format!("{base}{path}"))
                .send()
                .await
                .unwrap();
            assert!(
                response.status().is_success(),
                "expected 2xx for {path}, got {}",
                response.status()
            );
            let css = response.text().await.unwrap();
            assert!(
                css.contains(expected_snippet),
                "asset {path} missing expected snippet"
            );
        }
    }

    #[tokio::test]
    async fn auth_signup_login_profile_and_logout_flow() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();

        // No local account yet: login should fail with 409.
        let login_no_user = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert_eq!(login_no_user.status(), 409);

        // Local signup is exposed via tRPC users.register (public in local mode).
        let can_register = client
            .get(format!("{base}/api/trpc/users.canRegister"))
            .send()
            .await
            .unwrap();
        assert!(can_register.status().is_success());
        let can_register_body: Value = can_register.json().await.unwrap();
        assert_eq!(
            can_register_body.pointer("/result/data"),
            Some(&Value::Bool(true))
        );

        let register_input = serde_json::json!({ "json": { "name": "a", "password": "b" } });
        let register = client
            .get(format!("{base}/api/trpc/users.register"))
            .query(&[("input", register_input.to_string())])
            .send()
            .await
            .unwrap();
        assert!(register.status().is_success());
        let register_body: Value = register.json().await.unwrap();
        assert_eq!(
            register_body.pointer("/result/data/ok"),
            Some(&Value::Bool(true))
        );

        let can_register_after = client
            .get(format!("{base}/api/trpc/users.canRegister"))
            .send()
            .await
            .unwrap();
        assert!(can_register_after.status().is_success());
        let can_register_after_body: Value = can_register_after.json().await.unwrap();
        assert_eq!(
            can_register_after_body.pointer("/result/data"),
            Some(&Value::Bool(false))
        );

        // Now login should succeed.
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();
        assert_eq!(token, "test-token");

        // Session check: profile should be accessible with Authorization header.
        let profile = client
            .get(format!("{base}/api/auth/profile"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(profile.status().is_success());
        let profile_body: Value = profile.json().await.unwrap();
        assert_eq!(
            profile_body.pointer("/user/name").and_then(|v| v.as_str()),
            Some("a")
        );

        // Sign out endpoint (does not revoke the static local token; client is expected to clear session).
        let logout = client
            .post(format!("{base}/api/auth/logout"))
            .send()
            .await
            .unwrap();
        assert!(logout.status().is_success());
        let logout_body: Value = logout.json().await.unwrap();
        assert_eq!(
            logout_body.get("message").and_then(|v| v.as_str()),
            Some("Logout successful")
        );
    }

    #[tokio::test]
    async fn sync_test_endpoint_validates_changes_auth() {
        let remote = start_mock_sync_remote("good-token").await;

        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Sync,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: true,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let context = build_context(paths, &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");
        let client = Client::new();

        let res = client
            .post(format!("{base}/sync/test"))
            .header(reqwest::header::AUTHORIZATION, "Bearer test-token")
            .json(&serde_json::json!({
                "remote_url": remote,
                "allow_insecure_http": true
            }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::BAD_REQUEST);

        let res = client
            .post(format!("{base}/sync/test"))
            .header(reqwest::header::AUTHORIZATION, "Bearer test-token")
            .json(&serde_json::json!({
                "remote_url": remote,
                "token": "bad-token",
                "allow_insecure_http": true
            }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::UNAUTHORIZED);

        let res = client
            .post(format!("{base}/sync/test"))
            .header(reqwest::header::AUTHORIZATION, "Bearer test-token")
            .json(&serde_json::json!({
                "remote_url": remote,
                "token": "good-token",
                "allow_insecure_http": true
            }))
            .send()
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);

        let body: Value = res.json().await.unwrap();
        assert_eq!(body["ok"], true);
    }

    #[tokio::test]
    async fn protected_routes_require_auth_token() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();

        // Protected endpoints should reject missing/invalid Authorization header.
        let notes_unauth = client.get(format!("{base}/api/notes")).send().await.unwrap();
        assert_eq!(notes_unauth.status(), StatusCode::UNAUTHORIZED);

        let profile_unauth = client
            .get(format!("{base}/api/auth/profile"))
            .send()
            .await
            .unwrap();
        assert_eq!(profile_unauth.status(), StatusCode::UNAUTHORIZED);

        let notes_list_trpc_unauth = client
            .get(format!("{base}/api/trpc/notes.list"))
            .send()
            .await
            .unwrap();
        assert_eq!(notes_list_trpc_unauth.status(), StatusCode::UNAUTHORIZED);

        let notes_bad_token = client
            .get(format!("{base}/api/notes"))
            .header("Authorization", "Bearer definitely-wrong-token")
            .send()
            .await
            .unwrap();
        assert_eq!(notes_bad_token.status(), StatusCode::UNAUTHORIZED);

        // After login, the same endpoints should be accessible.
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        let notes_ok = client
            .get(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(notes_ok.status().is_success());
    }

    #[tokio::test]
    async fn sync_status_reports_state_per_endpoint() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Sync,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![
                crate::local_runtime::config::RemoteEndpoint {
                    id: "a".to_string(),
                    url: "https://a.example".to_string(),
                    token: None,
                    last_sync_at: None,
                },
                crate::local_runtime::config::RemoteEndpoint {
                    id: "b".to_string(),
                    url: "https://b.example".to_string(),
                    token: None,
                    last_sync_at: None,
                },
            ],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let pool = context.data_state.db.pool.clone();

        let now = Utc::now();
        sqlx::query(
            "INSERT INTO sync_state (remote_id, last_pull_cursor, last_push_cursor, last_sync_at, status) VALUES (?, ?, ?, ?, ?) \
             ON CONFLICT(remote_id) DO UPDATE SET last_pull_cursor = excluded.last_pull_cursor, last_push_cursor = excluded.last_push_cursor, last_sync_at = excluded.last_sync_at, status = excluded.status",
        )
        .bind("a")
        .bind("10")
        .bind("9")
        .bind(now)
        .bind("ok")
        .execute(&pool)
        .await
        .unwrap();

        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");
        let client = Client::new();

        let status = client
            .get(format!("{base}/sync/status"))
            .header("Authorization", "Bearer test-token")
            .send()
            .await
            .unwrap();
        assert!(status.status().is_success());
        let body: Value = status.json().await.unwrap();

        assert_eq!(body.get("mode").and_then(|v| v.as_str()), Some("sync"));
        let endpoints = body.get("endpoints").and_then(|v| v.as_array()).unwrap();
        assert_eq!(endpoints.len(), 2);

        let a = endpoints
            .iter()
            .find(|v| v.get("id").and_then(|x| x.as_str()) == Some("a"))
            .unwrap();
        assert_eq!(a.get("last_pull_cursor").and_then(|v| v.as_str()), Some("10"));
        assert_eq!(a.get("status").and_then(|v| v.as_str()), Some("ok"));

        let b = endpoints
            .iter()
            .find(|v| v.get("id").and_then(|x| x.as_str()) == Some("b"))
            .unwrap();
        assert!(b.get("last_pull_cursor").unwrap().is_null());
    }

    #[tokio::test]
    async fn sync_settings_exposes_auto_sync_fields_and_persists_updates() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");
        let client = Client::new();

        let settings = client
            .get(format!("{base}/sync/settings"))
            .header("Authorization", "Bearer test-token")
            .send()
            .await
            .unwrap();
        assert!(settings.status().is_success());
        let body: Value = settings.json().await.unwrap();
        assert_eq!(body.get("sync_auto").and_then(|v| v.as_bool()), Some(true));
        assert_eq!(
            body.get("sync_interval_secs").and_then(|v| v.as_u64()),
            Some(300)
        );

        let put = client
            .put(format!("{base}/sync/settings"))
            .header("Authorization", "Bearer test-token")
            .json(&serde_json::json!({
                "sync_auto": false,
                "sync_interval_secs": 60,
                "remote_endpoints": [{ "id": "a", "url": "https://a.example", "token": null }]
            }))
            .send()
            .await
            .unwrap();
        assert!(put.status().is_success());
        let put_body: Value = put.json().await.unwrap();
        assert_eq!(put_body.get("sync_auto").and_then(|v| v.as_bool()), Some(false));
        assert_eq!(
            put_body.get("sync_interval_secs").and_then(|v| v.as_u64()),
            Some(60)
        );
        assert_eq!(put_body.get("mode").and_then(|v| v.as_str()), Some("sync"));
    }

    #[tokio::test]
    async fn conflicts_list_and_resolve_setting_conflict() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let pool = context.data_state.db.pool.clone();

        let repo = ConflictRepository::new(pool.clone());
        let now = Utc::now();
        let local_setting = crate::local_db::settings::Setting {
            key: "k".to_string(),
            value: "local".to_string(),
            updated_at: now,
            device_id: "device-test".to_string(),
        };
        let remote_setting = crate::local_db::settings::Setting {
            key: "k".to_string(),
            value: "remote".to_string(),
            updated_at: now,
            device_id: "remote-device".to_string(),
        };
        let created = repo
            .insert(
                "setting",
                "k",
                Some(&serde_json::to_string(&local_setting).unwrap()),
                Some(&serde_json::to_string(&remote_setting).unwrap()),
                None,
            )
            .await
            .unwrap();

        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");
        let client = Client::new();

        let list = client
            .get(format!("{base}/sync/conflicts?limit=50&offset=0"))
            .header("Authorization", "Bearer test-token")
            .send()
            .await
            .unwrap();
        assert!(list.status().is_success());
        let list_body: Value = list.json().await.unwrap();
        assert_eq!(
            list_body.get("unresolved_count").and_then(|v| v.as_i64()),
            Some(1)
        );

        let resolve = client
            .post(format!("{base}/sync/conflicts/{}/resolve", created.id))
            .header("Authorization", "Bearer test-token")
            .json(&serde_json::json!({ "choice": "remote" }))
            .send()
            .await
            .unwrap();
        assert!(resolve.status().is_success());

        let settings_repo = SettingsRepository::new(pool.clone());
        let stored = settings_repo.get("k").await.unwrap().unwrap();
        assert_eq!(stored.value, "remote");

        let list2 = client
            .get(format!("{base}/sync/conflicts?limit=50&offset=0"))
            .header("Authorization", "Bearer test-token")
            .send()
            .await
            .unwrap();
        assert!(list2.status().is_success());
        let list2_body: Value = list2.json().await.unwrap();
        assert_eq!(
            list2_body.get("unresolved_count").and_then(|v| v.as_i64()),
            Some(0)
        );
    }

    #[tokio::test]
    async fn task_reset_my_data_clears_notes_tags_attachments_settings_but_keeps_local_user() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");
        let client = Client::new();

        // Create a local user via register endpoint (stores `local.user` in settings).
        let register_input = serde_json::json!({ "json": { "name": "a", "password": "b" } });
        let register = client
            .get(format!("{base}/api/trpc/users.register"))
            .query(&[("input", register_input.to_string())])
            .send()
            .await
            .unwrap();
        assert!(register.status().is_success());

        // Seed DB with a note, tag, relation, and an attachment file/row.
        let pool = context.data_state.db.pool.clone();
        let now = Utc::now().to_rfc3339();

        let note_sync = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO notes (sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, 0, 0, 0, 0, 0)")
            .bind(&note_sync)
            .bind("t")
            .bind("c")
            .bind(&now)
            .bind(&now)
            .bind("device-test")
            .execute(&pool)
            .await
            .unwrap();
        let note_id: i64 = sqlx::query("SELECT id FROM notes WHERE sync_id = ?")
            .bind(&note_sync)
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);

        sqlx::query("INSERT INTO tags (name, icon, sort_order, created_at, updated_at) VALUES (?, NULL, 0, ?, ?)")
            .bind("tag1")
            .bind(&now)
            .bind(&now)
            .execute(&pool)
            .await
            .unwrap();
        let tag_id: i64 = sqlx::query("SELECT id FROM tags WHERE name = ?")
            .bind("tag1")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);
        sqlx::query("INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?)")
            .bind(note_id)
            .bind(tag_id)
            .execute(&pool)
            .await
            .unwrap();

        // Extra setting that should be wiped.
        sqlx::query("INSERT INTO settings (key, value, updated_at, device_id) VALUES (?, ?, ?, ?)")
            .bind("ui.theme")
            .bind("dark")
            .bind(&now)
            .bind("device-test")
            .execute(&pool)
            .await
            .unwrap();

        // Attachment file + row.
        let stored_name = "test_attachment.bin";
        let file_path = paths.attachments_dir.join(stored_name);
        tokio::fs::write(&file_path, b"hello").await.unwrap();
        let att_sync = Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO attachments (sync_id, note_id, filename, mime, size, sha256, path, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)")
            .bind(&att_sync)
            .bind(note_id)
            .bind("f.bin")
            .bind("application/octet-stream")
            .bind(5_i64)
            .bind("deadbeef")
            .bind(stored_name)
            .bind(&now)
            .bind(&now)
            .execute(&pool)
            .await
            .unwrap();

        // Sanity: local.user exists and counts are non-zero before reset.
        let settings_repo = SettingsRepository::new(pool.clone());
        assert!(settings_repo.get("local.user").await.unwrap().is_some());
        let before_notes: i64 = sqlx::query("SELECT COUNT(*) FROM notes")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);
        assert!(before_notes > 0);

        // Call reset.
        let reset_input = serde_json::json!({ "json": { "confirmPhrase": "RESET" } });
        let reset = client
            .get(format!("{base}/api/trpc/task.resetMyData"))
            .query(&[("input", reset_input.to_string())])
            .header("Authorization", "Bearer test-token")
            .send()
            .await
            .unwrap();
        assert!(reset.status().is_success());
        let reset_body: Value = reset.json().await.unwrap();
        assert_eq!(
            reset_body.pointer("/result/data/ok"),
            Some(&Value::Bool(true))
        );

        // Verify DB cleared.
        let after_notes: i64 = sqlx::query("SELECT COUNT(*) FROM notes")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);
        let after_tags: i64 = sqlx::query("SELECT COUNT(*) FROM tags")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);
        let after_note_tags: i64 = sqlx::query("SELECT COUNT(*) FROM note_tags")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);
        let after_attachments: i64 = sqlx::query("SELECT COUNT(*) FROM attachments")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);
        assert_eq!(after_notes, 0);
        assert_eq!(after_tags, 0);
        assert_eq!(after_note_tags, 0);
        assert_eq!(after_attachments, 0);

        // Settings reset but local user preserved.
        assert!(settings_repo.get("local.user").await.unwrap().is_some());
        let other_settings: i64 = sqlx::query("SELECT COUNT(*) FROM settings WHERE key != 'local.user'")
            .fetch_one(&pool)
            .await
            .unwrap()
            .get(0);
        assert_eq!(other_settings, 0);

        // Attachment file removed.
        assert!(!file_path.exists());
    }

    #[tokio::test]
    async fn health_and_notes_flow() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let plugin_marketplace_url = start_mock_plugin_marketplace().await;
        let context = build_context(
            paths.clone(),
            &config,
            db,
            data_state,
            None,
            Some(plugin_marketplace_url),
        )
        .unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let health = client.get(format!("{base}/health")).send().await.unwrap();
        assert!(health.status().is_success());

        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        let marketplace = client
            .get(format!("{base}/api/trpc/plugin.getAllPlugins"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(marketplace.status().is_success());
        let marketplace_body: Value = marketplace.json().await.unwrap();
        let entries = marketplace_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(!entries.is_empty());

        let note = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "hello", "content": "world" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note.status(), 201);

        let list = client
            .get(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(list.status().is_success());

        let file_bytes = b"hello-world".to_vec();
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(file_bytes.clone())
                .file_name("hello.txt")
                .mime_str("text/plain")
                .unwrap(),
        );
        let upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let upload_body: Value = upload.json().await.unwrap();
        let file_path = upload_body
            .get("filePath")
            .and_then(|v| v.as_str())
            .unwrap();

        let download = client
            .get(format!("{base}{file_path}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(download.status().is_success());
        let downloaded = download.bytes().await.unwrap();
        assert_eq!(downloaded.as_ref(), file_bytes.as_slice());

        // Regression: `<img src=...>` cannot send Authorization headers, so allow `?token=...`.
        let download_by_query = client
            .get(format!("{base}{file_path}?token={token}"))
            .send()
            .await
            .unwrap();
        assert!(download_by_query.status().is_success());
        let downloaded_by_query = download_by_query.bytes().await.unwrap();
        assert_eq!(downloaded_by_query.as_ref(), file_bytes.as_slice());

        // Regression: overwriting an attachment must keep the same `/api/file/:id` path (no duplicates)
        // while changing the bytes on disk.
        let overwrite_bytes = b"hello-overwrite".to_vec();
        let overwrite_form = multipart::Form::new()
            .text("attachment_path", file_path.to_string())
            .part(
                "file",
                multipart::Part::bytes(overwrite_bytes.clone())
                    .file_name("hello.txt")
                    .mime_str("text/plain")
                    .unwrap(),
            );
        let overwrite = client
            .post(format!("{base}/api/file/overwrite"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(overwrite_form)
            .send()
            .await
            .unwrap();
        assert!(overwrite.status().is_success());
        let overwrite_body: Value = overwrite.json().await.unwrap();
        let overwritten_path = overwrite_body
            .get("filePath")
            .and_then(|v| v.as_str())
            .unwrap();
        assert_eq!(overwritten_path, file_path);

        let overwritten_download = client
            .get(format!("{base}{file_path}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(overwritten_download.status().is_success());
        let overwritten_bytes = overwritten_download.bytes().await.unwrap();
        assert_eq!(overwritten_bytes.as_ref(), overwrite_bytes.as_slice());

        // Regression: large uploads should work (default body limit is too small for PDFs).
        let big_bytes = vec![b'a'; 3 * 1024 * 1024]; // 3 MiB
        let big_form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(big_bytes.clone())
                .file_name("big.pdf")
                .mime_str("application/pdf")
                .unwrap(),
        );
        let big_upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(big_form)
            .send()
            .await
            .unwrap();
        assert!(big_upload.status().is_success());
    }

    #[tokio::test]
    async fn overwrite_endpoint_does_not_create_new_attachment_row() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state = crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db.clone(), data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        let count0: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM attachments WHERE deleted_at IS NULL")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(count0, 0);

        let bytes1 = b"one".to_vec();
        let form1 = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(bytes1)
                .file_name("a.txt")
                .mime_str("text/plain")
                .unwrap(),
        );
        let upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form1)
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let upload_body: Value = upload.json().await.unwrap();
        let file_path = upload_body.get("filePath").and_then(|v| v.as_str()).unwrap().to_string();

        let count1: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM attachments WHERE deleted_at IS NULL")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(count1, 1);

        let bytes2 = b"two".to_vec();
        let form2 = multipart::Form::new()
            .text("attachment_path", file_path.clone())
            .part(
                "file",
                multipart::Part::bytes(bytes2.clone())
                    .file_name("a.txt")
                    .mime_str("text/plain")
                    .unwrap(),
            );
        let overwrite = client
            .post(format!("{base}/api/file/overwrite"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form2)
            .send()
            .await
            .unwrap();
        assert!(overwrite.status().is_success());
        let overwrite_body: Value = overwrite.json().await.unwrap();
        let overwritten_path = overwrite_body.get("filePath").and_then(|v| v.as_str()).unwrap();
        assert_eq!(overwritten_path, file_path);

        let count2: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM attachments WHERE deleted_at IS NULL")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(count2, 1);

        let download = client
            .get(format!("{base}{file_path}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(download.status().is_success());
        let downloaded = download.bytes().await.unwrap();
        assert_eq!(downloaded.as_ref(), bytes2.as_slice());
    }

    #[tokio::test]
    async fn overwrite_endpoint_requires_attachment_path() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state = crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        let bytes = b"no-path".to_vec();
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(bytes)
                .file_name("a.txt")
                .mime_str("text/plain")
                .unwrap(),
        );
        let overwrite = client
            .post(format!("{base}/api/file/overwrite"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert_eq!(overwrite.status(), 400);
    }

    #[tokio::test]
    async fn trpc_notes_list_filters_by_tag_id() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        // Create two notes with different tags.
        let note1 = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "n1", "content": "hello #Cuisine" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note1.status(), 201);

        let note2 = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "n2", "content": "hello #Jeux" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note2.status(), 201);

        // Fetch tags and find the "Cuisine" tag id.
        let tags = client
            .get(format!("{base}/api/trpc/tags.list"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(tags.status().is_success());
        let tags_body: Value = tags.json().await.unwrap();
        let tags_arr = tags_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        let cuisine_id = tags_arr
            .iter()
            .find(|t| t.get("name").and_then(|v| v.as_str()) == Some("Cuisine"))
            .and_then(|t| t.get("id").and_then(|v| v.as_i64()))
            .unwrap();

        // Call notes.list with tagId and expect only the matching note.
        let input = serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "type": -1, "tagId": cuisine_id } });
        let list = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list.status().is_success());
        let list_body: Value = list.json().await.unwrap();
        let notes_arr = list_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(notes_arr.len(), 1);
        let content = notes_arr[0]
            .get("content")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        assert!(content.contains("#Cuisine"));
    }

    #[tokio::test]
    async fn share_note_and_public_detail_flow() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        // Upload a file and attach it to the note.
        let file_bytes = b"share-file".to_vec();
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(file_bytes.clone())
                .file_name("share.txt")
                .mime_str("text/plain")
                .unwrap(),
        );
        let upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let upload_body: Value = upload.json().await.unwrap();
        let file_path = upload_body
            .get("filePath")
            .and_then(|v| v.as_str())
            .unwrap();

        let note = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "share", "content": "note" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note.status(), 201);
        let note_body: Value = note.json().await.unwrap();
        let note_id = note_body.get("id").and_then(|v| v.as_i64()).unwrap();

        // Attach the uploaded file via tRPC upsert.
        let upsert = client
            .post(format!("{base}/api/trpc/notes.upsert"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": {
                    "id": note_id,
                    "attachments": [{ "path": file_path }]
                }
            }))
            .send()
            .await
            .unwrap();
        assert!(upsert.status().is_success());

        // Before share: downloading without auth should be rejected.
        let private_download = client
            .get(format!("{base}{file_path}"))
            .send()
            .await
            .unwrap();
        assert_eq!(private_download.status(), 401);

        // Share the note (public, no password).
        let share = client
            .post(format!("{base}/api/trpc/notes.shareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note_id, "isCancel": false, "password": "", "expireAt": null }
            }))
            .send()
            .await
            .unwrap();
        assert!(share.status().is_success());
        let share_body: Value = share.json().await.unwrap();
        let share_id = share_body
            .pointer("/result/data/shareEncryptedUrl")
            .and_then(|v| v.as_str())
            .unwrap();
        assert!(!share_id.is_empty());

        // Share page should render HTML (public).
        let share_page = client
            .get(format!("{base}/share/{share_id}"))
            .send()
            .await
            .unwrap();
        assert!(share_page.status().is_success());
        let share_page_body = share_page.text().await.unwrap();
        assert!(share_page_body.contains("Blinko Share"));
        assert!(share_page_body.contains(share_id));

        // Public detail should be accessible without auth.
        let public_detail = client
            .post(format!("{base}/api/trpc/notes.publicDetail"))
            .json(&serde_json::json!({ "json": { "shareEncryptedUrl": share_id } }))
            .send()
            .await
            .unwrap();
        assert!(public_detail.status().is_success());
        let public_detail_body: Value = public_detail.json().await.unwrap();
        let has_password = public_detail_body
            .pointer("/result/data/hasPassword")
            .and_then(|v| v.as_bool())
            .unwrap();
        assert!(!has_password);
        let returned_id = public_detail_body
            .pointer("/result/data/data/shareEncryptedUrl")
            .and_then(|v| v.as_str())
            .unwrap();
        assert_eq!(returned_id, share_id);

        // After share: downloading without auth should work (attachment is linked to a shared note).
        let public_download = client
            .get(format!("{base}{file_path}"))
            .send()
            .await
            .unwrap();
        assert!(public_download.status().is_success());
        let downloaded = public_download.bytes().await.unwrap();
        assert_eq!(downloaded.as_ref(), file_bytes.as_slice());

        // Password-protected share behavior.
        let note2 = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "share2", "content": "note2" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note2.status(), 201);
        let note2_body: Value = note2.json().await.unwrap();
        let note2_id = note2_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let share2 = client
            .post(format!("{base}/api/trpc/notes.shareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note2_id, "isCancel": false, "password": "123456", "expireAt": null }
            }))
            .send()
            .await
            .unwrap();
        assert!(share2.status().is_success());
        let share2_body: Value = share2.json().await.unwrap();
        let share2_id = share2_body
            .pointer("/result/data/shareEncryptedUrl")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();

        let public_detail_missing_pw = client
            .post(format!("{base}/api/trpc/notes.publicDetail"))
            .json(&serde_json::json!({ "json": { "shareEncryptedUrl": share2_id.clone() } }))
            .send()
            .await
            .unwrap();
        assert!(public_detail_missing_pw.status().is_success());
        let body_missing_pw: Value = public_detail_missing_pw.json().await.unwrap();
        assert_eq!(
            body_missing_pw
                .pointer("/result/data/hasPassword")
                .and_then(|v| v.as_bool()),
            Some(true)
        );
        assert!(body_missing_pw
            .pointer("/result/data/data")
            .unwrap()
            .is_null());

        let public_detail_with_pw = client
            .post(format!("{base}/api/trpc/notes.publicDetail"))
            .json(&serde_json::json!({ "json": { "shareEncryptedUrl": share2_id, "password": "123456" } }))
            .send()
            .await
            .unwrap();
        assert!(public_detail_with_pw.status().is_success());
        let body_with_pw: Value = public_detail_with_pw.json().await.unwrap();
        assert!(body_with_pw.pointer("/result/data/data").is_some());
    }

    #[tokio::test]
    async fn share_cancel_revokes_public_access() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state = crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        let note = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "share", "content": "note" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note.status(), 201);
        let note_body: Value = note.json().await.unwrap();
        let note_id = note_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let share = client
            .post(format!("{base}/api/trpc/notes.shareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note_id, "isCancel": false, "password": "", "expireAt": null }
            }))
            .send()
            .await
            .unwrap();
        assert!(share.status().is_success());
        let share_body: Value = share.json().await.unwrap();
        let share_id = share_body
            .pointer("/result/data/shareEncryptedUrl")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();

        let public_detail = client
            .post(format!("{base}/api/trpc/notes.publicDetail"))
            .json(&serde_json::json!({ "json": { "shareEncryptedUrl": share_id.clone() } }))
            .send()
            .await
            .unwrap();
        assert!(public_detail.status().is_success());
        let public_detail_body: Value = public_detail.json().await.unwrap();
        assert!(public_detail_body.pointer("/result/data/data").is_some());

        let cancel = client
            .post(format!("{base}/api/trpc/notes.shareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note_id, "isCancel": true }
            }))
            .send()
            .await
            .unwrap();
        assert!(cancel.status().is_success());

        let public_detail_after_cancel = client
            .post(format!("{base}/api/trpc/notes.publicDetail"))
            .json(&serde_json::json!({ "json": { "shareEncryptedUrl": share_id } }))
            .send()
            .await
            .unwrap();
        assert!(public_detail_after_cancel.status().is_success());
        let after_body: Value = public_detail_after_cancel.json().await.unwrap();
        assert!(after_body.pointer("/result/data/data").unwrap().is_null());
    }

    #[tokio::test]
    async fn share_expiry_is_enforced_for_public_detail_and_public_files() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state = crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        // Upload + note + attach
        let file_bytes = b"expired-file".to_vec();
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(file_bytes.clone())
                .file_name("expired.txt")
                .mime_str("text/plain")
                .unwrap(),
        );
        let upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let upload_body: Value = upload.json().await.unwrap();
        let file_path = upload_body.get("filePath").and_then(|v| v.as_str()).unwrap();

        let note = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "expired", "content": "note" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note.status(), 201);
        let note_body: Value = note.json().await.unwrap();
        let note_id = note_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let upsert = client
            .post(format!("{base}/api/trpc/notes.upsert"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": {
                    "id": note_id,
                    "attachments": [{ "path": file_path }]
                }
            }))
            .send()
            .await
            .unwrap();
        assert!(upsert.status().is_success());

        let expire_at = (chrono::Utc::now() - chrono::Duration::minutes(5)).to_rfc3339();
        let share = client
            .post(format!("{base}/api/trpc/notes.shareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note_id, "isCancel": false, "password": "", "expireAt": expire_at }
            }))
            .send()
            .await
            .unwrap();
        assert!(share.status().is_success());
        let share_body: Value = share.json().await.unwrap();
        let share_id = share_body
            .pointer("/result/data/shareEncryptedUrl")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();

        // Public detail => expired marker
        let public_detail = client
            .post(format!("{base}/api/trpc/notes.publicDetail"))
            .json(&serde_json::json!({ "json": { "shareEncryptedUrl": share_id } }))
            .send()
            .await
            .unwrap();
        assert!(public_detail.status().is_success());
        let body: Value = public_detail.json().await.unwrap();
        assert_eq!(
            body.pointer("/result/data/error").and_then(|v| v.as_str()),
            Some("expired")
        );

        // Public file download should be blocked for expired shares.
        let download_public = client.get(format!("{base}{file_path}")).send().await.unwrap();
        assert_eq!(download_public.status(), 404);

        // Authenticated download still works.
        let download_authed = client
            .get(format!("{base}{file_path}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(download_authed.status().is_success());
        let downloaded = download_authed.bytes().await.unwrap();
        assert_eq!(downloaded.as_ref(), file_bytes.as_slice());
    }

    #[tokio::test]
    async fn password_protected_share_requires_password_for_public_files() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state = crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        let file_bytes = b"pw-file".to_vec();
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(file_bytes.clone())
                .file_name("pw.txt")
                .mime_str("text/plain")
                .unwrap(),
        );
        let upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let upload_body: Value = upload.json().await.unwrap();
        let file_path = upload_body.get("filePath").and_then(|v| v.as_str()).unwrap();

        let note = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "pw", "content": "note" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note.status(), 201);
        let note_body: Value = note.json().await.unwrap();
        let note_id = note_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let upsert = client
            .post(format!("{base}/api/trpc/notes.upsert"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": {
                    "id": note_id,
                    "attachments": [{ "path": file_path }]
                }
            }))
            .send()
            .await
            .unwrap();
        assert!(upsert.status().is_success());

        let share = client
            .post(format!("{base}/api/trpc/notes.shareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note_id, "isCancel": false, "password": "123456", "expireAt": null }
            }))
            .send()
            .await
            .unwrap();
        assert!(share.status().is_success());
        let share_body: Value = share.json().await.unwrap();
        let share_id = share_body
            .pointer("/result/data/shareEncryptedUrl")
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();

        // Public detail without password => gated.
        let public_detail_missing_pw = client
            .post(format!("{base}/api/trpc/notes.publicDetail"))
            .json(&serde_json::json!({ "json": { "shareEncryptedUrl": share_id.clone() } }))
            .send()
            .await
            .unwrap();
        assert!(public_detail_missing_pw.status().is_success());
        let body_missing: Value = public_detail_missing_pw.json().await.unwrap();
        assert_eq!(
            body_missing.pointer("/result/data/hasPassword").and_then(|v| v.as_bool()),
            Some(true)
        );
        assert!(body_missing.pointer("/result/data/data").unwrap().is_null());

        // Public file download without password should be blocked.
        let download_public = client.get(format!("{base}{file_path}")).send().await.unwrap();
        assert_eq!(download_public.status(), 401);

        // Wrong password blocked.
        let download_wrong = client
            .get(format!("{base}{file_path}?password=000000"))
            .send()
            .await
            .unwrap();
        assert_eq!(download_wrong.status(), 401);

        // Correct password works.
        let download_ok = client
            .get(format!("{base}{file_path}?password=123456"))
            .send()
            .await
            .unwrap();
        assert!(download_ok.status().is_success());
        let downloaded = download_ok.bytes().await.unwrap();
        assert_eq!(downloaded.as_ref(), file_bytes.as_slice());

        // Share page is public and includes the share id.
        let share_page = client
            .get(format!("{base}/share/{share_id}?password=123456"))
            .send()
            .await
            .unwrap();
        assert!(share_page.status().is_success());
        assert_eq!(
            share_page
                .headers()
                .get(axum::http::header::CACHE_CONTROL)
                .and_then(|v| v.to_str().ok()),
            Some("no-store, max-age=0")
        );
        let share_page_body = share_page.text().await.unwrap();
        assert!(share_page_body.contains("Blinko Share"));
        // Password hint from the query should be embedded in the page so attachment URLs can
        // append it when needed.
        assert!(share_page_body.contains("let password = \"123456\""));
    }

    #[tokio::test]
    async fn share_cancel_revokes_public_files() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state = crate::local_runtime::LocalDataState::new(
            db.clone(),
            config.clone(),
            paths.clone(),
        );
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        let file_bytes = b"cancel-file".to_vec();
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(file_bytes.clone())
                .file_name("cancel.txt")
                .mime_str("text/plain")
                .unwrap(),
        );
        let upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let upload_body: Value = upload.json().await.unwrap();
        let file_path = upload_body.get("filePath").and_then(|v| v.as_str()).unwrap();

        let note = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "cancel", "content": "note" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note.status(), 201);
        let note_body: Value = note.json().await.unwrap();
        let note_id = note_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let upsert = client
            .post(format!("{base}/api/trpc/notes.upsert"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note_id, "attachments": [{ "path": file_path }] }
            }))
            .send()
            .await
            .unwrap();
        assert!(upsert.status().is_success());

        let share = client
            .post(format!("{base}/api/trpc/notes.shareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note_id, "isCancel": false, "password": "", "expireAt": null }
            }))
            .send()
            .await
            .unwrap();
        assert!(share.status().is_success());

        // Public download should work while shared.
        let download_ok = client.get(format!("{base}{file_path}")).send().await.unwrap();
        assert!(download_ok.status().is_success());
        let downloaded = download_ok.bytes().await.unwrap();
        assert_eq!(downloaded.as_ref(), file_bytes.as_slice());

        // Cancel share and confirm public files are revoked too.
        let cancel = client
            .post(format!("{base}/api/trpc/notes.shareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "json": { "id": note_id, "isCancel": true } }))
            .send()
            .await
            .unwrap();
        assert!(cancel.status().is_success());

        let download_after_cancel = client.get(format!("{base}{file_path}")).send().await.unwrap();
        assert_eq!(download_after_cancel.status(), 401);
    }

    #[tokio::test]
    async fn notes_crud_edit_archive_trash_restore_pin_and_delete() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context =
            build_context(paths.clone(), &config, db.clone(), data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        // Note A: edit + archive + pin + trash + restore (trash toggle should not set deleted_at).
        let note_a = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "a1", "content": "c1" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note_a.status(), 201);
        let note_a_body: Value = note_a.json().await.unwrap();
        let note_a_id = note_a_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let edit_a = client
            .put(format!("{base}/api/notes/{note_a_id}"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "a2", "content": "c2" }))
            .send()
            .await
            .unwrap();
        assert!(edit_a.status().is_success());
        let edit_a_body: Value = edit_a.json().await.unwrap();
        assert_eq!(edit_a_body.get("title").and_then(|v| v.as_str()), Some("a2"));
        assert_eq!(edit_a_body.get("content").and_then(|v| v.as_str()), Some("c2"));

        let archive_a = client
            .put(format!("{base}/api/notes/{note_a_id}"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "isArchived": true }))
            .send()
            .await
            .unwrap();
        assert!(archive_a.status().is_success());
        let archive_a_body: Value = archive_a.json().await.unwrap();
        assert_eq!(
            archive_a_body.get("is_archived").and_then(|v| v.as_bool()),
            Some(true)
        );

        let pin_a = client
            .put(format!("{base}/api/notes/{note_a_id}"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "isTop": true }))
            .send()
            .await
            .unwrap();
        assert!(pin_a.status().is_success());
        let pin_a_body: Value = pin_a.json().await.unwrap();
        assert_eq!(pin_a_body.get("is_top").and_then(|v| v.as_bool()), Some(true));

        // Trash toggle (isRecycle) should not set deleted_at.
        let trash_a = client
            .put(format!("{base}/api/notes/{note_a_id}"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "isRecycle": true }))
            .send()
            .await
            .unwrap();
        assert!(trash_a.status().is_success());
        let trash_a_body: Value = trash_a.json().await.unwrap();
        assert_eq!(
            trash_a_body.get("is_recycle").and_then(|v| v.as_bool()),
            Some(true)
        );
        assert!(trash_a_body.get("deleted_at").map(|v| v.is_null()).unwrap_or(true));

        // Verify tRPC notes.list filtering for recycle bin.
        let input_trash =
            serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": true, "type": -1 } });
        let list_trash = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_trash.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_trash.status().is_success());
        let list_trash_body: Value = list_trash.json().await.unwrap();
        let trash_items = list_trash_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(trash_items
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note_a_id)));

        // Restore from trash.
        let restore_a = client
            .put(format!("{base}/api/notes/{note_a_id}"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "isRecycle": false }))
            .send()
            .await
            .unwrap();
        assert!(restore_a.status().is_success());
        let restore_a_body: Value = restore_a.json().await.unwrap();
        assert_eq!(
            restore_a_body.get("is_recycle").and_then(|v| v.as_bool()),
            Some(false)
        );
        assert!(restore_a_body.get("deleted_at").map(|v| v.is_null()).unwrap_or(true));

        let input_not_trash =
            serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "type": -1 } });
        let list_not_trash = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_not_trash.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_not_trash.status().is_success());
        let list_not_trash_body: Value = list_not_trash.json().await.unwrap();
        let not_trash_items = list_not_trash_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(not_trash_items
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note_a_id)));

        // Verify archived filtering works (note A is archived).
        let input_archived = serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "isArchived": true, "type": -1 } });
        let list_archived = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_archived.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_archived.status().is_success());
        let list_archived_body: Value = list_archived.json().await.unwrap();
        let archived_items = list_archived_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(archived_items
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note_a_id)));

        let input_not_archived = serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "isArchived": false, "type": -1 } });
        let list_not_archived = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_not_archived.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_not_archived.status().is_success());
        let list_not_archived_body: Value = list_not_archived.json().await.unwrap();
        let not_archived_items = list_not_archived_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(!not_archived_items
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note_a_id)));

        // Note B: delete should set deleted_at and remove it from the REST list endpoint.
        let note_b = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "b1", "content": "d1" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note_b.status(), 201);
        let note_b_body: Value = note_b.json().await.unwrap();
        let note_b_id = note_b_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let delete_b = client
            .delete(format!("{base}/api/notes/{note_b_id}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(delete_b.status().is_success());
        let delete_b_body: Value = delete_b.json().await.unwrap();
        assert_eq!(
            delete_b_body.get("is_recycle").and_then(|v| v.as_bool()),
            Some(true)
        );
        assert!(
            delete_b_body
                .get("deleted_at")
                .map(|v| v.is_string())
                .unwrap_or(false)
        );

        let rest_list = client
            .get(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(rest_list.status().is_success());
        let rest_list_body: Value = rest_list.json().await.unwrap();
        let rest_items = rest_list_body
            .get("data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(!rest_items
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note_b_id)));
    }

    #[tokio::test]
    async fn trpc_notes_detail_list_by_ids_type_and_search() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        // Create notes with different types (blinko=0, note=1, todo=2).
        let note1 = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "Alpha Note", "content": "hello world", "type": 0 }))
            .send()
            .await
            .unwrap();
        assert_eq!(note1.status(), 201);
        let note1_body: Value = note1.json().await.unwrap();
        let note1_id = note1_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let note2 = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "Beta", "content": "other text", "type": 1 }))
            .send()
            .await
            .unwrap();
        assert_eq!(note2.status(), 201);
        let note2_body: Value = note2.json().await.unwrap();
        let note2_id = note2_body.get("id").and_then(|v| v.as_i64()).unwrap();

        let note3 = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "Todo Item", "content": "- [ ] do thing", "type": 2 }))
            .send()
            .await
            .unwrap();
        assert_eq!(note3.status(), 201);
        let note3_body: Value = note3.json().await.unwrap();
        let note3_id = note3_body.get("id").and_then(|v| v.as_i64()).unwrap();

        // Upload an attachment and link it to note2 via notes.upsert.
        let file_bytes = b"report-bytes".to_vec();
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(file_bytes)
                .file_name("Report.PDF")
                .mime_str("application/pdf")
                .unwrap(),
        );
        let upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let upload_body: Value = upload.json().await.unwrap();
        let file_path = upload_body.get("filePath").and_then(|v| v.as_str()).unwrap();

        let upsert = client
            .post(format!("{base}/api/trpc/notes.upsert"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note2_id, "attachments": [{ "path": file_path }] }
            }))
            .send()
            .await
            .unwrap();
        assert!(upsert.status().is_success());

        // notes.detail includes linked attachments.
        let detail = client
            .post(format!("{base}/api/trpc/notes.detail"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "json": { "id": note2_id } }))
            .send()
            .await
            .unwrap();
        assert!(detail.status().is_success());
        let detail_body: Value = detail.json().await.unwrap();
        let detail_note = detail_body.pointer("/result/data").unwrap();
        assert_eq!(
            detail_note.get("id").and_then(|v| v.as_i64()),
            Some(note2_id)
        );
        let attachments = detail_note.get("attachments").and_then(|v| v.as_array()).unwrap();
        assert!(attachments.iter().any(|att| {
            att.get("noteId").and_then(|v| v.as_i64()) == Some(note2_id)
                && att.get("name").and_then(|v| v.as_str()) == Some("Report.PDF")
        }));

        // listByIds returns all requested notes.
        let list_by_ids = client
            .post(format!("{base}/api/trpc/notes.listByIds"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "json": { "ids": [note1_id, note2_id, note3_id] } }))
            .send()
            .await
            .unwrap();
        assert!(list_by_ids.status().is_success());
        let list_by_ids_body: Value = list_by_ids.json().await.unwrap();
        let arr = list_by_ids_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(arr.len(), 3);

        // list by type
        let input_type_1 =
            serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "type": 1 } });
        let list_type_1 = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_type_1.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_type_1.status().is_success());
        let list_type_1_body: Value = list_type_1.json().await.unwrap();
        let items_type_1 = list_type_1_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(items_type_1.len(), 1);
        assert_eq!(
            items_type_1[0].get("id").and_then(|v| v.as_i64()),
            Some(note2_id)
        );

        let input_type_2 =
            serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "type": 2 } });
        let list_type_2 = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_type_2.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_type_2.status().is_success());
        let list_type_2_body: Value = list_type_2.json().await.unwrap();
        let items_type_2 = list_type_2_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(items_type_2.len(), 1);
        assert_eq!(
            items_type_2[0].get("id").and_then(|v| v.as_i64()),
            Some(note3_id)
        );

        // type=-1 returns all types.
        let input_all_types =
            serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "type": -1 } });
        let list_all_types = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_all_types.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_all_types.status().is_success());
        let list_all_types_body: Value = list_all_types.json().await.unwrap();
        let items_all_types = list_all_types_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(items_all_types
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note1_id)));
        assert!(items_all_types
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note2_id)));
        assert!(items_all_types
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note3_id)));

        // Search by title (case-insensitive + prefix stripping).
        let input_search_title =
            serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "type": -1, "searchText": "#ALPHA" } });
        let list_search_title = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_search_title.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_search_title.status().is_success());
        let list_search_title_body: Value = list_search_title.json().await.unwrap();
        let items_search_title = list_search_title_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(items_search_title.len(), 1);
        assert_eq!(
            items_search_title[0].get("id").and_then(|v| v.as_i64()),
            Some(note1_id)
        );

        // Search by content.
        let input_search_content =
            serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "type": -1, "searchText": "WORLD" } });
        let list_search_content = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_search_content.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_search_content.status().is_success());
        let list_search_content_body: Value = list_search_content.json().await.unwrap();
        let items_search_content = list_search_content_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(items_search_content
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note1_id)));

        // Search by attachment match (filename/path) should include note2.
        let input_search_attachment =
            serde_json::json!({ "json": { "page": 1, "size": 30, "isRecycle": false, "type": -1, "searchText": "@report" } });
        let list_search_attachment = client
            .get(format!("{base}/api/trpc/notes.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_search_attachment.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_search_attachment.status().is_success());
        let list_search_attachment_body: Value = list_search_attachment.json().await.unwrap();
        let items_search_attachment = list_search_attachment_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(items_search_attachment
            .iter()
            .any(|n| n.get("id").and_then(|v| v.as_i64()) == Some(note2_id)));
    }

    #[tokio::test]
    async fn trpc_attachments_list_search_pagination_and_note_id() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        let note = client
            .post(format!("{base}/api/notes"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "title": "attachments", "content": "note" }))
            .send()
            .await
            .unwrap();
        assert_eq!(note.status(), 201);
        let note_body: Value = note.json().await.unwrap();
        let note_id = note_body.get("id").and_then(|v| v.as_i64()).unwrap();

        async fn upload_named(
            client: &Client,
            base: &str,
            token: &str,
            name: &str,
        ) -> String {
            let form = multipart::Form::new().part(
                "file",
                multipart::Part::bytes(vec![b'x'; 10])
                    .file_name(name.to_string())
                    .mime_str("application/octet-stream")
                    .unwrap(),
            );
            let upload = client
                .post(format!("{base}/api/file/upload"))
                .header("Authorization", format!("Bearer {token}"))
                .multipart(form)
                .send()
                .await
                .unwrap();
            assert!(upload.status().is_success());
            let upload_body: Value = upload.json().await.unwrap();
            upload_body
                .get("filePath")
                .and_then(|v| v.as_str())
                .unwrap()
                .to_string()
        }

        let _f1 = upload_named(&client, &base, token, "cat.png").await;
        let f2 = upload_named(&client, &base, token, "DOG.PNG").await;
        let f3 = upload_named(&client, &base, token, "zebra.txt").await;

        // Attach f2 to the note.
        let upsert = client
            .post(format!("{base}/api/trpc/notes.upsert"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({
                "json": { "id": note_id, "attachments": [{ "path": f2 }, { "path": f3 }] }
            }))
            .send()
            .await
            .unwrap();
        assert!(upsert.status().is_success());

        // Pagination (3 total attachments): size=2 => page1=2, page2=1.
        let input_page_1 =
            serde_json::json!({ "json": { "page": 1, "size": 2, "searchText": "" } });
        let list_page_1 = client
            .get(format!("{base}/api/trpc/attachments.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_page_1.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_page_1.status().is_success());
        let list_page_1_body: Value = list_page_1.json().await.unwrap();
        let items_page_1 = list_page_1_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(items_page_1.len(), 2);

        let input_page_2 =
            serde_json::json!({ "json": { "page": 2, "size": 2, "searchText": "" } });
        let list_page_2 = client
            .get(format!("{base}/api/trpc/attachments.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_page_2.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_page_2.status().is_success());
        let list_page_2_body: Value = list_page_2.json().await.unwrap();
        let items_page_2 = list_page_2_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(items_page_2.len(), 1);

        // Search filter should match case-insensitively and strip prefixes.
        let input_search =
            serde_json::json!({ "json": { "page": 1, "size": 30, "searchText": "#dog" } });
        let list_search = client
            .get(format!("{base}/api/trpc/attachments.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_search.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_search.status().is_success());
        let list_search_body: Value = list_search.json().await.unwrap();
        let items_search = list_search_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(items_search.len(), 1);
        assert_eq!(
            items_search[0].get("name").and_then(|v| v.as_str()),
            Some("DOG.PNG")
        );
        assert_eq!(
            items_search[0].get("noteId").and_then(|v| v.as_i64()),
            Some(note_id)
        );

        // Unattached attachment should have null noteId.
        let input_all =
            serde_json::json!({ "json": { "page": 1, "size": 30, "searchText": "" } });
        let list_all = client
            .get(format!("{base}/api/trpc/attachments.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_all.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_all.status().is_success());
        let list_all_body: Value = list_all.json().await.unwrap();
        let items_all = list_all_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert_eq!(items_all.len(), 3);

        let has_unattached = items_all.iter().any(|att| {
            att.get("name").and_then(|v| v.as_str()) == Some("cat.png")
                && att.get("noteId").map(|v| v.is_null()).unwrap_or(false)
        });
        assert!(has_unattached);
    }

    #[tokio::test]
    async fn resources_delete_attachment_removes_from_list_and_blocks_download() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        // Upload.
        let bytes = b"delete-me".to_vec();
        let form = multipart::Form::new().part(
            "file",
            multipart::Part::bytes(bytes.clone())
                .file_name("deleteme.txt")
                .mime_str("text/plain")
                .unwrap(),
        );
        let upload = client
            .post(format!("{base}/api/file/upload"))
            .header("Authorization", format!("Bearer {token}"))
            .multipart(form)
            .send()
            .await
            .unwrap();
        assert!(upload.status().is_success());
        let upload_body: Value = upload.json().await.unwrap();
        let file_path = upload_body.get("filePath").and_then(|v| v.as_str()).unwrap();
        let id = file_path
            .strip_prefix("/api/file/")
            .and_then(|s| s.parse::<i64>().ok())
            .unwrap();

        // attachments.list should include it with the expected fields (preview metadata).
        let input_all =
            serde_json::json!({ "json": { "page": 1, "size": 30, "searchText": "" } });
        let list_all = client
            .get(format!("{base}/api/trpc/attachments.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_all.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_all.status().is_success());
        let list_all_body: Value = list_all.json().await.unwrap();
        let items_all = list_all_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        let item = items_all
            .iter()
            .find(|att| att.get("id").and_then(|v| v.as_i64()) == Some(id))
            .unwrap();
        assert_eq!(item.get("name").and_then(|v| v.as_str()), Some("deleteme.txt"));
        assert_eq!(
            item.get("path").and_then(|v| v.as_str()).unwrap(),
            format!("/api/file/{id}")
        );
        assert_eq!(item.get("type").and_then(|v| v.as_str()), Some("text/plain"));
        assert_eq!(item.get("size").and_then(|v| v.as_i64()), Some(bytes.len() as i64));

        // Resource "detail" open: the returned path is fetchable with auth and returns bytes.
        let download = client
            .get(format!("{base}/api/file/{id}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(download.status().is_success());
        let downloaded = download.bytes().await.unwrap();
        assert_eq!(downloaded.as_ref(), bytes.as_slice());

        // Delete via REST endpoint.
        let del = client
            .delete(format!("{base}/api/file/{id}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert!(del.status().is_success());

        // After delete, attachments.list should not include it.
        let list_all2 = client
            .get(format!("{base}/api/trpc/attachments.list"))
            .header("Authorization", format!("Bearer {token}"))
            .query(&[("input", input_all.to_string())])
            .send()
            .await
            .unwrap();
        assert!(list_all2.status().is_success());
        let list_all2_body: Value = list_all2.json().await.unwrap();
        let items_all2 = list_all2_body
            .pointer("/result/data")
            .and_then(|v| v.as_array())
            .unwrap();
        assert!(!items_all2
            .iter()
            .any(|att| att.get("id").and_then(|v| v.as_i64()) == Some(id)));

        // Download now returns 404 (record still exists but is deleted_at; download handler returns 404).
        let download_after = client
            .get(format!("{base}/api/file/{id}"))
            .header("Authorization", format!("Bearer {token}"))
            .send()
            .await
            .unwrap();
        assert_eq!(download_after.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn trpc_internal_share_note_is_stubbed_ok() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let config = LocalConfig {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: Some("device-test".to_string()),
            remote_endpoints: vec![],
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig {
                port: None,
                enabled: true,
                token: Some("test-token".to_string()),
            },
        };

        let data_state =
            crate::local_runtime::LocalDataState::new(db.clone(), config.clone(), paths.clone());
        let settings_repo = SettingsRepository::new(db.pool.clone());
        local_user::create_local_user(&settings_repo, "device-test", "a", "b")
            .await
            .unwrap();
        let context = build_context(paths.clone(), &config, db, data_state, None, None).unwrap();
        let port = start_local_api(Arc::clone(&context)).await.unwrap();
        let base = format!("http://127.0.0.1:{port}");

        let client = Client::new();
        let login = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": "a", "password": "b" }))
            .send()
            .await
            .unwrap();
        assert!(login.status().is_success());
        let login_body: Value = login.json().await.unwrap();
        let token = login_body.get("token").and_then(|v| v.as_str()).unwrap();

        // internalShareNote is currently a stub in local mode (returns { ok: true }).
        let res = client
            .post(format!("{base}/api/trpc/internalShareNote"))
            .header("Authorization", format!("Bearer {token}"))
            .json(&serde_json::json!({ "json": { "id": 123 } }))
            .send()
            .await
            .unwrap();
        assert!(res.status().is_success());
        let body: Value = res.json().await.unwrap();
        let ok = body.pointer("/result/data/ok").and_then(|v| v.as_bool());
        assert_eq!(ok, Some(true));
    }
}

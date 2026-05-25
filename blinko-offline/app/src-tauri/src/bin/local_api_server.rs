use std::sync::Arc;

use app_lib::local_api::{build_context, start_local_api};
use app_lib::local_api::local_user;
use app_lib::local_db::LocalDb;
use app_lib::local_db::settings::SettingsRepository;
use app_lib::local_runtime::config::{save_config, LocalConfig};
use app_lib::local_runtime::paths::RuntimePaths;
use app_lib::local_runtime::LocalDataState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::env::temp_dir().join("blinko_local_api_server");
    // Keep this dev/test server isolated and deterministic.
    // A previous run may have left a DB behind; wipe it to avoid contaminating tests.
    if root.exists() {
        let _ = std::fs::remove_dir_all(&root);
    }
    let paths = RuntimePaths::from_root(root);
    paths.ensure_dirs()?;

    let mut config = LocalConfig::default();
    if config.local_api.token.is_none() {
        config.local_api.token = Some("test-token".to_string());
    }
    if config.device_id.is_none() {
        config.device_id = Some("local-api-server".to_string());
    }
    save_config(&paths, &config)?;

    let db = LocalDb::connect(&paths).await.map_err(|e| format!("{e}"))?;
    let data_state = LocalDataState::new(db.clone(), config.clone(), paths.clone());

    // This binary is meant for dev/tests; make sure there's a local user so `/api/auth/login`
    // works without going through the onboarding UI.
    let device_id = config
        .device_id
        .clone()
        .unwrap_or_else(|| "local-api-server".to_string());
    let settings_repo = SettingsRepository::new(db.pool.clone());
    if local_user::load_local_user(&settings_repo)
        .await
        .map_err(|e| format!("{e}"))?
        .is_none()
    {
        local_user::create_local_user(&settings_repo, &device_id, "local", "local")
            .await
            .map_err(|e| format!("{e}"))?;
    }

    let context = build_context(paths.clone(), &config, db, data_state, None, None)?;
    let port = start_local_api(Arc::clone(&context)).await?;

    println!("LOCAL_API_URL=http://127.0.0.1:{port}");

    std::future::pending::<()>().await;
    Ok(())
}

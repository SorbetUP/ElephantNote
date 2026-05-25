use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::AppHandle;

pub mod config;
pub mod logging;
pub mod paths;

use config::{load_config, save_config, LocalConfig, LocalMode};
use crate::local_db::LocalDb;
use uuid::Uuid;
use paths::RuntimePaths;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LocalRuntimeInfo {
    pub mode: LocalMode,
    pub api_port: Option<u16>,
    pub paths: RuntimePaths,
}

impl LocalRuntimeInfo {
    pub fn new(paths: RuntimePaths, config: &LocalConfig) -> Self {
        Self {
            mode: config.mode.clone(),
            api_port: config.local_api.port,
            paths,
        }
    }
}

pub struct LocalRuntimeState {
    inner: Mutex<LocalRuntimeInfo>,
}

impl LocalRuntimeState {
    pub fn new(info: LocalRuntimeInfo) -> Self {
        Self {
            inner: Mutex::new(info),
        }
    }

    pub fn set_api_port(&self, port: u16) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.api_port = Some(port);
        }
    }

    pub fn snapshot(&self) -> LocalRuntimeInfo {
        self.inner
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_else(|_| LocalRuntimeInfo {
                mode: LocalMode::Local,
                api_port: None,
                paths: RuntimePaths::from_root("./".into()),
            })
    }
}

pub fn init_local_runtime(app: &AppHandle) -> Result<LocalRuntimeInfo, String> {
    logging::init();
    let paths = RuntimePaths::from_app(app)?;
    paths.ensure_dirs()?;
    let mut config = load_config(&paths)?;
    if config.local_api.token.is_none() {
        config.local_api.token = Some(Uuid::new_v4().to_string());
    }
    if config.device_id.is_none() {
        config.device_id = Some(Uuid::new_v4().to_string());
    }
    save_config(&paths, &config)?;
    Ok(LocalRuntimeInfo::new(paths, &config))
}

#[derive(Clone)]
pub struct LocalDataState {
    pub db: LocalDb,
    pub config: std::sync::Arc<Mutex<LocalConfig>>,
    pub paths: RuntimePaths,
}

impl LocalDataState {
    pub fn new(db: LocalDb, config: LocalConfig, paths: RuntimePaths) -> Self {
        Self { db, config: std::sync::Arc::new(Mutex::new(config)), paths }
    }

    pub fn config_snapshot(&self) -> LocalConfig {
        self.config
            .lock()
            .map(|guard| guard.clone())
            .unwrap_or_else(|_| LocalConfig::default())
    }

    pub fn update_config(&self, config: LocalConfig) {
        if let Ok(mut guard) = self.config.lock() {
            *guard = config;
        }
    }
}

#[tauri::command]
pub fn get_local_runtime_info(state: tauri::State<'_, LocalRuntimeState>) -> LocalRuntimeInfo {
    state.snapshot()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_root() -> PathBuf {
        let pid = std::process::id();
        let nonce = uuid::Uuid::new_v4();
        std::env::temp_dir().join(format!("blinko_local_runtime_test_{pid}_{nonce}"))
    }

    #[test]
    fn creates_directories() {
        let root = temp_root();
        let paths = RuntimePaths::from_root(root.clone());
        paths.ensure_dirs().unwrap();
        assert!(paths.root.exists());
        assert!(paths.attachments_dir.exists());
        assert!(paths.logs_dir.exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn read_write_config() {
        let root = temp_root();
        let paths = RuntimePaths::from_root(root.clone());
        paths.ensure_dirs().unwrap();

        let config = LocalConfig::default();
        save_config(&paths, &config).unwrap();
        let loaded = load_config(&paths).unwrap();
        assert_eq!(loaded.schema_version, 1);

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn migrates_legacy_config() {
        let root = temp_root();
        let paths = RuntimePaths::from_root(root.clone());
        paths.ensure_dirs().unwrap();

        let legacy = serde_json::json!({
            "schema_version": 0,
            "mode": "local",
            "device_id": "legacy-device",
            "remote_endpoints": []
        });
        fs::write(&paths.config_path, legacy.to_string()).unwrap();

        let loaded = load_config(&paths).unwrap();
        assert_eq!(loaded.schema_version, 1);
        assert!(loaded.local_api.enabled);

        let _ = fs::remove_dir_all(root);
    }
}

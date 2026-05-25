use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::path::{PathBuf};
use tauri::AppHandle;
use tauri::Manager;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RuntimePaths {
    pub root: PathBuf,
    pub db_path: PathBuf,
    pub attachments_dir: PathBuf,
    pub config_path: PathBuf,
    pub logs_dir: PathBuf,
}

impl RuntimePaths {
    pub fn from_app(app: &AppHandle) -> Result<Self, String> {
        if let Ok(override_root) = env::var("BLINKO_APP_DATA_DIR") {
            return Ok(Self::from_root(PathBuf::from(override_root)));
        }

        let app_data_dir = match app.path().app_data_dir() {
            Ok(dir) => dir,
            Err(err) => {
                eprintln!("Failed to get app data directory, using temp dir: {err}");
                env::temp_dir()
            }
        };
        Ok(Self::from_root(app_data_dir.join("blinko")))
    }

    pub fn from_root(root: PathBuf) -> Self {
        let db_path = root.join("blinko.sqlite");
        let attachments_dir = root.join("attachments");
        let config_path = root.join("local_config.json");
        let logs_dir = root.join("logs");
        Self {
            root,
            db_path,
            attachments_dir,
            config_path,
            logs_dir,
        }
    }

    pub fn ensure_dirs(&self) -> Result<(), String> {
        for dir in [&self.root, &self.attachments_dir, &self.logs_dir] {
            if !dir.exists() {
                fs::create_dir_all(dir).map_err(|e| format!("Failed to create dir {:?}: {e}", dir))?;
            }
        }
        Ok(())
    }
}

pub fn app_data_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(RuntimePaths::from_app(app)?.root)
}

pub fn attachments_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(RuntimePaths::from_app(app)?.attachments_dir)
}

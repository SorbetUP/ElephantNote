use serde::{Deserialize, Serialize};
use std::fs;

use super::paths::RuntimePaths;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LocalMode {
    Local,
    Remote,
    Sync,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RemoteEndpoint {
    pub id: String,
    pub url: String,
    pub token: Option<String>,
    pub last_sync_at: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct LocalApiConfig {
    pub port: Option<u16>,
    pub enabled: bool,
    pub token: Option<String>,
}

impl Default for LocalApiConfig {
    fn default() -> Self {
        Self {
            port: None,
            enabled: true,
            token: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default)]
pub struct LocalConfig {
    pub schema_version: u32,
    pub mode: LocalMode,
    pub device_id: Option<String>,
    pub remote_endpoints: Vec<RemoteEndpoint>,
    pub allow_insecure_http: bool,
    pub sync_auto: bool,
    pub sync_interval_secs: u64,
    pub local_api: LocalApiConfig,
}

impl Default for LocalConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            mode: LocalMode::Local,
            device_id: None,
            remote_endpoints: Vec::new(),
            allow_insecure_http: false,
            sync_auto: true,
            sync_interval_secs: 300,
            local_api: LocalApiConfig::default(),
        }
    }
}

pub fn load_config(paths: &RuntimePaths) -> Result<LocalConfig, String> {
    if !paths.config_path.exists() {
        return Ok(LocalConfig::default());
    }

    let raw = fs::read_to_string(&paths.config_path)
        .map_err(|e| format!("Failed to read config: {e}"))?;

    let parsed: LocalConfig = serde_json::from_str(&raw)
        .map_err(|e| format!("Failed to parse config: {e}"))?;

    Ok(migrate_config(parsed))
}

pub fn save_config(paths: &RuntimePaths, config: &LocalConfig) -> Result<(), String> {
    let data = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {e}"))?;
    fs::write(&paths.config_path, data)
        .map_err(|e| format!("Failed to write config: {e}"))?;
    Ok(())
}

fn migrate_config(config: LocalConfig) -> LocalConfig {
    let mut out = config;

    if out.schema_version == 0 {
        out.schema_version = 1;
    }

    // Deprecate legacy remote-only mode: sync is now derived from the presence of endpoints.
    // - Remote + endpoints => Sync
    // - Remote + no endpoints => Local
    if matches!(out.mode, LocalMode::Remote) {
        out.mode = if out.remote_endpoints.is_empty() {
            LocalMode::Local
        } else {
            LocalMode::Sync
        };
    }

    // Normalize mode based on whether any remote endpoints are configured.
    out.mode = if out.remote_endpoints.is_empty() {
        LocalMode::Local
    } else {
        LocalMode::Sync
    };

    // Fill defaults for new sync controls if missing/invalid in older configs.
    if out.sync_interval_secs == 0 {
        out.sync_interval_secs = 300;
    }

    out
}

#[cfg(test)]
mod tests {
    use super::{migrate_config, LocalConfig, LocalMode, RemoteEndpoint};

    fn endpoint(id: &str) -> RemoteEndpoint {
        RemoteEndpoint {
            id: id.to_string(),
            url: "https://example.invalid".to_string(),
            token: None,
            last_sync_at: None,
        }
    }

    #[test]
    fn remote_mode_with_endpoints_migrates_to_sync() {
        let mut cfg = LocalConfig::default();
        cfg.mode = LocalMode::Remote;
        cfg.remote_endpoints = vec![endpoint("a")];

        let migrated = migrate_config(cfg);
        assert!(matches!(migrated.mode, LocalMode::Sync));
    }

    #[test]
    fn remote_mode_without_endpoints_migrates_to_local() {
        let mut cfg = LocalConfig::default();
        cfg.mode = LocalMode::Remote;
        cfg.remote_endpoints = vec![];

        let migrated = migrate_config(cfg);
        assert!(matches!(migrated.mode, LocalMode::Local));
    }

    #[test]
    fn zero_interval_is_normalized_to_default() {
        let mut cfg = LocalConfig::default();
        cfg.sync_interval_secs = 0;

        let migrated = migrate_config(cfg);
        assert_eq!(migrated.sync_interval_secs, 300);
    }
}

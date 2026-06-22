use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

use super::types::{active_vault, next_vault_id, VaultConfig, VaultDescriptor};

pub const CONFIG_FILE: &str = "tauri-vaults.json";

type R<T> = Result<T, String>;

pub fn now_string() -> String {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

pub fn basename(path: &Path) -> String {
  path.file_name().and_then(|name| name.to_str()).unwrap_or("Personal").to_string()
}

pub fn normalize_absolute_path(path: impl AsRef<str>) -> String {
  path.as_ref().replace('\\', "/")
}

pub fn config_path(app: &AppHandle) -> R<PathBuf> {
  let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
  Ok(dir.join(CONFIG_FILE))
}

pub fn read_config(app: &AppHandle) -> R<VaultConfig> {
  let path = config_path(app)?;
  if !path.exists() {
    return Ok(VaultConfig::default());
  }
  let raw = fs::read_to_string(path).map_err(|e| e.to_string())?;
  Ok(serde_json::from_str(&raw).unwrap_or_default())
}

pub fn write_config(app: &AppHandle, config: &VaultConfig) -> R<()> {
  let raw = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
  fs::write(config_path(app)?, raw).map_err(|e| e.to_string())
}

pub fn get_active_vault(app: &AppHandle) -> R<VaultDescriptor> {
  active_vault(&read_config(app)?).ok_or_else(|| "No active ElephantNote vault.".to_string())
}

pub fn upsert_vault(config: &mut VaultConfig, vault_path: String) -> VaultDescriptor {
  let normalized_path = normalize_absolute_path(vault_path);
  if let Some(index) = config.vaults.iter().position(|vault| vault.path == normalized_path) {
    config.vaults[index].last_opened_at = now_string();
    config.active_vault_id = Some(config.vaults[index].id.clone());
    return config.vaults[index].clone();
  }

  let name = basename(Path::new(&normalized_path));
  let id = next_vault_id(&config.vaults, &name);
  let vault = VaultDescriptor {
    id: id.clone(),
    name,
    path: normalized_path,
    icon: String::new(),
    last_opened_at: now_string(),
  };
  config.active_vault_id = Some(id);
  config.vaults.push(vault.clone());
  vault
}

pub fn set_active_vault(config: &mut VaultConfig, vault_id: String) {
  config.active_vault_id = Some(vault_id);
}

pub fn set_vault_icon(config: &mut VaultConfig, vault_id: &str, icon: String) {
  for vault in &mut config.vaults {
    if vault.id == vault_id {
      vault.icon = icon.clone();
    }
  }
}

pub fn set_vault_name(config: &mut VaultConfig, vault_id: &str, name: String) {
  let name = name.trim().to_string();
  if name.is_empty() {
    return;
  }
  for vault in &mut config.vaults {
    if vault.id == vault_id {
      vault.name = name.clone();
    }
  }
}

pub fn remove_vault(config: &mut VaultConfig, vault_id: &str) {
  config.vaults.retain(|vault| vault.id != vault_id);
  if config.active_vault_id.as_deref() == Some(vault_id) {
    config.active_vault_id = config.vaults.first().map(|vault| vault.id.clone());
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn upserts_new_vault() {
    let mut config = VaultConfig::default();
    let vault = upsert_vault(&mut config, "Work".to_string());
    assert_eq!(vault.name, "Work");
    assert_eq!(config.active_vault_id, Some(vault.id));
    assert_eq!(config.vaults.len(), 1);
  }

  #[test]
  fn upsert_existing_vault_keeps_single_record() {
    let mut config = VaultConfig::default();
    let first = upsert_vault(&mut config, "Work".to_string());
    let second = upsert_vault(&mut config, "Work".to_string());
    assert_eq!(first.id, second.id);
    assert_eq!(config.vaults.len(), 1);
  }

  #[test]
  fn removing_active_vault_selects_next_one() {
    let mut config = VaultConfig::default();
    let a = upsert_vault(&mut config, "A".to_string());
    let b = upsert_vault(&mut config, "B".to_string());
    set_active_vault(&mut config, a.id.clone());
    remove_vault(&mut config, &a.id);
    assert_eq!(config.active_vault_id, Some(b.id));
  }
}

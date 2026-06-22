use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultConfig {
  pub vaults: Vec<VaultDescriptor>,
  pub active_vault_id: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDescriptor {
  pub id: String,
  pub name: String,
  pub path: String,
  pub icon: String,
}

pub fn slug_id(value: &str) -> String {
  let mut out = String::new();
  let mut dash = false;
  for ch in value.trim().to_lowercase().chars() {
    if ch.is_ascii_alphanumeric() {
      out.push(ch);
      dash = false;
    } else if !dash {
      out.push('-');
      dash = true;
    }
  }
  let out = out.trim_matches('-').to_string();
  if out.is_empty() { "vault".to_string() } else { out }
}

pub fn next_vault_id(existing: &[VaultDescriptor], name: &str) -> String {
  let base = slug_id(name);
  if !existing.iter().any(|vault| vault.id == base) {
    return base;
  }
  let mut index = 2;
  loop {
    let candidate = format!("{}-{}", base, index);
    if !existing.iter().any(|vault| vault.id == candidate) {
      return candidate;
    }
    index += 1;
  }
}

pub fn active_vault(config: &VaultConfig) -> Option<VaultDescriptor> {
  let active_id = config.active_vault_id.as_ref()?;
  config.vaults.iter().find(|vault| &vault.id == active_id).cloned()
}

pub fn workspace_json(vault_name: &str) -> Value {
  json!({
    "version": 1,
    "vaultName": vault_name,
    "sidebar": [{
      "id": "getting-started",
      "title": "Getting started",
      "type": "folder",
      "path": "Getting Started",
      "collapsed": false
    }]
  })
}

pub fn metadata_file(name: &str) -> Value {
  match name {
    "calendar" => json!({ "version": 1, "events": [] }),
    "sources" => json!({ "version": 1, "sources": [] }),
    "wiki" => json!({ "version": 1, "records": [] }),
    _ => json!({ "version": 1, "entries": [] }),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn creates_stable_slug_ids() {
    assert_eq!(slug_id("My Vault"), "my-vault");
    assert_eq!(slug_id("!!!"), "vault");
  }

  #[test]
  fn creates_unique_vault_ids() {
    let existing = vec![VaultDescriptor { id: "work".into(), name: "Work".into(), path: "work".into(), icon: String::new() }];
    assert_eq!(next_vault_id(&existing, "Work"), "work-2");
  }

  #[test]
  fn returns_active_vault() {
    let config = VaultConfig {
      vaults: vec![VaultDescriptor { id: "a".into(), name: "A".into(), path: "a".into(), icon: String::new() }],
      active_vault_id: Some("a".into()),
    };
    assert_eq!(active_vault(&config).unwrap().name, "A");
  }

  #[test]
  fn creates_workspace_json() {
    let workspace = workspace_json("Personal");
    assert_eq!(workspace["vaultName"], "Personal");
    assert_eq!(workspace["sidebar"][0]["path"], "Getting Started");
  }

  #[test]
  fn creates_metadata_files() {
    assert!(metadata_file("calendar")["events"].is_array());
    assert!(metadata_file("sources")["sources"].is_array());
    assert!(metadata_file("wiki")["records"].is_array());
  }
}

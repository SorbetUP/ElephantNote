mod manifest;
mod plan;

use iroh::{endpoint::presets, Endpoint};
use iroh_mdns_address_lookup::MdnsAddressLookup;
use manifest::{scan_vault, VaultManifest};
use plan::build_plan;
use serde_json::{json, Value};
use std::{env, path::PathBuf};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};

const PROTOCOL: &str = "elephant-addon-service-v1";

struct SyncService {
  endpoint: Option<Endpoint>,
  vault_dir: PathBuf,
}

impl SyncService {
  fn from_environment() -> Result<Self, String> {
    let vault_dir = env::var_os("ELEPHANT_VAULT_DIR")
      .map(PathBuf::from)
      .ok_or_else(|| "ELEPHANT_VAULT_DIR is unavailable for the Sync addon service".to_string())?;
    Ok(Self {
      endpoint: None,
      vault_dir,
    })
  }

  #[cfg(test)]
  fn with_vault_dir(vault_dir: PathBuf) -> Self {
    Self {
      endpoint: None,
      vault_dir,
    }
  }

  async fn ensure_endpoint(&mut self) -> Result<&Endpoint, String> {
    if self.endpoint.is_none() {
      let endpoint = Endpoint::bind(presets::N0)
        .await
        .map_err(|error| format!("Failed to bind Iroh endpoint: {error}"))?;
      let discovery = MdnsAddressLookup::builder()
        .build(endpoint.id())
        .map_err(|error| format!("Failed to initialize mDNS discovery: {error}"))?;
      endpoint
        .address_lookup()
        .map_err(|error| format!("Iroh address lookup is unavailable: {error}"))?
        .add(discovery);
      self.endpoint = Some(endpoint);
    }
    self.endpoint
      .as_ref()
      .ok_or_else(|| "Iroh endpoint was not initialized".to_string())
  }

  async fn status(&mut self) -> Result<Value, String> {
    let endpoint = self.ensure_endpoint().await?;
    Ok(json!({
      "running": true,
      "endpointId": endpoint.id().to_string(),
      "transport": "iroh",
      "discovery": "mdns",
      "owner": "elephant.sync",
      "vaultDir": self.vault_dir,
      "ownedCapabilities": ["endpoint", "manifest", "plan"]
    }))
  }

  fn scan(&self) -> Result<Value, String> {
    let manifest = scan_vault(&self.vault_dir)?;
    Ok(json!({
      "owner": "elephant.sync",
      "vaultDir": self.vault_dir,
      "files": manifest.files.len(),
      "directories": manifest.directories.len(),
      "manifest": manifest
    }))
  }

  async fn plan(&mut self, params: Value) -> Result<Value, String> {
    let local = match params.get("localManifest").cloned() {
      Some(value) if !value.is_null() => serde_json::from_value::<VaultManifest>(value)
        .map_err(|error| format!("Invalid local Sync manifest: {error}"))?,
      _ => scan_vault(&self.vault_dir)?,
    };
    let remote = params
      .get("remoteManifest")
      .cloned()
      .ok_or_else(|| "remoteManifest is required for package-owned Sync planning".to_string())
      .and_then(|value| {
        serde_json::from_value::<VaultManifest>(value)
          .map_err(|error| format!("Invalid remote Sync manifest: {error}"))
      })?;
    let baseline = params
      .get("baseline")
      .cloned()
      .filter(|value| !value.is_null())
      .map(serde_json::from_value::<VaultManifest>)
      .transpose()
      .map_err(|error| format!("Invalid Sync baseline: {error}"))?
      .unwrap_or_default();
    let local_id = match params.get("localId").and_then(Value::as_str).filter(|value| !value.is_empty()) {
      Some(value) => value.to_string(),
      None => self.ensure_endpoint().await?.id().to_string(),
    };
    let remote_id = params
      .get("remoteId")
      .and_then(Value::as_str)
      .filter(|value| !value.is_empty())
      .unwrap_or("remote")
      .to_string();
    let plan = build_plan(&local, &remote, &baseline, &local_id, &remote_id);
    Ok(json!({
      "owner": "elephant.sync",
      "localId": local_id,
      "remoteId": remote_id,
      "summary": {
        "uploads": plan.uploads.len(),
        "downloads": plan.downloads.len(),
        "deletes": plan.delete_files_local.len() + plan.delete_files_remote.len(),
        "conflicts": plan.conflicts.len()
      },
      "plan": plan
    }))
  }

  async fn stop(&mut self) {
    if let Some(endpoint) = self.endpoint.take() {
      endpoint.close().await;
    }
  }
}

fn success(id: u64, result: Value) -> Value {
  json!({
    "protocol": PROTOCOL,
    "id": id,
    "ok": true,
    "result": result
  })
}

fn failure(id: u64, message: impl Into<String>) -> Value {
  json!({
    "protocol": PROTOCOL,
    "id": id,
    "ok": false,
    "error": { "message": message.into() }
  })
}

async fn handle(service: &mut SyncService, method: &str, params: Value) -> Result<Value, String> {
  match method {
    "service.start" | "sync.status" | "sync.endpoint" => service.status().await,
    "sync.scan" => service.scan(),
    "sync.plan" => service.plan(params).await,
    "service.stop" | "sync.shutdown" => {
      service.stop().await;
      Ok(json!({ "running": false, "stopped": true }))
    }
    _ => Err(format!("Unsupported Sync service method: {method}")),
  }
}

#[tokio::main]
async fn main() {
  let stdin = io::stdin();
  let stdout = io::stdout();
  let mut lines = BufReader::new(stdin).lines();
  let mut writer = BufWriter::new(stdout);
  let mut service = match SyncService::from_environment() {
    Ok(service) => service,
    Err(error) => {
      eprintln!("[SyncAddon] service:start error={error}");
      return;
    }
  };

  while let Ok(Some(line)) = lines.next_line().await {
    let request: Value = match serde_json::from_str(&line) {
      Ok(value) => value,
      Err(error) => {
        let response = failure(0, format!("Invalid service request JSON: {error}"));
        let _ = writer.write_all(format!("{response}\n").as_bytes()).await;
        let _ = writer.flush().await;
        continue;
      }
    };

    let id = request.get("id").and_then(Value::as_u64).unwrap_or(0);
    let protocol = request.get("protocol").and_then(Value::as_str).unwrap_or("");
    let method = request.get("method").and_then(Value::as_str).unwrap_or("");
    let params = request.get("params").cloned().unwrap_or_else(|| json!({}));

    let response = if protocol != PROTOCOL {
      failure(id, format!("Unsupported service protocol: {protocol}"))
    } else if method.is_empty() {
      failure(id, "A service method is required")
    } else {
      match handle(&mut service, method, params).await {
        Ok(result) => success(id, result),
        Err(error) => failure(id, error),
      }
    };

    if writer
      .write_all(format!("{response}\n").as_bytes())
      .await
      .is_err()
    {
      break;
    }
    if writer.flush().await.is_err() {
      break;
    }
    if matches!(method, "service.stop" | "sync.shutdown") {
      break;
    }
  }

  service.stop().await;
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::fs;

  fn temp_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-sync-service-{name}-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  #[test]
  fn envelopes_use_the_versioned_service_protocol() {
    let response = success(7, json!({ "running": true }));
    assert_eq!(response["protocol"], PROTOCOL);
    assert_eq!(response["id"], 7);
    assert_eq!(response["ok"], true);
  }

  #[tokio::test]
  async fn unknown_methods_are_rejected_without_starting_network_state() {
    let root = temp_root("unknown");
    let mut service = SyncService::with_vault_dir(root.clone());
    let error = handle(&mut service, "sync.unknown", json!({}))
      .await
      .unwrap_err();
    assert!(error.contains("Unsupported Sync service method"));
    assert!(service.endpoint.is_none());
    let _ = fs::remove_dir_all(root);
  }

  #[tokio::test]
  async fn scan_and_plan_are_owned_by_the_package_service() {
    let root = temp_root("plan");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("A.md"), "# A").unwrap();
    let mut service = SyncService::with_vault_dir(root.clone());

    let scanned = handle(&mut service, "sync.scan", json!({})).await.unwrap();
    assert_eq!(scanned["owner"], "elephant.sync");
    assert_eq!(scanned["files"], 1);

    let planned = handle(
      &mut service,
      "sync.plan",
      json!({
        "remoteManifest": { "files": {}, "directories": [] },
        "baseline": { "files": {}, "directories": [] },
        "localId": "local",
        "remoteId": "remote"
      }),
    )
    .await
    .unwrap();
    assert_eq!(planned["owner"], "elephant.sync");
    assert_eq!(planned["summary"]["uploads"], 1);
    assert_eq!(planned["plan"]["uploads"].as_array().unwrap().len(), 1);
    let _ = fs::remove_dir_all(root);
  }
}

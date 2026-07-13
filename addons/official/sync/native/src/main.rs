use iroh::{Endpoint, endpoint::presets};
use iroh_mdns_address_lookup::MdnsAddressLookup;
use serde_json::{json, Value};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};

const PROTOCOL: &str = "elephant-addon-service-v1";

struct SyncService {
  endpoint: Option<Endpoint>,
}

impl SyncService {
  fn new() -> Self {
    Self { endpoint: None }
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
      "owner": "elephant.sync"
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

async fn handle(service: &mut SyncService, method: &str, _params: Value) -> Result<Value, String> {
  match method {
    "service.start" | "sync.status" | "sync.endpoint" => service.status().await,
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
  let mut service = SyncService::new();

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

  #[test]
  fn envelopes_use_the_versioned_service_protocol() {
    let response = success(7, json!({ "running": true }));
    assert_eq!(response["protocol"], PROTOCOL);
    assert_eq!(response["id"], 7);
    assert_eq!(response["ok"], true);
  }

  #[tokio::test]
  async fn unknown_methods_are_rejected_without_starting_network_state() {
    let mut service = SyncService::new();
    let error = handle(&mut service, "sync.unknown", json!({}))
      .await
      .unwrap_err();
    assert!(error.contains("Unsupported Sync service method"));
    assert!(service.endpoint.is_none());
  }
}

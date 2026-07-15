use elephantnote_knowledge_core::KnowledgeService;
use serde_json::{json, Value};
use std::{env, path::PathBuf};
use tokio::io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter};

const PROTOCOL: &str = "elephant-addon-service-v1";

fn success(id: u64, result: Value) -> Value {
    json!({ "protocol": PROTOCOL, "id": id, "ok": true, "result": result })
}

fn failure(id: u64, message: impl Into<String>) -> Value {
    json!({ "protocol": PROTOCOL, "id": id, "ok": false, "error": { "message": message.into() } })
}

fn service_from_environment() -> Result<KnowledgeService, String> {
    let raw = env::var("ELEPHANT_VAULT_DIR")
        .map_err(|_| "ELEPHANT_VAULT_DIR is required for the Knowledge service".to_string())?;
    KnowledgeService::open(PathBuf::from(raw))
}

#[tokio::main]
async fn main() {
    let service = match service_from_environment() {
        Ok(service) => service,
        Err(error) => {
            eprintln!("[knowledge-service] {error}");
            std::process::exit(1);
        }
    };
    let mut lines = BufReader::new(io::stdin()).lines();
    let mut writer = BufWriter::new(io::stdout());
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
        let protocol = request
            .get("protocol")
            .and_then(Value::as_str)
            .unwrap_or("");
        let method = request.get("method").and_then(Value::as_str).unwrap_or("");
        let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
        let response = if protocol != PROTOCOL {
            failure(id, format!("Unsupported service protocol: {protocol}"))
        } else {
            match service.call(method, params) {
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
        if method == "service.stop" {
            break;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn response_envelope_remains_protocol_compatible() {
        let response = success(7, json!({ "ready": true }));
        assert_eq!(response["protocol"], PROTOCOL);
        assert_eq!(response["id"], 7);
        assert_eq!(response["ok"], true);
    }
}

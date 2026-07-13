use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  io::{self, Read},
  process::Command,
};

const PROTOCOL: &str = "elephant-addon-sidecar-v1";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
  protocol: String,
  addon_id: String,
  method: String,
  #[serde(default)]
  params: Value,
}

#[derive(Debug, Serialize)]
struct Response {
  protocol: &'static str,
  ok: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  result: Option<Value>,
  #[serde(skip_serializing_if = "Option::is_none")]
  error: Option<Value>,
}

impl Response {
  fn ok(result: Value) -> Self {
    Self {
      protocol: PROTOCOL,
      ok: true,
      result: Some(result),
      error: None,
    }
  }

  fn error(message: impl Into<String>) -> Self {
    Self {
      protocol: PROTOCOL,
      ok: false,
      result: None,
      error: Some(json!({ "message": message.into() })),
    }
  }
}

fn tesseract_status() -> Value {
  match Command::new("tesseract").arg("--version").output() {
    Ok(output) if output.status.success() => {
      let first_line = String::from_utf8_lossy(&output.stdout)
        .lines()
        .next()
        .unwrap_or("tesseract")
        .to_string();
      json!({
        "available": true,
        "engine": "tesseract",
        "version": first_line
      })
    }
    Ok(output) => json!({
      "available": false,
      "engine": "tesseract",
      "error": String::from_utf8_lossy(&output.stderr).trim()
    }),
    Err(error) => json!({
      "available": false,
      "engine": "tesseract",
      "error": format!("tesseract binary not found: {error}")
    }),
  }
}

fn run_ocr(params: &Value) -> Result<Value, String> {
  let path = params
    .get("path")
    .and_then(Value::as_str)
    .unwrap_or("")
    .trim();
  if path.is_empty() {
    return Err("An image path is required".to_string());
  }
  let languages = params
    .get("languages")
    .and_then(Value::as_str)
    .unwrap_or("eng")
    .trim();

  let mut command = Command::new("tesseract");
  command.arg(path).arg("stdout");
  if !languages.is_empty() {
    command.arg("-l").arg(languages.replace(',', "+"));
  }
  let output = command
    .output()
    .map_err(|error| format!("tesseract spawn failed: {error}"))?;
  if !output.status.success() {
    return Err(format!(
      "tesseract failed: {}",
      String::from_utf8_lossy(&output.stderr).trim()
    ));
  }

  Ok(json!({
    "text": String::from_utf8_lossy(&output.stdout).to_string(),
    "source": "tesseract",
    "languages": languages
  }))
}

fn handle(request: Request) -> Response {
  if request.protocol != PROTOCOL {
    return Response::error("Unsupported sidecar protocol");
  }
  if request.addon_id != "elephant.ai-ocr" {
    return Response::error("Sidecar addon id mismatch");
  }

  match request.method.as_str() {
    "status" => Response::ok(tesseract_status()),
    "ocr.image" => match run_ocr(&request.params) {
      Ok(result) => Response::ok(result),
      Err(error) => Response::error(error),
    },
    other => Response::error(format!("Unsupported OCR sidecar method: {other}")),
  }
}

fn main() {
  let response = (|| -> Result<Response, String> {
    let mut input = String::new();
    io::stdin()
      .read_to_string(&mut input)
      .map_err(|error| format!("Failed to read sidecar request: {error}"))?;
    let request: Request = serde_json::from_str(&input)
      .map_err(|error| format!("Invalid sidecar request: {error}"))?;
    Ok(handle(request))
  })()
  .unwrap_or_else(Response::error);

  match serde_json::to_string(&response) {
    Ok(json) => println!("{json}"),
    Err(error) => println!(
      "{{\"protocol\":\"{PROTOCOL}\",\"ok\":false,\"error\":{{\"message\":\"serialization failed: {error}\"}}}}"
    ),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_wrong_addon_id() {
    let response = handle(Request {
      protocol: PROTOCOL.to_string(),
      addon_id: "other.addon".to_string(),
      method: "status".to_string(),
      params: json!({}),
    });
    assert!(!response.ok);
  }

  #[test]
  fn status_has_stable_shape() {
    let response = handle(Request {
      protocol: PROTOCOL.to_string(),
      addon_id: "elephant.ai-ocr".to_string(),
      method: "status".to_string(),
      params: json!({}),
    });
    assert!(response.ok);
    assert!(response.result.unwrap().get("available").is_some());
  }
}

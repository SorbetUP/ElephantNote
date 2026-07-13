use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  io::{self, Read, Write},
  path::Path,
  process::{Command, Stdio},
};

const PROTOCOL: &str = "elephant-addon-sidecar-v1";
const ADDON_ID: &str = "elephant.code-execution";
const DEFAULT_OUTPUT_LINE_LIMIT: usize = 200;
const MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;

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
    Self { protocol: PROTOCOL, ok: true, result: Some(result), error: None }
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

fn string_param<'a>(params: &'a Value, key: &str) -> &'a str {
  params.get(key).and_then(Value::as_str).unwrap_or("").trim()
}

fn string_array(params: &Value, key: &str) -> Vec<String> {
  params
    .get(key)
    .and_then(Value::as_array)
    .map(|values| {
      values
        .iter()
        .filter_map(Value::as_str)
        .map(ToString::to_string)
        .collect()
    })
    .unwrap_or_default()
}

fn truncate_bytes(value: Vec<u8>) -> String {
  let bytes = if value.len() > MAX_OUTPUT_BYTES {
    &value[..MAX_OUTPUT_BYTES]
  } else {
    &value
  };
  String::from_utf8_lossy(bytes).to_string()
}

fn truncate_lines(value: String, limit: usize) -> String {
  let mut lines = value.lines();
  let kept = lines.by_ref().take(limit).collect::<Vec<_>>();
  let truncated = lines.next().is_some();
  let mut output = kept.join("\n");
  if truncated {
    if !output.is_empty() {
      output.push('\n');
    }
    output.push_str("… output truncated by Elephant Code execution …");
  }
  output
}

fn executable_status(params: &Value) -> Value {
  let executable = string_param(params, "executable");
  if executable.is_empty() {
    return json!({ "available": false, "error": "No executable was configured" });
  }
  match Command::new(executable).arg("--version").output() {
    Ok(output) => json!({
      "available": output.status.success(),
      "executable": executable,
      "version": truncate_lines(truncate_bytes(output.stdout), 3),
      "stderr": truncate_lines(truncate_bytes(output.stderr), 3)
    }),
    Err(error) => json!({
      "available": false,
      "executable": executable,
      "error": format!("Interpreter could not be started: {error}")
    }),
  }
}

fn run_interpreter(params: &Value) -> Result<Value, String> {
  let executable = string_param(params, "executable");
  let code = params.get("code").and_then(Value::as_str).unwrap_or("");
  if executable.is_empty() {
    return Err("An interpreter executable is required".to_string());
  }
  if code.is_empty() {
    return Err("Code is required".to_string());
  }

  let args = string_array(params, "args");
  let cwd = string_param(params, "cwd");
  let line_limit = params
    .get("outputLineLimit")
    .and_then(Value::as_u64)
    .map(|value| value.clamp(1, 20_000) as usize)
    .unwrap_or(DEFAULT_OUTPUT_LINE_LIMIT);

  if !cwd.is_empty() {
    let path = Path::new(cwd);
    if !path.is_dir() {
      return Err(format!("Execution directory does not exist: {cwd}"));
    }
  }

  let mut command = Command::new(executable);
  command.args(args);
  command.stdin(Stdio::piped());
  command.stdout(Stdio::piped());
  command.stderr(Stdio::piped());
  if !cwd.is_empty() {
    command.current_dir(cwd);
  }

  let mut child = command
    .spawn()
    .map_err(|error| format!("Interpreter spawn failed: {error}"))?;
  if let Some(mut stdin) = child.stdin.take() {
    stdin
      .write_all(code.as_bytes())
      .map_err(|error| format!("Failed to send code to interpreter: {error}"))?;
  }

  let output = child
    .wait_with_output()
    .map_err(|error| format!("Interpreter execution failed: {error}"))?;
  let stdout = truncate_lines(truncate_bytes(output.stdout), line_limit);
  let stderr = truncate_lines(truncate_bytes(output.stderr), line_limit);
  Ok(json!({
    "success": output.status.success(),
    "code": output.status.code(),
    "stdout": stdout,
    "stderr": stderr,
    "executable": executable
  }))
}

fn handle(request: Request) -> Response {
  if request.protocol != PROTOCOL {
    return Response::error("Unsupported sidecar protocol");
  }
  if request.addon_id != ADDON_ID {
    return Response::error("Sidecar addon id mismatch");
  }

  match request.method.as_str() {
    "status" => Response::ok(executable_status(&request.params)),
    "execute" => match run_interpreter(&request.params) {
      Ok(result) => Response::ok(result),
      Err(error) => Response::error(error),
    },
    other => Response::error(format!("Unsupported Code execution sidecar method: {other}")),
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
  fn rejects_empty_execution_request() {
    let response = handle(Request {
      protocol: PROTOCOL.to_string(),
      addon_id: ADDON_ID.to_string(),
      method: "execute".to_string(),
      params: json!({}),
    });
    assert!(!response.ok);
  }

  #[test]
  fn status_has_stable_shape() {
    let response = handle(Request {
      protocol: PROTOCOL.to_string(),
      addon_id: ADDON_ID.to_string(),
      method: "status".to_string(),
      params: json!({ "executable": "definitely-not-an-elephant-interpreter" }),
    });
    assert!(response.ok);
    assert_eq!(response.result.unwrap()["available"], false);
  }
}

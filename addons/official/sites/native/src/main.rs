use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  fs,
  io::{self, Read},
  net::{TcpListener, TcpStream},
  path::{Component, Path, PathBuf},
  process::{Command, Stdio},
  thread,
  time::Duration,
};
use tiny_http::{Header, Response as HttpResponse, Server};

const PROTOCOL: &str = "elephant-addon-sidecar-v1";
const ADDON_ID: &str = "elephant.sites";

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

fn content_type(path: &Path) -> &'static str {
  match path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str() {
    "html" | "htm" => "text/html; charset=utf-8",
    "css" => "text/css; charset=utf-8",
    "js" | "mjs" => "text/javascript; charset=utf-8",
    "json" => "application/json; charset=utf-8",
    "png" => "image/png",
    "jpg" | "jpeg" => "image/jpeg",
    "gif" => "image/gif",
    "svg" => "image/svg+xml",
    "ico" => "image/x-icon",
    "webp" => "image/webp",
    "woff" => "font/woff",
    "woff2" => "font/woff2",
    "ttf" => "font/ttf",
    "wasm" => "application/wasm",
    _ => "application/octet-stream",
  }
}

fn safe_request_path(root: &Path, request_path: &str) -> Result<PathBuf, String> {
  let path = request_path.split('?').next().unwrap_or("/");
  let relative = path.trim_start_matches('/');
  let relative = if relative.is_empty() { "index.html" } else { relative };
  let relative_path = Path::new(relative);
  for component in relative_path.components() {
    if matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)) {
      return Err("Path traversal is not allowed".to_string());
    }
  }

  let mut candidate = root.join(relative_path);
  if candidate.is_dir() {
    candidate = candidate.join("index.html");
  }
  let canonical = candidate.canonicalize().map_err(|_| "File not found".to_string())?;
  if !canonical.starts_with(root) {
    return Err("Requested file escaped the site root".to_string());
  }
  Ok(canonical)
}

fn serve(root: PathBuf, port: u16) -> Result<(), String> {
  let root = root.canonicalize().map_err(|error| format!("Invalid site root: {error}"))?;
  if !root.is_dir() {
    return Err("Site root must be a directory".to_string());
  }
  let address = format!("127.0.0.1:{port}");
  let server = Server::http(&address).map_err(|error| error.to_string())?;
  for request in server.incoming_requests() {
    match safe_request_path(&root, request.url()) {
      Ok(path) => match fs::read(&path) {
        Ok(bytes) => {
          let mut response = HttpResponse::from_data(bytes);
          if let Ok(header) = Header::from_bytes(b"Content-Type", content_type(&path).as_bytes()) {
            response = response.with_header(header);
          }
          let _ = request.respond(response);
        }
        Err(_) => {
          let _ = request.respond(HttpResponse::from_string("404 Not Found").with_status_code(404));
        }
      },
      Err(error) if error == "File not found" => {
        let _ = request.respond(HttpResponse::from_string("404 Not Found").with_status_code(404));
      }
      Err(_) => {
        let _ = request.respond(HttpResponse::from_string("403 Forbidden").with_status_code(403));
      }
    }
  }
  Ok(())
}

fn find_free_port() -> Result<u16, String> {
  TcpListener::bind("127.0.0.1:0")
    .and_then(|listener| listener.local_addr())
    .map(|address| address.port())
    .map_err(|error| error.to_string())
}

fn is_running(port: u16) -> bool {
  let address = format!("127.0.0.1:{port}").parse();
  match address {
    Ok(address) => TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok(),
    Err(_) => false,
  }
}

fn open_preview(params: &Value) -> Result<Value, String> {
  let root = params.get("root").and_then(Value::as_str).unwrap_or("").trim();
  if root.is_empty() {
    return Err("A site root is required".to_string());
  }
  let root = PathBuf::from(root).canonicalize().map_err(|error| format!("Invalid site root: {error}"))?;
  if !root.is_dir() {
    return Err("Site root must be a directory".to_string());
  }
  let port = find_free_port()?;
  let executable = std::env::current_exe().map_err(|error| error.to_string())?;
  let child = Command::new(executable)
    .arg("--serve")
    .arg(&root)
    .arg(port.to_string())
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
    .map_err(|error| format!("Unable to start site preview: {error}"))?;
  let pid = child.id();

  for _ in 0..40 {
    if is_running(port) {
      return Ok(json!({
        "siteId": format!("site-{pid}"),
        "pid": pid,
        "port": port,
        "url": format!("http://127.0.0.1:{port}/"),
        "root": root.to_string_lossy(),
        "running": true,
        "status": "running"
      }));
    }
    thread::sleep(Duration::from_millis(50));
  }

  Err("Site preview process did not start listening".to_string())
}

fn stop_process(pid: u32) -> Result<(), String> {
  #[cfg(windows)]
  let status = Command::new("taskkill")
    .args(["/PID", &pid.to_string(), "/T", "/F"])
    .status()
    .map_err(|error| error.to_string())?;

  #[cfg(not(windows))]
  let status = Command::new("kill")
    .args(["-TERM", &pid.to_string()])
    .status()
    .map_err(|error| error.to_string())?;

  if status.success() { Ok(()) } else { Err(format!("Unable to stop site preview process {pid}")) }
}

fn handle(request: Request) -> Response {
  if request.protocol != PROTOCOL {
    return Response::error("Unsupported sidecar protocol");
  }
  if request.addon_id != ADDON_ID {
    return Response::error("Sidecar addon id mismatch");
  }

  match request.method.as_str() {
    "status" => Response::ok(json!({ "available": true, "engine": "elephant-sites" })),
    "preview.open" | "site.build" => match open_preview(&request.params) {
      Ok(result) => Response::ok(result),
      Err(error) => Response::error(error),
    },
    "preview.status" => {
      let port = request.params.get("port").and_then(Value::as_u64).unwrap_or(0) as u16;
      let running = port > 0 && is_running(port);
      Response::ok(json!({
        "port": port,
        "url": if port > 0 { format!("http://127.0.0.1:{port}/") } else { String::new() },
        "running": running,
        "status": if running { "running" } else { "stopped" }
      }))
    }
    "preview.stop" => {
      let pid = request.params.get("pid").and_then(Value::as_u64).unwrap_or(0) as u32;
      if pid == 0 {
        return Response::error("A valid preview pid is required");
      }
      match stop_process(pid) {
        Ok(()) => Response::ok(json!({ "stopped": true, "pid": pid })),
        Err(error) => Response::error(error),
      }
    }
    other => Response::error(format!("Unsupported Sites sidecar method: {other}")),
  }
}

fn run_request_mode() -> Result<Response, String> {
  let mut input = String::new();
  io::stdin().read_to_string(&mut input).map_err(|error| error.to_string())?;
  let request: Request = serde_json::from_str(&input).map_err(|error| format!("Invalid sidecar request: {error}"))?;
  Ok(handle(request))
}

fn main() {
  let args = std::env::args().collect::<Vec<_>>();
  if args.get(1).map(String::as_str) == Some("--serve") {
    let root = args.get(2).map(PathBuf::from).unwrap_or_default();
    let port = args.get(3).and_then(|value| value.parse::<u16>().ok()).unwrap_or(0);
    if let Err(error) = serve(root, port) {
      eprintln!("[elephant-sites] {error}");
      std::process::exit(1);
    }
    return;
  }

  let response = run_request_mode().unwrap_or_else(Response::error);
  match serde_json::to_string(&response) {
    Ok(encoded) => println!("{encoded}"),
    Err(error) => println!("{{\"protocol\":\"{PROTOCOL}\",\"ok\":false,\"error\":{{\"message\":\"serialization failed: {error}\"}}}}"),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_path_traversal() {
    let root = std::env::temp_dir();
    assert!(safe_request_path(&root, "/../secret").is_err());
  }

  #[test]
  fn status_has_stable_shape() {
    let response = handle(Request {
      protocol: PROTOCOL.to_string(),
      addon_id: ADDON_ID.to_string(),
      method: "status".to_string(),
      params: json!({}),
    });
    assert!(response.ok);
    assert_eq!(response.result.unwrap().get("available").and_then(Value::as_bool), Some(true));
  }
}

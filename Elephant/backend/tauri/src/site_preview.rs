use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tiny_http::{Header, Response, Server};

pub struct SitePreviewServer {
  pub port: u16,
  pub server: Option<Server>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct SitePreviewInfo {
  pub url: String,
  pub port: u16,
  pub root: String,
  pub running: bool,
}

pub struct SitePreviewState {
  pub servers: Mutex<Vec<SitePreviewServer>>,
}

impl SitePreviewState {
  pub fn new() -> Self {
    SitePreviewState { servers: Mutex::new(Vec::new()) }
  }
}

fn content_type(path: &str) -> &'static str {
  let lower = path.to_ascii_lowercase();
  if let Some(ext) = lower.rsplit('.').next() {
    return match ext {
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
    };
  }
  "application/octet-stream"
}

fn find_free_port() -> Option<u16> {
  std::net::TcpListener::bind("127.0.0.1:0")
    .and_then(|listener| listener.local_addr())
    .ok()
    .map(|addr| addr.port())
}

pub fn open_vault(root: PathBuf) -> Result<SitePreviewInfo, String> {
  let port = find_free_port().ok_or_else(|| "no free port".to_string())?;
  let root_str = root.to_string_lossy().to_string();
  let bound = format!("127.0.0.1:{port}");
  let server = Server::http(&bound).map_err(|e| e.to_string())?;
  let info = SitePreviewInfo {
    url: format!("http://{bound}/"),
    port,
    root: root_str,
    running: true,
  };
  let root_clone = root.clone();
  std::thread::spawn(move || {
    for request in server.incoming_requests() {
      let path = request.url().split('?').next().unwrap_or("/");
      let safe = if path == "/" { "/index.html" } else { path };
      if safe.contains("..") {
        let _ = request.respond(Response::from_string("403 Forbidden").with_status_code(403));
        continue;
      }
      let full = root_clone.join(safe.trim_start_matches('/'));
      match std::fs::read(&full) {
        Ok(bytes) => {
          let ct = content_type(full.to_string_lossy().as_ref());
          let mut response = Response::from_data(bytes);
          if let Ok(header) = Header::from_bytes(
            b"Content-Type",
            format!("{ct}").as_bytes(),
          ) {
            response = response.with_header(header);
          }
          let _ = request.respond(response);
        }
        Err(_) => {
          let body = "<h1>404 Not Found</h1>";
          let _ = request.respond(Response::from_string(body).with_status_code(404));
        }
      }
    }
  });
  Ok(info)
}

#[tauri::command]
pub fn tauri_site_preview_open(root: String) -> Result<SitePreviewInfo, String> {
  let path = PathBuf::from(&root);
  if !path.exists() {
    return Err("root path does not exist".into());
  }
  open_vault(path)
}

#[tauri::command]
pub fn tauri_site_preview_status(port: u16) -> SitePreviewInfo {
  SitePreviewInfo { url: format!("http://127.0.0.1:{port}/"), port, root: String::new(), running: true }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn content_type_maps_known_extensions() {
    assert_eq!(content_type("index.html"), "text/html; charset=utf-8");
    assert_eq!(content_type("style.css"), "text/css; charset=utf-8");
    assert_eq!(content_type("app.js"), "text/javascript; charset=utf-8");
    assert_eq!(content_type("logo.png"), "image/png");
    assert_eq!(content_type("icon.svg"), "image/svg+xml");
    assert_eq!(content_type("data.json"), "application/json; charset=utf-8");
  }

  #[test]
  fn content_type_defaults_to_octet_stream() {
    assert_eq!(content_type("file.unknown"), "application/octet-stream");
  }

  #[test]
  fn site_preview_info_serializes_url_and_port() {
    let info = SitePreviewInfo {
      url: "http://127.0.0.1:8787/".into(),
      port: 8787,
      root: "/tmp/site".into(),
      running: true,
    };
    let json = serde_json::to_value(&info).unwrap();
    assert_eq!(json.get("port").and_then(|v| v.as_u64()), Some(8787));
    assert_eq!(json.get("running").and_then(|v| v.as_bool()), Some(true));
  }

  #[test]
  fn find_free_port_returns_unused_port() {
    let port1 = find_free_port().unwrap();
    let port2 = find_free_port().unwrap();
    assert_ne!(port1, port2);
  }

  #[test]
  fn open_vault_serves_index_html() {
    let dir = std::env::temp_dir().join(format!("elephantnote_site_test_{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("index.html"), "<h1>Hello</h1>").unwrap();
    let info = open_vault(dir.clone()).unwrap();
    let url = format!("{}index.html", info.url);
    let response = reqwest::blocking::get(&url).unwrap();
    let body = response.text().unwrap();
    assert!(body.contains("Hello"));
    std::fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn open_vault_returns_404_for_missing_file() {
    let dir = std::env::temp_dir().join(format!("elephantnote_site_404_{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    std::fs::write(dir.join("index.html"), "ok").unwrap();
    let info = open_vault(dir.clone()).unwrap();
    let url = format!("{}missing.html", info.url);
    let response = reqwest::blocking::get(&url).unwrap();
    assert_eq!(response.status().as_u16(), 404);
    std::fs::remove_dir_all(&dir).ok();
  }
}
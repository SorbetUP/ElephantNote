use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State};
use url::Url;

const MAX_HEADER_BYTES: usize = 64 * 1024;
const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;
const DEFAULT_COMMAND_TIMEOUT_MS: u64 = 60_000;
const AUTOMATION_EVENT: &str = "elephant:automation:command";

#[derive(Default)]
pub struct AcceptanceState {
    pending: Mutex<HashMap<String, mpsc::Sender<Result<Value, String>>>>,
    ready: AtomicBool,
    sequence: AtomicU64,
}

#[derive(Clone, Debug, Deserialize)]
struct CommandRequest {
    command: String,
    #[serde(default)]
    args: Vec<Value>,
}

#[derive(Debug, Deserialize)]
struct BatchRequest {
    commands: Vec<CommandRequest>,
}

#[derive(Clone, Debug, Serialize)]
struct CommandEvent<'a> {
    request_id: &'a str,
    command: &'a str,
    args: &'a [Value],
}

#[derive(Debug)]
struct HttpRequest {
    method: String,
    target: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn configured_port() -> Option<String> {
    std::env::var("ELEPHANT_AUTOMATION_PORT")
        .ok()
        .or_else(|| std::env::var("ELEPHANT_ACCEPTANCE_TAURI_PORT").ok())
}

fn command_timeout() -> Duration {
    let milliseconds = std::env::var("ELEPHANT_AUTOMATION_TIMEOUT_MS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .unwrap_or(DEFAULT_COMMAND_TIMEOUT_MS)
        .clamp(1_000, 300_000);
    Duration::from_millis(milliseconds)
}

fn generated_token(port: u16) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let material = format!("elephant-automation:{}:{port}:{nanos}", std::process::id());
    blake3::hash(material.as_bytes()).to_hex().to_string()
}

fn write_response(stream: &mut TcpStream, status: &str, body: Value) {
    let bytes = body.to_string().into_bytes();
    let header = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
        bytes.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(&bytes);
}

fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, String> {
    let mut data = Vec::new();
    let mut buffer = [0_u8; 4096];
    let header_end;
    loop {
        let read = stream.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("connection closed before request headers".into());
        }
        data.extend_from_slice(&buffer[..read]);
        if let Some(index) = data.windows(4).position(|window| window == b"\r\n\r\n") {
            header_end = index + 4;
            break;
        }
        if data.len() > MAX_HEADER_BYTES {
            return Err("request headers too large".into());
        }
    }

    let header = String::from_utf8_lossy(&data[..header_end]);
    let mut lines = header.lines();
    let request_line = lines.next().unwrap_or_default();
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default().to_uppercase();
    let target = request_parts.next().unwrap_or_default().to_string();
    if method.is_empty() || target.is_empty() {
        return Err("invalid request line".into());
    }

    let mut headers = HashMap::new();
    for line in lines {
        if let Some((name, value)) = line.split_once(':') {
            headers.insert(name.trim().to_ascii_lowercase(), value.trim().to_string());
        }
    }
    let content_length = headers
        .get("content-length")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    if content_length > MAX_BODY_BYTES {
        return Err("request body too large".into());
    }
    while data.len() - header_end < content_length {
        let read = stream.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            return Err("connection closed before request body".into());
        }
        data.extend_from_slice(&buffer[..read]);
        if data.len() - header_end > MAX_BODY_BYTES {
            return Err("request body too large".into());
        }
    }

    Ok(HttpRequest {
        method,
        target,
        headers,
        body: data[header_end..header_end + content_length].to_vec(),
    })
}

fn authorized(request: &HttpRequest, token: &str) -> bool {
    request
        .headers
        .get("authorization")
        .is_some_and(|value| value == &format!("Bearer {token}"))
        || request
            .headers
            .get("x-elephant-automation-token")
            .is_some_and(|value| value == token)
}

fn parsed_url(target: &str) -> Result<Url, String> {
    Url::parse(&format!("http://127.0.0.1{target}"))
        .map_err(|error| format!("invalid request target: {error}"))
}

fn wait_until_renderer_ready(state: &AcceptanceState) -> bool {
    for _ in 0..600 {
        if state.ready.load(Ordering::Acquire) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
    false
}

fn dispatch_command(app: &AppHandle, request: &CommandRequest) -> Result<(String, Value), String> {
    if request.command.trim().is_empty() {
        return Err("command must not be empty".into());
    }
    let state = app.state::<AcceptanceState>();
    let sequence = state.sequence.fetch_add(1, Ordering::Relaxed);
    let request_id = format!("automation-{sequence}");
    println!(
        "[automation-api] command:start request_id={request_id} command={} args={}",
        request.command,
        request.args.len()
    );

    let (sender, receiver) = mpsc::channel();
    state
        .pending
        .lock()
        .expect("automation state poisoned")
        .insert(request_id.clone(), sender);

    if !wait_until_renderer_ready(&state) {
        state
            .pending
            .lock()
            .expect("automation state poisoned")
            .remove(&request_id);
        return Err("renderer automation bridge is not ready".into());
    }

    let event = CommandEvent {
        request_id: &request_id,
        command: &request.command,
        args: &request.args,
    };
    if let Err(error) = app.emit(AUTOMATION_EVENT, event) {
        state
            .pending
            .lock()
            .expect("automation state poisoned")
            .remove(&request_id);
        return Err(error.to_string());
    }

    let result = receiver
        .recv_timeout(command_timeout())
        .unwrap_or_else(|_| Err("renderer automation command timed out".into()));
    state
        .pending
        .lock()
        .expect("automation state poisoned")
        .remove(&request_id);

    match result {
        Ok(value) => {
            println!(
                "[automation-api] command:done request_id={request_id} command={}",
                request.command
            );
            Ok((request_id, value))
        }
        Err(error) => {
            eprintln!(
                "[automation-api] command:error request_id={request_id} command={} error={error}",
                request.command
            );
            Err(error)
        }
    }
}

fn query_filter(url: &Url) -> Value {
    let mut filter = Map::new();
    for (key, value) in url.query_pairs() {
        let parsed = match key.as_ref() {
            "limit" | "since" => value
                .parse::<u64>()
                .map(Value::from)
                .unwrap_or_else(|_| Value::String(value.into_owned())),
            _ => Value::String(value.into_owned()),
        };
        filter.insert(key.into_owned(), parsed);
    }
    Value::Object(filter)
}

fn command_response(stream: &mut TcpStream, app: &AppHandle, request: CommandRequest) {
    match dispatch_command(app, &request) {
        Ok((request_id, result)) => write_response(
            stream,
            "200 OK",
            json!({"ok": true, "requestId": request_id, "result": result}),
        ),
        Err(error) => write_response(
            stream,
            "500 Internal Server Error",
            json!({"ok": false, "error": error}),
        ),
    }
}

fn handle_connection(mut stream: TcpStream, app: AppHandle, token: String) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let request = match read_request(&mut stream) {
        Ok(request) => request,
        Err(error) => {
            write_response(
                &mut stream,
                "400 Bad Request",
                json!({"ok": false, "error": error}),
            );
            return;
        }
    };
    let url = match parsed_url(&request.target) {
        Ok(url) => url,
        Err(error) => {
            write_response(
                &mut stream,
                "400 Bad Request",
                json!({"ok": false, "error": error}),
            );
            return;
        }
    };
    let path = url.path();

    if request.method == "GET" && matches!(path, "/health" | "/v1/health") {
        let ready = app
            .state::<AcceptanceState>()
            .ready
            .load(Ordering::Acquire);
        write_response(
            &mut stream,
            "200 OK",
            json!({
                "ok": true,
                "name": "Elephant Automation API",
                "protocolVersion": 1,
                "transport": "tauri",
                "ready": ready,
                "authentication": "bearer",
                "loopbackOnly": true
            }),
        );
        return;
    }

    if !authorized(&request, &token) {
        write_response(
            &mut stream,
            "401 Unauthorized",
            json!({"ok": false, "error": "missing or invalid automation token"}),
        );
        return;
    }

    if request.method == "GET" && path == "/v1/schema" {
        write_response(
            &mut stream,
            "200 OK",
            json!({
                "ok": true,
                "protocolVersion": 1,
                "endpoints": {
                    "health": "GET /v1/health",
                    "schema": "GET /v1/schema",
                    "capabilities": "GET /v1/capabilities",
                    "ui": "GET /v1/ui?selector=body",
                    "logs": "GET /v1/logs?level=error&contains=text&limit=100",
                    "command": "POST /v1/command",
                    "batch": "POST /v1/batch"
                },
                "authentication": ["Authorization: Bearer <token>", "X-Elephant-Automation-Token: <token>"]
            }),
        );
        return;
    }

    if request.method == "GET" && path == "/v1/capabilities" {
        command_response(
            &mut stream,
            &app,
            CommandRequest {
                command: "capabilities".into(),
                args: Vec::new(),
            },
        );
        return;
    }

    if request.method == "GET" && path == "/v1/logs" {
        command_response(
            &mut stream,
            &app,
            CommandRequest {
                command: "logs".into(),
                args: vec![query_filter(&url)],
            },
        );
        return;
    }

    if request.method == "GET" && path == "/v1/ui" {
        let selector = url
            .query_pairs()
            .find_map(|(key, value)| (key == "selector").then(|| value.into_owned()))
            .unwrap_or_else(|| "body".into());
        command_response(
            &mut stream,
            &app,
            CommandRequest {
                command: "uiSnapshot".into(),
                args: vec![Value::String(selector), query_filter(&url)],
            },
        );
        return;
    }

    if request.method == "POST" && matches!(path, "/command" | "/v1/command") {
        let command = match serde_json::from_slice::<CommandRequest>(&request.body) {
            Ok(command) => command,
            Err(error) => {
                write_response(
                    &mut stream,
                    "400 Bad Request",
                    json!({"ok": false, "error": error.to_string()}),
                );
                return;
            }
        };
        command_response(&mut stream, &app, command);
        return;
    }

    if request.method == "POST" && path == "/v1/batch" {
        let batch = match serde_json::from_slice::<BatchRequest>(&request.body) {
            Ok(batch) => batch,
            Err(error) => {
                write_response(
                    &mut stream,
                    "400 Bad Request",
                    json!({"ok": false, "error": error.to_string()}),
                );
                return;
            }
        };
        if batch.commands.is_empty() || batch.commands.len() > 100 {
            write_response(
                &mut stream,
                "400 Bad Request",
                json!({"ok": false, "error": "batch must contain between 1 and 100 commands"}),
            );
            return;
        }
        let mut results = Vec::with_capacity(batch.commands.len());
        for (index, command) in batch.commands.iter().enumerate() {
            match dispatch_command(&app, command) {
                Ok((request_id, result)) => results.push(json!({
                    "index": index,
                    "ok": true,
                    "requestId": request_id,
                    "result": result
                })),
                Err(error) => {
                    write_response(
                        &mut stream,
                        "500 Internal Server Error",
                        json!({"ok": false, "failedIndex": index, "error": error, "results": results}),
                    );
                    return;
                }
            }
        }
        write_response(
            &mut stream,
            "200 OK",
            json!({"ok": true, "results": results}),
        );
        return;
    }

    write_response(
        &mut stream,
        "404 Not Found",
        json!({"ok": false, "error": "unknown automation endpoint"}),
    );
}

#[tauri::command]
pub fn tauri_acceptance_result(
    request_id: String,
    result: Option<Value>,
    error: Option<String>,
    state: State<'_, AcceptanceState>,
) -> bool {
    let sender = state
        .pending
        .lock()
        .expect("automation state poisoned")
        .remove(&request_id);
    match sender {
        Some(sender) => sender
            .send(error.map_or_else(|| Ok(result.unwrap_or(Value::Null)), Err))
            .is_ok(),
        None => false,
    }
}

#[tauri::command]
pub fn tauri_acceptance_ready(state: State<'_, AcceptanceState>) -> bool {
    state.ready.store(true, Ordering::Release);
    println!("[automation-api] renderer:ready");
    true
}

#[tauri::command]
pub fn tauri_acceptance_enabled() -> bool {
    configured_port().is_some()
}

pub fn start(app: &AppHandle) {
    let Some(raw_port) = configured_port() else {
        return;
    };
    let port = raw_port.parse::<u16>().unwrap_or(0);
    let listener = std::net::TcpListener::bind(("127.0.0.1", port))
        .expect("failed to bind Elephant automation server");
    let actual_port = listener
        .local_addr()
        .expect("failed to read Elephant automation server address")
        .port();
    let supplied_token = std::env::var("ELEPHANT_AUTOMATION_TOKEN")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let token = supplied_token
        .clone()
        .unwrap_or_else(|| generated_token(actual_port));

    println!("ELEPHANT_AUTOMATION_PORT={actual_port}");
    if supplied_token.is_none() {
        println!("ELEPHANT_AUTOMATION_TOKEN={token}");
    }
    println!("[automation-api] listening on http://127.0.0.1:{actual_port}/v1");

    let handle = app.clone();
    std::thread::Builder::new()
        .name("elephant-automation-server".into())
        .spawn(move || {
            for connection in listener.incoming() {
                let Ok(stream) = connection else {
                    continue;
                };
                let app = handle.clone();
                let token = token.clone();
                std::thread::spawn(move || handle_connection(stream, app, token));
            }
        })
        .expect("failed to start Elephant automation server thread");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_tokens_are_non_empty_and_port_specific() {
        let first = generated_token(41001);
        let second = generated_token(41002);
        assert_eq!(first.len(), 64);
        assert_eq!(second.len(), 64);
        assert_ne!(first, second);
    }

    #[test]
    fn bearer_and_explicit_token_headers_are_supported() {
        let mut request = HttpRequest {
            method: "POST".into(),
            target: "/v1/command".into(),
            headers: HashMap::new(),
            body: Vec::new(),
        };
        assert!(!authorized(&request, "secret"));
        request
            .headers
            .insert("authorization".into(), "Bearer secret".into());
        assert!(authorized(&request, "secret"));
        request.headers.clear();
        request
            .headers
            .insert("x-elephant-automation-token".into(), "secret".into());
        assert!(authorized(&request, "secret"));
    }
}
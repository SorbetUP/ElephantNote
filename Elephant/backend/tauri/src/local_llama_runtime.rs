use reqwest::Client;
use serde_json::{json, Value};
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;
use tauri::{AppHandle, Manager};

type R<T> = Result<T, String>;
const MODEL_PROVIDER: &str = "tauri-rust";
const DEFAULT_PORT: u16 = 39281;
const DEFAULT_BASE_URL: &str = "http://127.0.0.1:39281/v1";
const DEFAULT_EMBEDDING_BASE_URL: &str = "http://127.0.0.1:39282/v1";
const DEFAULT_EMBEDDING_CONTEXT_WINDOW: u64 = 2048;
const DEFAULT_EMBEDDING_PHYSICAL_BATCH_SIZE: u64 = 1024;

#[cfg(windows)]
const LLAMA_SERVER_BIN: &str = "llama-server.exe";
#[cfg(not(windows))]
const LLAMA_SERVER_BIN: &str = "llama-server";

pub struct LocalChatResult {
    pub answer: String,
    pub provider: String,
    pub model: String,
    pub base_url: String,
}

fn home_dir() -> PathBuf {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(env::temp_dir)
}

fn model_dir() -> PathBuf {
    env::var_os("ELEPHANTNOTE_MODEL_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            home_dir()
                .join(".elephantnote")
                .join("models")
                .join(MODEL_PROVIDER)
        })
}

fn sibling_model_dir(dir: &Path) -> Option<PathBuf> {
    let file_name = dir.file_name()?.to_str()?;
    let sibling = match file_name {
        "tauri-rust" => "node-llama-cpp",
        "node-llama-cpp" => "tauri-rust",
        _ => return None,
    };
    Some(dir.parent()?.join(sibling))
}

fn model_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(override_dir) = env::var_os("ELEPHANTNOTE_MODEL_DIR").map(PathBuf::from) {
        dirs.push(override_dir.clone());
        if let Some(sibling) = sibling_model_dir(&override_dir) {
            dirs.push(sibling);
        }
    } else {
        let default_dir = model_dir();
        dirs.push(default_dir.clone());
        if let Some(sibling) = sibling_model_dir(&default_dir) {
            dirs.push(sibling);
        }
    }
    dirs.sort();
    dirs.dedup();
    dirs
}

fn text(value: &Value, keys: &[&str]) -> String {
    if let Some(raw) = value.as_str() {
        return raw.trim().to_string();
    }
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .unwrap_or("")
        .to_string()
}

fn local_runtime_config(payload: &Value) -> &Value {
    payload
        .get("localRuntime")
        .or_else(|| payload.pointer("/aiConfig/localRuntime"))
        .or_else(|| payload.pointer("/config/localRuntime"))
        .unwrap_or(&Value::Null)
}

fn runtime_mode(payload: &Value) -> String {
    let mode = text(
        local_runtime_config(payload),
        &["llamaServerMode", "serverMode", "mode"],
    );
    if mode.trim().is_empty() {
        "bundled".to_string()
    } else {
        mode.to_lowercase()
    }
}

fn selected_model_candidates(selection: &str) -> Vec<String> {
    let raw = selection.trim();
    let normalized = raw.replace('\\', "/");
    let file_name = normalized.rsplit('/').next().unwrap_or(raw).to_string();
    let mut candidates = vec![raw.to_string(), normalized, file_name.clone()];
    if !file_name.to_lowercase().ends_with(".gguf") {
        candidates.push(format!("{file_name}.gguf"));
    }
    candidates.sort();
    candidates.dedup();
    candidates
}

fn manifest_matches(manifest_path: &Path, candidates: &[String]) -> bool {
    let Some(manifest) = fs::read_to_string(manifest_path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
    else {
        return false;
    };
    let fields = [
        text(&manifest, &["id"]),
        text(&manifest, &["name"]),
        text(&manifest, &["model"]),
        text(&manifest, &["fileName"]),
        text(&manifest, &["filename"]),
        text(&manifest, &["modelPath", "path"]),
        text(&manifest, &["repoId"]),
        text(&manifest, &["originalRepoId"]),
    ];
    fields
        .iter()
        .filter(|value| !value.trim().is_empty())
        .any(|value| {
            candidates
                .iter()
                .any(|candidate| value == candidate || value.ends_with(candidate))
        })
}

fn resolve_model_path(selection: &str) -> R<Option<PathBuf>> {
    let selection = selection.trim();
    if selection.is_empty() {
        return Ok(None);
    }

    let direct = PathBuf::from(selection);
    if direct.is_file() {
        return Ok(Some(direct));
    }

    let candidates = selected_model_candidates(selection);
    let dirs = model_dirs();
    for dir in &dirs {
        let _ = fs::create_dir_all(dir);
    }

    for dir in dirs {
        if !dir.exists() {
            continue;
        }
        for item in fs::read_dir(&dir).map_err(|error| error.to_string())? {
            let item = item.map_err(|error| error.to_string())?;
            let path = item.path();
            if !path.is_file() {
                continue;
            }
            let filename = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("")
                .to_string();
            if !filename.to_lowercase().ends_with(".gguf") {
                continue;
            }
            let full = path.to_string_lossy().to_string();
            let manifest_path = PathBuf::from(format!("{}.model.json", full));
            if candidates
                .iter()
                .any(|candidate| candidate == &filename || full.ends_with(candidate))
                || manifest_matches(&manifest_path, &candidates)
            {
                return Ok(Some(path));
            }
        }
    }

    Err(format!(
        "Selected chat model `{selection}` is not installed in any local GGUF model directory: {}.",
        model_dirs()
            .into_iter()
            .map(|dir| dir.to_string_lossy().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

fn base_url_from_env_or_payload(payload: &Value) -> String {
    let runtime = local_runtime_config(payload);
    let from_payload = text(payload, &["llamaBaseUrl", "baseUrl"]);
    let from_runtime = text(runtime, &["llamaBaseUrl", "baseUrl"]);
    if !from_payload.trim().is_empty() {
        return from_payload.trim_end_matches('/').to_string();
    }
    if !from_runtime.trim().is_empty() {
        return from_runtime.trim_end_matches('/').to_string();
    }
    env::var("ELEPHANTNOTE_LLAMA_BASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            env::var("LLAMA_CPP_BASE_URL")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
        .trim_end_matches('/')
        .to_string()
}

fn context_size_from_payload(payload: &Value) -> String {
    payload_u64(
        payload,
        &[
            "/contextWindow",
            "/ctxSize",
            "/aiConfig/routes/chat/contextWindow",
            "/aiConfig/routes/chat/ctxSize",
            "/config/routes/chat/contextWindow",
            "/config/routes/chat/ctxSize",
            "/localRuntime/contextWindow",
            "/localRuntime/ctxSize",
        ],
    )
    .filter(|value| *value >= 512)
    .unwrap_or(4096)
    .to_string()
}

fn embedding_context_window_from_payload(payload: &Value) -> u64 {
    payload_u64(
        payload,
        &[
            "/embeddingContextWindow",
            "/routes/embedding/contextWindow",
            "/aiConfig/routes/embedding/contextWindow",
            "/config/routes/embedding/contextWindow",
            "/localRuntime/embeddingContextWindow",
            "/aiConfig/localRuntime/embeddingContextWindow",
            "/config/localRuntime/embeddingContextWindow",
        ],
    )
    .filter(|value| *value >= 512)
    .unwrap_or(DEFAULT_EMBEDDING_CONTEXT_WINDOW)
    .clamp(512, 32_768)
}

fn embedding_physical_batch_size_from_payload(payload: &Value) -> u64 {
    let requested = payload_u64(
        payload,
        &[
            "/embeddingPhysicalBatchSize",
            "/embeddingUbatchSize",
            "/routes/embedding/physicalBatchSize",
            "/routes/embedding/ubatchSize",
            "/aiConfig/routes/embedding/physicalBatchSize",
            "/config/routes/embedding/physicalBatchSize",
            "/localRuntime/embeddingPhysicalBatchSize",
            "/localRuntime/embeddingUbatchSize",
            "/aiConfig/localRuntime/embeddingPhysicalBatchSize",
            "/config/localRuntime/embeddingPhysicalBatchSize",
        ],
    )
    .filter(|value| *value >= 256)
    .unwrap_or(DEFAULT_EMBEDDING_PHYSICAL_BATCH_SIZE)
    .clamp(256, 8_192);
    requested.min(embedding_context_window_from_payload(payload))
}

fn local_port_from_base_url(base_url: &str) -> Option<u16> {
    let cleaned = base_url.trim_end_matches('/').trim_end_matches("/v1");
    for prefix in ["http://127.0.0.1:", "http://localhost:"] {
        if let Some(rest) = cleaned.strip_prefix(prefix) {
            return rest.split('/').next().unwrap_or(rest).parse::<u16>().ok();
        }
    }
    None
}

#[cfg(unix)]
fn ensure_executable(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    if let Ok(metadata) = fs::metadata(path) {
        let mut permissions = metadata.permissions();
        permissions.set_mode(permissions.mode() | 0o755);
        let _ = fs::set_permissions(path, permissions);
    }
}

#[cfg(not(unix))]
fn ensure_executable(_path: &Path) {}

fn push_if_file(out: &mut Vec<String>, path: PathBuf) {
    if path.is_file() {
        ensure_executable(&path);
        out.push(path.to_string_lossy().to_string());
    }
}

fn app_managed_binary_candidates(app: &AppHandle) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        push_if_file(&mut out, resource_dir.join(LLAMA_SERVER_BIN));
        push_if_file(&mut out, resource_dir.join("bin").join(LLAMA_SERVER_BIN));
    }
    for root in [
        PathBuf::from("Elephant/backend/tauri").join("bin"),
        PathBuf::from("..")
            .join("Elephant/backend/tauri")
            .join("bin"),
        PathBuf::from("bin"),
    ] {
        push_if_file(&mut out, root.join(LLAMA_SERVER_BIN));
    }
    out.sort();
    out.dedup();
    out
}

fn configured_server_path(payload: &Value) -> String {
    let runtime = local_runtime_config(payload);
    let from_payload = text(payload, &["llamaServerPath", "serverPath", "llamaBinary"]);
    if !from_payload.trim().is_empty() {
        return from_payload;
    }
    text(
        runtime,
        &["llamaServerPath", "serverPath", "llamaBinary", "path"],
    )
}

fn payload_u64(payload: &Value, paths: &[&str]) -> Option<u64> {
    paths
        .iter()
        .find_map(|path| payload.pointer(path).and_then(Value::as_u64))
}

fn is_path_mode(payload: &Value) -> bool {
    matches!(
        runtime_mode(payload).as_str(),
        "path" | "custom" | "external" | "existing"
    )
}

fn server_binary_candidates(app: &AppHandle, payload: &Value) -> Vec<String> {
    let mut out = Vec::new();
    let configured_path = configured_server_path(payload);
    if !configured_path.trim().is_empty() {
        out.push(configured_path);
    }

    if !is_path_mode(payload) {
        out.extend(app_managed_binary_candidates(app));
    }

    out.sort();
    out.dedup();
    out
}

fn llama_server_args(
    model_path: &str,
    port: u16,
    context: &str,
    model_name: &str,
    embedding: bool,
    embedding_physical_batch: Option<&str>,
) -> Vec<String> {
    let mut args = vec![
        "-m".to_string(),
        model_path.to_string(),
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "-c".to_string(),
        context.to_string(),
        "--alias".to_string(),
        model_name.to_string(),
    ];
    if embedding {
        args.push("--embedding".to_string());
        args.push("--batch-size".to_string());
        args.push(context.to_string());
        args.push("--ubatch-size".to_string());
        args.push(embedding_physical_batch.unwrap_or("1024").to_string());
    }
    args
}

async fn server_ready(base_url: &str) -> bool {
    let Ok(client) = Client::builder().timeout(Duration::from_secs(2)).build() else {
        return false;
    };
    client
        .get(format!("{}/models", base_url))
        .send()
        .await
        .map(|response| response.status().is_success())
        .unwrap_or(false)
}

async fn wait_until_ready(base_url: &str) -> bool {
    for attempt in 0..160 {
        if server_ready(base_url).await {
            eprintln!(
                "[tauri-rag] llama server ready after {} checks",
                attempt + 1
            );
            return true;
        }
        let _ =
            tauri::async_runtime::spawn_blocking(|| std::thread::sleep(Duration::from_millis(250)))
                .await;
    }
    false
}

async fn start_server_if_needed(
    app: &AppHandle,
    model_path: &Path,
    model_name: &str,
    base_url: &str,
    payload: &Value,
    embedding: bool,
) -> R<()> {
    if server_ready(base_url).await {
        eprintln!("[tauri-rag] llama server already reachable at {base_url}");
        return Ok(());
    }

    let port = local_port_from_base_url(base_url).unwrap_or(DEFAULT_PORT);
    let model_path_string = model_path.to_string_lossy().to_string();
    let embedding_physical_batch =
        embedding.then(|| embedding_physical_batch_size_from_payload(payload).to_string());
    let context = if embedding {
        embedding_context_window_from_payload(payload).to_string()
    } else {
        context_size_from_payload(payload)
    };
    let candidates = server_binary_candidates(app, payload);
    if candidates.is_empty() {
        if is_path_mode(payload) {
            return Err(
                "Local llama runtime is set to `path`, but no llama-server path is configured."
                    .to_string(),
            );
        }
        return Err("Bundled llama-server is missing. ElephantNote expects it in Elephant/backend/tauri/bin/llama-server or as a bundled Tauri resource.".to_string());
    }

    eprintln!(
        "[tauri-rag] starting bundled llama server model={} base={} mode={} candidates={}",
        model_path_string,
        base_url,
        runtime_mode(payload),
        candidates.join(", ")
    );
    let args = llama_server_args(
        &model_path_string,
        port,
        &context,
        model_name,
        embedding,
        embedding_physical_batch.as_deref(),
    );
    let mut errors = Vec::new();
    for binary in candidates {
        eprintln!(
            "[tauri-rag] trying bundled llama server binary: {} args={}",
            binary,
            args.join(" ")
        );
        match Command::new(&binary)
            .args(&args)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .spawn()
        {
            Ok(mut child) => {
                if wait_until_ready(base_url).await {
                    return Ok(());
                }
                let _ = child.kill();
                let _ = child.wait();
                errors.push(format!(
                    "{}: endpoint did not become ready at {base_url}",
                    binary
                ));
            }
            Err(error) => errors.push(format!("{}: {}", binary, error)),
        }
    }

    Err(format!(
        "Unable to start ElephantNote bundled llama server. Attempts: {}",
        errors.join(" | ")
    ))
}

pub async fn chat_with_selected_model(
    app: &AppHandle,
    selection: &str,
    messages: &[Value],
    payload: &Value,
) -> R<Option<LocalChatResult>> {
    let Some(model_path) = resolve_model_path(selection)? else {
        return Ok(None);
    };
    let base_url = base_url_from_env_or_payload(payload);
    let model_name = model_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("local.gguf")
        .to_string();
    start_server_if_needed(app, &model_path, &model_name, &base_url, payload, false).await?;

    let temperature = payload
        .get("temperature")
        .and_then(Value::as_f64)
        .unwrap_or(0.2);
    let max_tokens = payload
        .get("maxTokens")
        .or_else(|| payload.get("max_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(900);
    let body = json!({
      "model": model_name,
      "messages": messages,
      "temperature": temperature,
      "max_tokens": max_tokens
    });

    let response = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?
        .post(format!("{}/chat/completions", base_url))
        .json(&body)
        .send()
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status();
    let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
    if !status.is_success() {
        return Err(error_text(
            &data,
            format!("Local llama.cpp server returned HTTP {status}."),
        ));
    }
    let answer = data
        .pointer("/choices/0/message/content")
        .and_then(Value::as_str)
        .or_else(|| data.pointer("/choices/0/text").and_then(Value::as_str))
        .unwrap_or("")
        .trim()
        .to_string();
    if answer.is_empty() {
        return Err("Local llama.cpp server returned an empty answer.".to_string());
    }
    Ok(Some(LocalChatResult {
        answer,
        provider: if is_path_mode(payload) {
            "tauri-rust-local-path".to_string()
        } else {
            "tauri-rust-local-bundled".to_string()
        },
        model: model_name,
        base_url,
    }))
}

fn truncate_embedding_input(text: &str, physical_batch_size: u64) -> String {
    let max_bytes = physical_batch_size.saturating_sub(64).clamp(192, 8_128) as usize;
    if text.len() <= max_bytes {
        return text.to_string();
    }
    let mut end = max_bytes;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_string()
}

fn embedding_capacity_error(message: &str) -> bool {
    let normalized = message.to_lowercase();
    normalized.contains("physical batch size")
        || normalized.contains("input") && normalized.contains("too large to process")
        || normalized.contains("prompt") && normalized.contains("too long")
}

pub async fn embed_with_selected_model(
    app: &AppHandle,
    selection: &str,
    text: &str,
    payload: &Value,
) -> R<Vec<f32>> {
    let Some(model_path) = resolve_model_path(selection)? else {
        return Err("No local embedding model is selected.".into());
    };
    let base_url = DEFAULT_EMBEDDING_BASE_URL.to_string();
    let model_name = model_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("embedding.gguf")
        .to_string();
    start_server_if_needed(app, &model_path, &model_name, &base_url, payload, true).await?;
    let configured_batch = embedding_physical_batch_size_from_payload(payload);
    let mut attempts = vec![
        configured_batch,
        configured_batch.saturating_div(2).max(256),
        512,
        384,
        256,
    ];
    attempts.sort_unstable_by(|left, right| right.cmp(left));
    attempts.dedup();
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?;
    let mut last_error = String::new();
    for capacity in attempts {
        let input = truncate_embedding_input(text, capacity);
        let response = client
            .post(format!("{}/embeddings", base_url))
            .json(&json!({ "model": model_name, "input": input }))
            .send()
            .await
            .map_err(|error| error.to_string())?;
        let status = response.status();
        let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
        if status.is_success() {
            return data
                .pointer("/data/0/embedding")
                .and_then(Value::as_array)
                .ok_or_else(|| "Local embedding server returned no embedding vector.".to_string())?
                .iter()
                .map(|value| {
                    value
                        .as_f64()
                        .map(|number| number as f32)
                        .ok_or_else(|| "Local embedding vector contains a non-number.".to_string())
                })
                .collect();
        }
        last_error = error_text(
            &data,
            format!("Local embedding server returned HTTP {status}."),
        );
        if !embedding_capacity_error(&last_error) {
            return Err(last_error);
        }
        eprintln!(
            "[tauri-rag] embedding input exceeded runtime capacity; retrying with byte_budget={} configured_ubatch={} error={}",
            capacity.saturating_sub(64),
            configured_batch,
            last_error
        );
    }
    Err(format!(
        "Local embedding input still exceeds the active llama.cpp capacity after safe truncation. Restart Elephant to apply the configured embedding physical batch size (currently {}). Last error: {}",
        configured_batch,
        last_error
    ))
}

fn error_text(data: &Value, fallback: String) -> String {
    data.pointer("/error/message")
        .and_then(Value::as_str)
        .or_else(|| data.get("error").and_then(Value::as_str))
        .or_else(|| data.get("message").and_then(Value::as_str))
        .filter(|value| !value.trim().is_empty())
        .map(str::to_string)
        .unwrap_or(fallback)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_candidates_include_filename() {
        let values = selected_model_candidates("/tmp/model.Q4_K_M.gguf");
        assert!(values.contains(&"model.Q4_K_M.gguf".to_string()));
    }

    #[test]
    fn local_port_from_default_base_url() {
        assert_eq!(
            local_port_from_base_url(DEFAULT_BASE_URL),
            Some(DEFAULT_PORT)
        );
    }

    #[test]
    fn default_runtime_mode_is_bundled() {
        assert_eq!(runtime_mode(&json!({})), "bundled");
    }

    #[test]
    fn nested_runtime_mode_is_read_from_ai_config() {
        assert!(is_path_mode(&json!({
          "aiConfig": { "localRuntime": { "llamaServerMode": "path" } }
        })));
    }

    #[test]
    fn configured_server_path_prefers_payload_over_ai_config() {
        let payload = json!({
          "llamaServerPath": "/tmp/payload-llama-server",
          "aiConfig": { "localRuntime": { "llamaServerPath": "/tmp/config-llama-server" } }
        });
        assert_eq!(
            configured_server_path(&payload),
            "/tmp/payload-llama-server"
        );
    }

    #[test]
    fn configured_server_path_reads_ai_config() {
        let payload = json!({
          "aiConfig": { "localRuntime": { "llamaServerPath": "/tmp/config-llama-server" } }
        });
        assert_eq!(configured_server_path(&payload), "/tmp/config-llama-server");
    }

    #[test]
    fn runtime_base_url_prefers_payload_over_ai_config() {
        let payload = json!({
          "llamaBaseUrl": "http://127.0.0.1:50000/v1/",
          "aiConfig": { "localRuntime": { "llamaBaseUrl": "http://127.0.0.1:49999/v1/" } }
        });
        assert_eq!(
            base_url_from_env_or_payload(&payload),
            "http://127.0.0.1:50000/v1"
        );
    }

    #[test]
    fn runtime_base_url_reads_ai_config() {
        let value = json!({
          "aiConfig": { "localRuntime": { "llamaBaseUrl": "http://127.0.0.1:49999/v1/" } }
        });
        assert_eq!(
            base_url_from_env_or_payload(&value),
            "http://127.0.0.1:49999/v1"
        );
    }

    #[test]
    fn context_size_rejects_too_small_values() {
        assert_eq!(
            context_size_from_payload(&json!({ "ctxSize": 128 })),
            "4096"
        );
        assert_eq!(
            context_size_from_payload(&json!({ "ctxSize": 2048 })),
            "2048"
        );
    }

    #[test]
    fn context_size_reads_nested_chat_route() {
        let payload = json!({
          "aiConfig": { "routes": { "chat": { "contextWindow": 8192 } } }
        });
        assert_eq!(context_size_from_payload(&payload), "8192");
    }

    #[test]
    fn llama_server_args_set_model_alias() {
        let args = llama_server_args("/models/smol.gguf", 39281, "4096", "smol.gguf", false, None);
        assert!(args
            .windows(2)
            .any(|window| window == ["--alias", "smol.gguf"]));
        assert!(args
            .windows(2)
            .any(|window| window == ["-m", "/models/smol.gguf"]));
    }

    #[test]
    fn embedding_capacity_defaults_are_large_enough_for_multi_view_inputs() {
        let payload = json!({});
        assert_eq!(embedding_context_window_from_payload(&payload), 2048);
        assert_eq!(embedding_physical_batch_size_from_payload(&payload), 1024);
    }

    #[test]
    fn embedding_capacity_reads_local_runtime_settings() {
        let payload = json!({
            "aiConfig": {
                "localRuntime": {
                    "embeddingContextWindow": 4096,
                    "embeddingPhysicalBatchSize": 2048
                }
            }
        });
        assert_eq!(embedding_context_window_from_payload(&payload), 4096);
        assert_eq!(embedding_physical_batch_size_from_payload(&payload), 2048);
    }

    #[test]
    fn embedding_server_args_include_logical_and_physical_batches() {
        let args = llama_server_args(
            "/models/embed.gguf",
            39282,
            "2048",
            "embed.gguf",
            true,
            Some("1024"),
        );
        assert!(args
            .windows(2)
            .any(|window| window == ["--batch-size", "2048"]));
        assert!(args
            .windows(2)
            .any(|window| window == ["--ubatch-size", "1024"]));
    }

    #[test]
    fn embedding_truncation_respects_the_active_physical_batch() {
        let input = "x".repeat(2_000);
        assert_eq!(truncate_embedding_input(&input, 512).len(), 448);
        assert_eq!(truncate_embedding_input(&input, 1024).len(), 960);
    }

    #[test]
    fn bundled_runtime_does_not_add_global_shell_candidates() {
        let payload = json!({});
        let candidates = server_binary_candidates_for_test(&payload);
        assert!(!candidates.contains(&"llama-server".to_string()));
        assert!(!candidates.contains(&"/opt/homebrew/bin/llama-server".to_string()));
    }

    #[test]
    fn path_mode_uses_configured_binary_only() {
        let payload = json!({ "localRuntime": { "llamaServerMode": "path", "llamaServerPath": "/tmp/llama-server" } });
        let mut out = Vec::new();
        let configured = configured_server_path(&payload);
        if !configured.is_empty() {
            out.push(configured);
        }
        assert_eq!(out, vec!["/tmp/llama-server".to_string()]);
    }

    #[test]
    fn sibling_model_directory_prefers_compatibility_fallback() {
        let root = std::env::temp_dir().join(format!(
            "elephant-local-llama-runtime-{}",
            std::process::id()
        ));
        let tauri_dir = root.join("tauri-rust");
        let compatibility_dir = root.join("node-llama-cpp");
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&compatibility_dir).unwrap();
        let model_path = compatibility_dir.join("smollm2-node-llama-cpp-chat.gguf");
        fs::write(&model_path, "fake model").unwrap();

        let resolved = resolve_model_path_in_dirs(
            "smollm2-node-llama-cpp-chat",
            &[tauri_dir.clone(), compatibility_dir.clone()],
        )
        .unwrap()
        .unwrap();

        assert_eq!(resolved, model_path);
        let _ = fs::remove_dir_all(&root);
    }

    fn server_binary_candidates_for_test(payload: &Value) -> Vec<String> {
        let mut out = Vec::new();
        let configured_path = configured_server_path(payload);
        if !configured_path.trim().is_empty() {
            out.push(configured_path);
        }
        out.sort();
        out.dedup();
        out
    }

    fn resolve_model_path_in_dirs(selection: &str, dirs: &[PathBuf]) -> R<Option<PathBuf>> {
        let selection = selection.trim();
        if selection.is_empty() {
            return Ok(None);
        }

        let direct = PathBuf::from(selection);
        if direct.is_file() {
            return Ok(Some(direct));
        }

        let candidates = selected_model_candidates(selection);
        for dir in dirs {
            let _ = fs::create_dir_all(dir);
        }

        for dir in dirs {
            if !dir.exists() {
                continue;
            }
            for item in fs::read_dir(dir).map_err(|error| error.to_string())? {
                let item = item.map_err(|error| error.to_string())?;
                let path = item.path();
                if !path.is_file() {
                    continue;
                }
                let filename = path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .unwrap_or("")
                    .to_string();
                if !filename.to_lowercase().ends_with(".gguf") {
                    continue;
                }
                let full = path.to_string_lossy().to_string();
                let manifest_path = PathBuf::from(format!("{}.model.json", full));
                if candidates
                    .iter()
                    .any(|candidate| candidate == &filename || full.ends_with(candidate))
                    || manifest_matches(&manifest_path, &candidates)
                {
                    return Ok(Some(path));
                }
            }
        }

        Ok(None)
    }
}

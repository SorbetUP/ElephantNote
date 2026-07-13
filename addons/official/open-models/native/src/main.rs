use futures_util::StreamExt;
use reqwest::Client;
use serde_json::{json, Value};
use std::{
  env,
  path::{Path, PathBuf},
  process::Stdio,
  time::Duration,
};
use tokio::{
  fs,
  io::{self, AsyncBufReadExt, AsyncWriteExt, BufReader, BufWriter},
  process::{Child, Command},
  time::sleep,
};

const PROTOCOL: &str = "elephant-addon-service-v1";
const ADDON_ID: &str = "elephant.open-models";
const DEFAULT_BASE_URL: &str = "http://127.0.0.1:39281/v1";

struct ModelService {
  data_dir: PathBuf,
  models_dir: PathBuf,
  active_path: PathBuf,
  server: Option<Child>,
  server_base_url: String,
  server_model_path: String,
  client: Client,
}

impl ModelService {
  async fn new() -> Result<Self, String> {
    let data_dir = env::var_os("ELEPHANT_ADDON_DATA_DIR")
      .map(PathBuf::from)
      .ok_or_else(|| "ELEPHANT_ADDON_DATA_DIR is unavailable".to_string())?;
    let models_dir = data_dir.join("models");
    fs::create_dir_all(&models_dir).await.map_err(|error| error.to_string())?;
    let client = Client::builder()
      .timeout(Duration::from_secs(180))
      .build()
      .map_err(|error| error.to_string())?;
    Ok(Self {
      active_path: data_dir.join("active-model.json"),
      data_dir,
      models_dir,
      server: None,
      server_base_url: String::new(),
      server_model_path: String::new(),
      client,
    })
  }

  async fn status(&mut self) -> Value {
    let server_running = match self.server.as_mut() {
      Some(child) => matches!(child.try_wait(), Ok(None)),
      None => false,
    };
    json!({
      "running": true,
      "owner": ADDON_ID,
      "dataDirectory": self.data_dir.to_string_lossy(),
      "modelsDirectory": self.models_dir.to_string_lossy(),
      "serverRunning": server_running,
      "serverBaseUrl": self.server_base_url,
      "serverModelPath": self.server_model_path
    })
  }

  async fn read_json(path: &Path) -> Option<Value> {
    let raw = fs::read_to_string(path).await.ok()?;
    serde_json::from_str(&raw).ok()
  }

  async fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
      fs::create_dir_all(parent).await.map_err(|error| error.to_string())?;
    }
    let encoded = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(path, encoded).await.map_err(|error| error.to_string())
  }

  fn metadata_path(model_path: &Path) -> PathBuf {
    PathBuf::from(format!("{}.model.json", model_path.to_string_lossy()))
  }

  fn safe_name(value: &str) -> String {
    let normalized = value
      .chars()
      .map(|character| if character.is_ascii_alphanumeric() || matches!(character, '.' | '-' | '_') { character } else { '-' })
      .collect::<String>();
    let compact = normalized.split('-').filter(|part| !part.is_empty()).collect::<Vec<_>>().join("-");
    if compact.is_empty() { "model.gguf".to_string() } else { compact }
  }

  async fn list_models(&self) -> Result<Vec<Value>, String> {
    let active = Self::read_json(&self.active_path).await.unwrap_or(Value::Null);
    let active_path = active.get("path").and_then(Value::as_str).unwrap_or("");
    let mut output = Vec::new();
    let mut entries = fs::read_dir(&self.models_dir).await.map_err(|error| error.to_string())?;
    while let Some(entry) = entries.next_entry().await.map_err(|error| error.to_string())? {
      let path = entry.path();
      if !path.is_file() || path.extension().and_then(|value| value.to_str()).map(|value| !value.eq_ignore_ascii_case("gguf")).unwrap_or(true) {
        continue;
      }
      let metadata = fs::metadata(&path).await.map_err(|error| error.to_string())?;
      let manifest = Self::read_json(&Self::metadata_path(&path)).await.unwrap_or_else(|| json!({}));
      let canonical = path.to_string_lossy().to_string();
      output.push(json!({
        "id": manifest.get("id").and_then(Value::as_str).unwrap_or_else(|| path.file_name().and_then(|value| value.to_str()).unwrap_or("model.gguf")),
        "name": manifest.get("name").and_then(Value::as_str).unwrap_or_else(|| path.file_stem().and_then(|value| value.to_str()).unwrap_or("Model")),
        "repoId": manifest.get("repoId").and_then(Value::as_str).unwrap_or(""),
        "fileName": path.file_name().and_then(|value| value.to_str()).unwrap_or("model.gguf"),
        "path": canonical,
        "modelPath": path.to_string_lossy(),
        "size": metadata.len(),
        "provider": "open-models",
        "format": "gguf",
        "status": "downloaded",
        "active": active_path == path.to_string_lossy()
      }));
    }
    output.sort_by(|left, right| {
      left.get("name").and_then(Value::as_str).unwrap_or("")
        .to_lowercase()
        .cmp(&right.get("name").and_then(Value::as_str).unwrap_or("").to_lowercase())
    });
    Ok(output)
  }

  async fn resolve_model(&self, requested: &str) -> Result<Value, String> {
    let requested = requested.trim();
    let models = self.list_models().await?;
    if requested.is_empty() {
      let active = Self::read_json(&self.active_path).await.unwrap_or(Value::Null);
      let active_path = active.get("path").and_then(Value::as_str).unwrap_or("");
      if let Some(model) = models.iter().find(|model| model.get("path").and_then(Value::as_str) == Some(active_path)) {
        return Ok(model.clone());
      }
      return Err("No active GGUF model is selected".to_string());
    }
    models.into_iter().find(|model| {
      ["id", "name", "repoId", "fileName", "path", "modelPath"]
        .iter()
        .filter_map(|key| model.get(*key).and_then(Value::as_str))
        .any(|value| value == requested || value.ends_with(requested))
    }).ok_or_else(|| format!("Installed GGUF model not found: {requested}"))
  }

  async fn active(&self) -> Value {
    Self::read_json(&self.active_path).await.unwrap_or(Value::Null)
  }

  async fn activate(&self, requested: &str) -> Result<Value, String> {
    let model = self.resolve_model(requested).await?;
    let value = json!({
      "id": model.get("id").cloned().unwrap_or(Value::Null),
      "name": model.get("name").cloned().unwrap_or(Value::Null),
      "repoId": model.get("repoId").cloned().unwrap_or(Value::Null),
      "fileName": model.get("fileName").cloned().unwrap_or(Value::Null),
      "path": model.get("path").cloned().unwrap_or(Value::Null),
      "activatedAt": timestamp()
    });
    Self::write_json(&self.active_path, &value).await?;
    Ok(value)
  }

  async fn deactivate(&mut self) -> Result<Value, String> {
    self.stop_server().await;
    if self.active_path.exists() {
      fs::remove_file(&self.active_path).await.map_err(|error| error.to_string())?;
    }
    Ok(json!({ "active": false }))
  }

  async fn delete_model(&mut self, requested: &str) -> Result<Value, String> {
    let model = self.resolve_model(requested).await?;
    let path = PathBuf::from(model.get("path").and_then(Value::as_str).ok_or_else(|| "Model path is missing".to_string())?);
    if self.server_model_path == path.to_string_lossy() {
      self.stop_server().await;
    }
    let active = self.active().await;
    if active.get("path").and_then(Value::as_str) == Some(path.to_string_lossy().as_ref()) {
      let _ = fs::remove_file(&self.active_path).await;
    }
    fs::remove_file(&path).await.map_err(|error| error.to_string())?;
    let _ = fs::remove_file(Self::metadata_path(&path)).await;
    Ok(json!({ "deleted": true, "path": path }))
  }

  async fn hugging_face_model(&self, repo_id: &str) -> Result<Value, String> {
    let repo_id = repo_id.trim();
    if repo_id.is_empty() {
      return Err("A Hugging Face repository id is required".to_string());
    }
    let url = format!("https://huggingface.co/api/models/{repo_id}");
    let response = self.client.get(url).send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let value = response.json::<Value>().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
      return Err(value.pointer("/error").and_then(Value::as_str).unwrap_or("Hugging Face model lookup failed").to_string());
    }
    Ok(value)
  }

  fn choose_gguf(model: &Value) -> Option<String> {
    let siblings = model.get("siblings").and_then(Value::as_array)?;
    let mut files = siblings.iter()
      .filter_map(|entry| entry.get("rfilename").and_then(Value::as_str))
      .filter(|file| file.to_ascii_lowercase().ends_with(".gguf"))
      .map(str::to_string)
      .collect::<Vec<_>>();
    files.sort_by_key(|file| {
      let upper = file.to_ascii_uppercase();
      if upper.contains("Q4_K_M") { 0 }
      else if upper.contains("Q5_K_M") { 1 }
      else if upper.contains("Q4_K_S") { 2 }
      else if upper.contains("Q8_0") { 3 }
      else { 10 }
    });
    files.into_iter().next()
  }

  async fn download(&self, params: &Value) -> Result<Value, String> {
    let requested = params.get("id").or_else(|| params.get("repoId")).and_then(Value::as_str).unwrap_or("").trim();
    if requested.is_empty() {
      return Err("A Hugging Face repository id or GGUF URL is required".to_string());
    }
    let (repo_id, file_name, url) = if requested.starts_with("https://") {
      let file_name = requested.split('/').last().unwrap_or("model.gguf").split('?').next().unwrap_or("model.gguf").to_string();
      if !file_name.to_ascii_lowercase().ends_with(".gguf") {
        return Err("Direct model URLs must point to a .gguf file".to_string());
      }
      (String::new(), file_name, requested.to_string())
    } else {
      let info = self.hugging_face_model(requested).await?;
      let file_name = params.get("fileName").and_then(Value::as_str).map(str::to_string)
        .or_else(|| Self::choose_gguf(&info))
        .ok_or_else(|| format!("No GGUF file was found in {requested}"))?;
      let encoded = file_name.split('/').map(urlencoding::encode).collect::<Vec<_>>().join("/");
      (requested.to_string(), file_name.clone(), format!("https://huggingface.co/{requested}/resolve/main/{encoded}"))
    };
    let target_name = Self::safe_name(&format!("{}--{}", repo_id.replace('/', "--"), file_name.replace('/', "--")));
    let target = self.models_dir.join(if target_name.to_ascii_lowercase().ends_with(".gguf") { target_name } else { format!("{target_name}.gguf") });
    let temporary = target.with_extension("gguf.part");

    let response = self.client.get(&url).send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
      return Err(format!("Model download returned HTTP {}", response.status()));
    }
    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut file = fs::File::create(&temporary).await.map_err(|error| error.to_string())?;
    let mut written = 0_u64;
    while let Some(chunk) = stream.next().await {
      let chunk = chunk.map_err(|error| error.to_string())?;
      file.write_all(&chunk).await.map_err(|error| error.to_string())?;
      written += chunk.len() as u64;
    }
    file.flush().await.map_err(|error| error.to_string())?;
    fs::rename(&temporary, &target).await.map_err(|error| error.to_string())?;
    let metadata = json!({
      "id": if repo_id.is_empty() { target.file_name().and_then(|value| value.to_str()).unwrap_or("model.gguf") } else { repo_id.as_str() },
      "name": if repo_id.is_empty() { file_name.trim_end_matches(".gguf") } else { repo_id.split('/').last().unwrap_or(repo_id.as_str()) },
      "repoId": repo_id,
      "fileName": file_name,
      "path": target,
      "size": written,
      "expectedSize": total,
      "downloadedAt": timestamp()
    });
    Self::write_json(&Self::metadata_path(&target), &metadata).await?;
    Ok(metadata)
  }

  async fn search(&self, params: &Value) -> Result<Value, String> {
    let query = params.get("query").and_then(Value::as_str).unwrap_or("gguf").trim();
    let limit = params.get("limit").and_then(Value::as_u64).unwrap_or(30).clamp(1, 100);
    let url = format!(
      "https://huggingface.co/api/models?search={}&filter=gguf&limit={limit}&sort=downloads&direction=-1",
      urlencoding::encode(query)
    );
    let response = self.client.get(url).send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let models = response.json::<Value>().await.map_err(|error| error.to_string())?;
    if !status.is_success() {
      return Err(format!("Hugging Face search returned HTTP {status}"));
    }
    Ok(json!({ "models": models }))
  }

  fn base_url(params: &Value) -> String {
    [
      params.get("baseUrl").and_then(Value::as_str),
      params.pointer("/route/llamaBaseUrl").and_then(Value::as_str),
      params.pointer("/config/localRuntime/llamaBaseUrl").and_then(Value::as_str),
    ]
    .into_iter()
    .flatten()
    .find(|value| !value.trim().is_empty())
    .map(|value| value.trim_end_matches('/').to_string())
    .or_else(|| env::var("ELEPHANT_LLAMA_BASE_URL").ok())
    .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
  }

  fn server_path(params: &Value) -> Option<PathBuf> {
    let configured = [
      params.get("llamaServerPath").and_then(Value::as_str),
      params.pointer("/route/llamaServerPath").and_then(Value::as_str),
      params.pointer("/config/localRuntime/llamaServerPath").and_then(Value::as_str),
    ]
    .into_iter()
    .flatten()
    .find(|value| !value.trim().is_empty())
    .map(PathBuf::from)
    .or_else(|| env::var_os("ELEPHANT_LLAMA_SERVER_PATH").map(PathBuf::from));
    if configured.as_ref().is_some_and(|path| path.is_file()) {
      return configured;
    }
    let binary = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
    env::var_os("PATH").and_then(|path| {
      env::split_paths(&path).map(|directory| directory.join(binary)).find(|candidate| candidate.is_file())
    })
  }

  fn port(base_url: &str) -> u16 {
    let cleaned = base_url.trim_end_matches('/').trim_end_matches("/v1");
    cleaned.rsplit(':').next().and_then(|value| value.split('/').next()).and_then(|value| value.parse().ok()).unwrap_or(39281)
  }

  async fn server_ready(&self, base_url: &str) -> bool {
    self.client.get(format!("{}/models", base_url.trim_end_matches('/')))
      .timeout(Duration::from_secs(2))
      .send().await.map(|response| response.status().is_success()).unwrap_or(false)
  }

  async fn ensure_server(&mut self, model: &Value, params: &Value) -> Result<String, String> {
    let model_path = model.get("path").and_then(Value::as_str).ok_or_else(|| "Model path is missing".to_string())?;
    let base_url = Self::base_url(params);
    if self.server_ready(&base_url).await {
      self.server_base_url = base_url.clone();
      self.server_model_path = model_path.to_string();
      return Ok(base_url);
    }
    self.stop_server().await;
    let binary = Self::server_path(params).ok_or_else(|| "llama-server was not found. Configure a package runtime path or install llama.cpp.".to_string())?;
    let alias = Path::new(model_path).file_name().and_then(|value| value.to_str()).unwrap_or("local.gguf");
    let context = params.pointer("/route/contextWindow").and_then(Value::as_u64).unwrap_or(8192).max(512).to_string();
    let port = Self::port(&base_url).to_string();
    let child = Command::new(binary)
      .args(["-m", model_path, "--host", "127.0.0.1", "--port", &port, "-c", &context, "--alias", alias])
      .stdin(Stdio::null())
      .stdout(Stdio::null())
      .stderr(Stdio::null())
      .kill_on_drop(true)
      .spawn()
      .map_err(|error| format!("Unable to start llama-server: {error}"))?;
    self.server = Some(child);
    for _ in 0..120 {
      if self.server_ready(&base_url).await {
        self.server_base_url = base_url.clone();
        self.server_model_path = model_path.to_string();
        return Ok(base_url);
      }
      sleep(Duration::from_millis(250)).await;
    }
    self.stop_server().await;
    Err("llama-server did not become ready".to_string())
  }

  async fn chat(&mut self, params: &Value) -> Result<Value, String> {
    let requested = params.get("model").and_then(Value::as_str).unwrap_or("");
    let model = self.resolve_model(requested).await?;
    let base_url = self.ensure_server(&model, params).await?;
    let model_name = model.get("fileName").and_then(Value::as_str).unwrap_or("local.gguf");
    let body = json!({
      "model": model_name,
      "messages": params.get("messages").cloned().unwrap_or_else(|| json!([])),
      "temperature": params.pointer("/route/temperature").and_then(Value::as_f64).unwrap_or(0.2),
      "max_tokens": params.pointer("/route/maxTokens").and_then(Value::as_u64).unwrap_or(2048)
    });
    let response = self.client.post(format!("{}/chat/completions", base_url.trim_end_matches('/')))
      .json(&body).send().await.map_err(|error| error.to_string())?;
    let status = response.status();
    let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
    if !status.is_success() {
      return Err(data.pointer("/error/message").and_then(Value::as_str).unwrap_or("Local model request failed").to_string());
    }
    let answer = data.pointer("/choices/0/message/content").and_then(Value::as_str)
      .or_else(|| data.pointer("/choices/0/text").and_then(Value::as_str))
      .unwrap_or("").trim();
    if answer.is_empty() {
      return Err("llama-server returned an empty answer".to_string());
    }
    Ok(json!({ "answer": answer, "provider": "app-local", "model": model_name, "baseUrl": base_url }))
  }

  async fn stop_server(&mut self) {
    if let Some(mut child) = self.server.take() {
      let _ = child.kill().await;
      let _ = child.wait().await;
    }
    self.server_base_url.clear();
    self.server_model_path.clear();
  }

  async fn handle(&mut self, method: &str, params: Value) -> Result<Value, String> {
    match method {
      "service.start" | "models.status" => Ok(self.status().await),
      "service.stop" => {
        self.stop_server().await;
        Ok(json!({ "running": false, "stopped": true }))
      }
      "models.list" | "models.list-local" => Ok(json!({ "models": self.list_models().await? })),
      "models.search" => self.search(&params).await,
      "models.info" => self.hugging_face_model(params.get("id").and_then(Value::as_str).unwrap_or("")).await,
      "models.download" => self.download(&params).await,
      "models.activate" => self.activate(params.get("id").or_else(|| params.get("model")).and_then(Value::as_str).unwrap_or("")).await,
      "models.deactivate" => self.deactivate().await,
      "models.active" => Ok(self.active().await),
      "models.delete" => self.delete_model(params.get("id").or_else(|| params.get("model")).and_then(Value::as_str).unwrap_or("")).await,
      "models.chat" => self.chat(&params).await,
      other => Err(format!("Unsupported Open Models service method: {other}")),
    }
  }
}

fn timestamp() -> String {
  std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn success(id: u64, result: Value) -> Value {
  json!({ "protocol": PROTOCOL, "id": id, "ok": true, "result": result })
}

fn failure(id: u64, message: impl Into<String>) -> Value {
  json!({ "protocol": PROTOCOL, "id": id, "ok": false, "error": { "message": message.into() } })
}

#[tokio::main]
async fn main() {
  let mut service = match ModelService::new().await {
    Ok(service) => service,
    Err(error) => {
      println!("{}", failure(0, error));
      return;
    }
  };
  let stdin = io::stdin();
  let stdout = io::stdout();
  let mut lines = BufReader::new(stdin).lines();
  let mut writer = BufWriter::new(stdout);

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
    let addon_id = request.get("addonId").and_then(Value::as_str).unwrap_or(ADDON_ID);
    let method = request.get("method").and_then(Value::as_str).unwrap_or("");
    let params = request.get("params").cloned().unwrap_or_else(|| json!({}));
    let response = if protocol != PROTOCOL {
      failure(id, format!("Unsupported service protocol: {protocol}"))
    } else if addon_id != ADDON_ID {
      failure(id, format!("Service addon id mismatch: {addon_id}"))
    } else {
      match service.handle(method, params).await {
        Ok(result) => success(id, result),
        Err(error) => failure(id, error),
      }
    };
    if writer.write_all(format!("{response}\n").as_bytes()).await.is_err() || writer.flush().await.is_err() {
      break;
    }
    if method == "service.stop" {
      break;
    }
  }
  service.stop_server().await;
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn model_names_are_confined_to_one_file() {
    let name = ModelService::safe_name("org/model ../ Q4_K_M.gguf");
    assert!(!name.contains('/'));
    assert!(!name.contains(".."));
  }

  #[test]
  fn chooses_practical_default_quantization() {
    let info = json!({ "siblings": [
      { "rfilename": "model-Q8_0.gguf" },
      { "rfilename": "model-Q4_K_M.gguf" },
      { "rfilename": "README.md" }
    ] });
    assert_eq!(ModelService::choose_gguf(&info).as_deref(), Some("model-Q4_K_M.gguf"));
  }
}

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  collections::HashMap,
  fs,
  io::ErrorKind,
  path::{Path, PathBuf},
  process::Stdio,
  sync::{
    atomic::{AtomicU64, Ordering},
    OnceLock,
  },
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tokio::{
  io::{AsyncReadExt, AsyncWriteExt},
  process::Command,
  sync::{oneshot, Mutex},
  time::timeout,
};

use crate::vault::config as vault_config;

pub type R<T> = Result<T, String>;

const CUSTOM_CONFIG_FILE: &str = "code-execution-custom.json";
const DEFAULT_TIMEOUT_MS: u64 = 15_000;
const MAX_CODE_BYTES: usize = 256 * 1024;
const MAX_CUSTOM_INTERPRETERS: usize = 64;
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);
static RUNNING: OnceLock<Mutex<HashMap<String, oneshot::Sender<()>>>> = OnceLock::new();

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomInterpreter {
  pub id: String,
  pub label: String,
  #[serde(default)]
  pub aliases: Vec<String>,
  pub executable: String,
  #[serde(default)]
  pub args: Vec<String>,
  #[serde(default = "default_enabled")]
  pub enabled: bool,
  #[serde(default)]
  pub template: String,
}

fn default_enabled() -> bool {
  true
}

fn running() -> &'static Mutex<HashMap<String, oneshot::Sender<()>>> {
  RUNNING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_request_id(action: &str) -> String {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis();
  let sequence = REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
  format!("custom-{action}-{timestamp}-{sequence}")
}

fn code_log(event: &str, request_id: &str, details: impl AsRef<str>) {
  let details = details.as_ref();
  if details.is_empty() {
    eprintln!("[Code] {event} request={request_id}");
  } else {
    eprintln!("[Code] {event} request={request_id} {details}");
  }
}

fn config_path(app: &AppHandle) -> R<PathBuf> {
  let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
  Ok(directory.join(CUSTOM_CONFIG_FILE))
}

fn normalize_token(value: &str) -> String {
  value
    .trim()
    .to_ascii_lowercase()
    .chars()
    .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.'))
    .collect()
}

fn validate(mut interpreters: Vec<CustomInterpreter>) -> R<Vec<CustomInterpreter>> {
  if interpreters.len() > MAX_CUSTOM_INTERPRETERS {
    return Err(format!("No more than {MAX_CUSTOM_INTERPRETERS} custom interpreters are supported."));
  }
  let mut ids = std::collections::HashSet::new();
  let mut aliases = std::collections::HashSet::new();
  for interpreter in &mut interpreters {
    interpreter.id = normalize_token(&interpreter.id);
    interpreter.label = interpreter.label.trim().to_string();
    interpreter.executable = interpreter.executable.trim().to_string();
    interpreter.template = normalize_token(&interpreter.template);
    interpreter.aliases = interpreter
      .aliases
      .iter()
      .map(|alias| normalize_token(alias))
      .filter(|alias| !alias.is_empty())
      .collect();
    interpreter.args = interpreter
      .args
      .iter()
      .map(|argument| argument.trim().to_string())
      .filter(|argument| !argument.is_empty())
      .collect();

    if interpreter.id.is_empty() {
      return Err("A custom interpreter has no valid language id.".to_string());
    }
    if interpreter.label.is_empty() {
      return Err(format!("Custom interpreter {} has no label.", interpreter.id));
    }
    if interpreter.executable.is_empty() {
      return Err(format!("Custom interpreter {} has no executable.", interpreter.id));
    }
    if !ids.insert(interpreter.id.clone()) {
      return Err(format!("Duplicate custom interpreter id: {}", interpreter.id));
    }
    for alias in &interpreter.aliases {
      if !aliases.insert(alias.clone()) {
        return Err(format!("Duplicate custom interpreter alias: {alias}"));
      }
    }
  }
  Ok(interpreters)
}

pub fn read(app: &AppHandle) -> R<Vec<CustomInterpreter>> {
  let path = config_path(app)?;
  let raw = match fs::read_to_string(&path) {
    Ok(raw) => raw,
    Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
    Err(error) => return Err(format!("Unable to read custom interpreters: {error}")),
  };
  let interpreters = serde_json::from_str::<Vec<CustomInterpreter>>(&raw)
    .map_err(|error| format!("Invalid custom interpreter settings: {error}"))?;
  validate(interpreters)
}

pub fn write(app: &AppHandle, value: Value) -> R<Vec<CustomInterpreter>> {
  let interpreters = serde_json::from_value::<Vec<CustomInterpreter>>(value)
    .map_err(|error| format!("Invalid custom interpreter settings: {error}"))?;
  let interpreters = validate(interpreters)?;
  let raw = serde_json::to_string_pretty(&interpreters).map_err(|error| error.to_string())?;
  fs::write(config_path(app)?, raw)
    .map_err(|error| format!("Unable to write custom interpreters: {error}"))?;
  Ok(interpreters)
}

fn resolve_executable(value: &str) -> Option<PathBuf> {
  let configured = value.trim();
  if configured.is_empty() {
    return None;
  }
  let path = PathBuf::from(configured);
  if path.components().count() > 1 || path.is_absolute() {
    return path.is_file().then_some(path);
  }
  which::which(configured).ok()
}

fn version_for(executable: &Path) -> String {
  std::process::Command::new(executable)
    .arg("--version")
    .output()
    .ok()
    .map(|output| {
      let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
      let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
      if stdout.is_empty() { stderr } else { stdout }
    })
    .unwrap_or_default()
    .lines()
    .next()
    .unwrap_or("")
    .to_string()
}

pub fn payload(interpreters: &[CustomInterpreter]) -> Vec<Value> {
  interpreters
    .iter()
    .map(|interpreter| {
      let executable = resolve_executable(&interpreter.executable);
      json!({
        "id": interpreter.id,
        "label": interpreter.label,
        "aliases": interpreter.aliases,
        "configuredExecutable": interpreter.executable,
        "executable": executable.as_ref().map(|path| path.to_string_lossy().to_string()).unwrap_or_default(),
        "version": executable.as_ref().map(|path| version_for(path)).unwrap_or_default(),
        "available": executable.is_some(),
        "enabled": interpreter.enabled,
        "args": interpreter.args,
        "template": interpreter.template,
        "custom": true
      })
    })
    .collect()
}

pub fn templates_payload() -> Value {
  json!([
    { "id": "python", "label": "Python", "args": ["-u", "-"] },
    { "id": "javascript", "label": "JavaScript (Node.js)", "args": ["-"] },
    { "id": "bash", "label": "Bash", "args": ["-s"] },
    { "id": "sh", "label": "POSIX shell", "args": ["-s"] },
    { "id": "ruby", "label": "Ruby", "args": ["-"] },
    { "id": "php", "label": "PHP", "args": [] },
    { "id": "powershell", "label": "PowerShell", "args": ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "-"] },
    { "id": "custom", "label": "Custom stdin interpreter", "args": [] }
  ])
}

pub fn resolve(app: &AppHandle, id_or_alias: &str) -> R<Option<CustomInterpreter>> {
  let requested = normalize_token(id_or_alias);
  Ok(read(app)?.into_iter().find(|interpreter| {
    interpreter.id == requested || interpreter.aliases.iter().any(|alias| alias == &requested)
  }))
}

fn canonical_working_directory(app: &AppHandle, requested: Option<String>) -> R<PathBuf> {
  let vault = vault_config::get_active_vault(app)
    .map_err(|_| "Open a vault before running a code block.".to_string())?;
  let root = fs::canonicalize(&vault.path)
    .map_err(|error| format!("Unable to resolve the active vault path: {error}"))?;
  let candidate = requested
    .filter(|value| !value.trim().is_empty())
    .map(PathBuf::from)
    .map(|path| if path.is_absolute() { path } else { root.join(path) })
    .unwrap_or_else(|| root.clone());
  let candidate = fs::canonicalize(&candidate)
    .map_err(|error| format!("Unable to resolve the code execution working directory: {error}"))?;
  if !candidate.starts_with(&root) {
    return Err("Refusing to execute code outside the active vault.".to_string());
  }
  if !candidate.is_dir() {
    return Err("The code execution working directory is not a folder.".to_string());
  }
  Ok(candidate)
}

fn retain_tail(text: String, line_limit: usize) -> (String, usize, bool) {
  let lines = text.lines().map(str::to_string).collect::<Vec<_>>();
  let dropped = lines.len().saturating_sub(line_limit);
  let retained = lines.into_iter().skip(dropped).collect::<Vec<_>>().join("\n");
  (retained, dropped, dropped > 0)
}

pub async fn stop(execution_id: &str) -> bool {
  running()
    .lock()
    .await
    .remove(execution_id)
    .map(|sender| sender.send(()).is_ok())
    .unwrap_or(false)
}

pub async fn run(
  app: AppHandle,
  interpreter: CustomInterpreter,
  command: String,
  cwd: Option<String>,
  execution_id: String,
  output_line_limit: usize,
) -> R<Value> {
  let request_id = next_request_id("run");
  if command.len() > MAX_CODE_BYTES {
    return Err(format!("Code block exceeds the {MAX_CODE_BYTES} byte execution limit."));
  }
  if !interpreter.enabled {
    return Err(format!("The {} interpreter is disabled.", interpreter.label));
  }
  let executable = resolve_executable(&interpreter.executable)
    .ok_or_else(|| format!("{} was not found at {}.", interpreter.label, interpreter.executable))?;
  let working_directory = canonical_working_directory(&app, cwd)?;
  let started = Instant::now();
  code_log(
    "custom:spawn:start",
    &request_id,
    format!(
      "execution_id={execution_id:?} language={} executable={} cwd={}",
      interpreter.id,
      executable.display(),
      working_directory.display()
    ),
  );

  let mut child = Command::new(&executable)
    .args(&interpreter.args)
    .current_dir(&working_directory)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true)
    .spawn()
    .map_err(|error| format!("Unable to start {}: {error}", executable.display()))?;

  let mut stdin = child.stdin.take().ok_or_else(|| "Unable to open interpreter stdin.".to_string())?;
  let mut stdout = child.stdout.take().ok_or_else(|| "Unable to capture interpreter stdout.".to_string())?;
  let mut stderr = child.stderr.take().ok_or_else(|| "Unable to capture interpreter stderr.".to_string())?;
  let source = command.into_bytes();
  let stdin_task = tokio::spawn(async move {
    stdin.write_all(&source).await.map_err(|error| error.to_string())?;
    stdin.shutdown().await.map_err(|error| error.to_string())
  });
  let stdout_task = tokio::spawn(async move {
    let mut buffer = Vec::new();
    stdout.read_to_end(&mut buffer).await.map_err(|error| error.to_string())?;
    Ok::<Vec<u8>, String>(buffer)
  });
  let stderr_task = tokio::spawn(async move {
    let mut buffer = Vec::new();
    stderr.read_to_end(&mut buffer).await.map_err(|error| error.to_string())?;
    Ok::<Vec<u8>, String>(buffer)
  });

  let (stop_tx, stop_rx) = oneshot::channel();
  running().lock().await.insert(execution_id.clone(), stop_tx);
  let outcome = tokio::select! {
    status = child.wait() => (status.map_err(|error| error.to_string())?, false, false),
    _ = stop_rx => {
      child.start_kill().map_err(|error| error.to_string())?;
      (child.wait().await.map_err(|error| error.to_string())?, false, true)
    },
    result = timeout(Duration::from_millis(DEFAULT_TIMEOUT_MS), async { child.wait().await }) => {
      match result {
        Ok(status) => (status.map_err(|error| error.to_string())?, false, false),
        Err(_) => {
          child.start_kill().map_err(|error| error.to_string())?;
          (child.wait().await.map_err(|error| error.to_string())?, true, false)
        }
      }
    }
  };
  running().lock().await.remove(&execution_id);

  let _ = stdin_task.await;
  let stdout_bytes = stdout_task.await.map_err(|error| error.to_string())??;
  let stderr_bytes = stderr_task.await.map_err(|error| error.to_string())??;
  let (mut stdout_text, stdout_dropped_lines, stdout_truncated) = retain_tail(String::from_utf8_lossy(&stdout_bytes).to_string(), output_line_limit);
  let (mut stderr_text, stderr_dropped_lines, stderr_truncated) = retain_tail(String::from_utf8_lossy(&stderr_bytes).to_string(), output_line_limit);
  if outcome.1 {
    if !stderr_text.is_empty() { stderr_text.push('\n'); }
    stderr_text.push_str(&format!("Execution timed out after {DEFAULT_TIMEOUT_MS} ms."));
  }
  if outcome.2 {
    if !stderr_text.is_empty() { stderr_text.push('\n'); }
    stderr_text.push_str("Execution interrupted by user.");
  }
  if stdout_text.ends_with('\n') { stdout_text.pop(); }

  Ok(json!({
    "runtime": "tauri-rust-custom",
    "executionId": execution_id,
    "language": interpreter.id,
    "environment": interpreter.label,
    "executable": executable.to_string_lossy(),
    "success": outcome.0.success() && !outcome.1 && !outcome.2,
    "exitCode": outcome.0.code(),
    "stdout": stdout_text,
    "stderr": stderr_text,
    "stdoutLines": stdout_text.lines().count(),
    "stderrLines": stderr_text.lines().count(),
    "stdoutDroppedLines": stdout_dropped_lines,
    "stderrDroppedLines": stderr_dropped_lines,
    "stdoutDroppedBytes": 0,
    "stderrDroppedBytes": 0,
    "outputLineLimit": output_line_limit,
    "durationMs": started.elapsed().as_millis(),
    "timedOut": outcome.1,
    "interrupted": outcome.2,
    "truncated": stdout_truncated || stderr_truncated
  }))
}

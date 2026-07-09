use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  collections::{HashMap, VecDeque},
  fs,
  io::ErrorKind,
  path::{Path, PathBuf},
  process::{ExitStatus, Stdio},
  sync::{
    atomic::{AtomicU64, Ordering},
    OnceLock,
  },
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tokio::{
  io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
  process::{Child, Command},
  sync::{oneshot, Mutex},
  time::{sleep, timeout},
};

use crate::vault::config as vault_config;

type R<T> = Result<T, String>;

const CONFIG_FILE: &str = "code-execution.json";
const DEFAULT_TIMEOUT_MS: u64 = 15_000;
const INTERRUPT_GRACE_MS: u64 = 1_500;
const MAX_TIMEOUT_MS: u64 = 120_000;
const MAX_CODE_BYTES: usize = 256 * 1024;
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
const DEFAULT_OUTPUT_LINE_LIMIT: usize = 200;
const MIN_OUTPUT_LINE_LIMIT: usize = 10;
const MAX_OUTPUT_LINE_LIMIT: usize = 5_000;
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);
static RUNNING_EXECUTIONS: OnceLock<Mutex<HashMap<String, oneshot::Sender<()>>>> = OnceLock::new();

#[derive(Clone, Debug)]
struct RuntimeDefinition {
  id: &'static str,
  label: &'static str,
  aliases: &'static [&'static str],
  candidates: &'static [&'static str],
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct EnvironmentOverride {
  #[serde(default)]
  enabled: Option<bool>,
  #[serde(default)]
  executable: String,
}

fn default_output_line_limit() -> usize {
  DEFAULT_OUTPUT_LINE_LIMIT
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeExecutionConfig {
  #[serde(default)]
  execution_enabled: bool,
  #[serde(default = "default_output_line_limit")]
  output_line_limit: usize,
  #[serde(default)]
  environments: HashMap<String, EnvironmentOverride>,
}

impl Default for CodeExecutionConfig {
  fn default() -> Self {
    Self {
      execution_enabled: false,
      output_line_limit: DEFAULT_OUTPUT_LINE_LIMIT,
      environments: HashMap::new(),
    }
  }
}

impl CodeExecutionConfig {
  fn normalized(mut self) -> Self {
    self.output_line_limit = self
      .output_line_limit
      .clamp(MIN_OUTPUT_LINE_LIMIT, MAX_OUTPUT_LINE_LIMIT);
    self
  }
}

#[derive(Debug, Default)]
struct CapturedStream {
  bytes: Vec<u8>,
  total_bytes: usize,
  dropped_bytes: usize,
}

#[derive(Debug, Default)]
struct PreparedStream {
  text: String,
  line_count: usize,
  dropped_lines: usize,
  dropped_bytes: usize,
  truncated: bool,
}

#[derive(Debug)]
struct ProcessResult {
  success: bool,
  exit_code: Option<i32>,
  stdout: PreparedStream,
  stderr: PreparedStream,
  duration_ms: u128,
  timed_out: bool,
  interrupted: bool,
  truncated: bool,
}

#[derive(Debug)]
enum WaitOutcome {
  Exited(ExitStatus),
  TimedOut,
  Interrupted,
}

fn running_executions() -> &'static Mutex<HashMap<String, oneshot::Sender<()>>> {
  RUNNING_EXECUTIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn next_request_id(action: &str) -> String {
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis();
  let sequence = REQUEST_SEQUENCE.fetch_add(1, Ordering::Relaxed);
  format!("{action}-{timestamp}-{sequence}")
}

fn code_log(event: &str, request_id: &str, details: impl AsRef<str>) {
  let details = details.as_ref();
  if details.is_empty() {
    eprintln!("[Code] {event} request={request_id}");
  } else {
    eprintln!("[Code] {event} request={request_id} {details}");
  }
}

fn runtime_definitions() -> Vec<RuntimeDefinition> {
  vec![
    RuntimeDefinition {
      id: "python",
      label: "Python",
      aliases: &["python", "py", "python3"],
      candidates: &["python3", "python"],
    },
    RuntimeDefinition {
      id: "javascript",
      label: "JavaScript (Node.js)",
      aliases: &["javascript", "js", "node", "nodejs"],
      candidates: &["node"],
    },
    RuntimeDefinition {
      id: "bash",
      label: "Bash",
      aliases: &["bash", "shell", "shellscript"],
      candidates: &["bash"],
    },
    RuntimeDefinition {
      id: "sh",
      label: "POSIX shell",
      aliases: &["sh", "posix"],
      candidates: &["sh"],
    },
    RuntimeDefinition {
      id: "ruby",
      label: "Ruby",
      aliases: &["ruby", "rb"],
      candidates: &["ruby"],
    },
    RuntimeDefinition {
      id: "php",
      label: "PHP",
      aliases: &["php"],
      candidates: &["php"],
    },
    RuntimeDefinition {
      id: "powershell",
      label: "PowerShell",
      aliases: &["powershell", "pwsh", "ps1"],
      candidates: &["pwsh", "powershell"],
    },
  ]
}

fn resolve_definition(id_or_alias: &str) -> Option<RuntimeDefinition> {
  let requested = id_or_alias.trim().to_ascii_lowercase();
  runtime_definitions().into_iter().find(|definition| {
    definition.id == requested || definition.aliases.iter().any(|alias| *alias == requested)
  })
}

fn config_path(app: &AppHandle) -> R<PathBuf> {
  let directory = app.path().app_config_dir().map_err(|error| error.to_string())?;
  fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
  Ok(directory.join(CONFIG_FILE))
}

fn read_config(app: &AppHandle, request_id: &str) -> R<CodeExecutionConfig> {
  let path = config_path(app).map_err(|error| {
    code_log("config:path:error", request_id, format!("error={error:?}"));
    error
  })?;
  code_log(
    "config:read:start",
    request_id,
    format!("path={}", path.display()),
  );

  let raw = match fs::read_to_string(&path) {
    Ok(raw) => raw,
    Err(error) if error.kind() == ErrorKind::NotFound => {
      code_log(
        "config:read:default",
        request_id,
        format!(
          "reason=not-found execution_enabled=false output_line_limit={DEFAULT_OUTPUT_LINE_LIMIT}"
        ),
      );
      return Ok(CodeExecutionConfig::default());
    }
    Err(error) => {
      let message = format!("Unable to read code execution settings: {error}");
      code_log("config:read:error", request_id, format!("error={message:?}"));
      return Err(message);
    }
  };

  let config = serde_json::from_str::<CodeExecutionConfig>(&raw)
    .map_err(|error| format!("Invalid code execution settings file: {error}"))?
    .normalized();
  code_log(
    "config:read:complete",
    request_id,
    format!(
      "bytes={} execution_enabled={} output_line_limit={} overrides={}",
      raw.len(),
      config.execution_enabled,
      config.output_line_limit,
      config.environments.len()
    ),
  );
  Ok(config)
}

fn write_config(app: &AppHandle, config: &CodeExecutionConfig, request_id: &str) -> R<()> {
  let path = config_path(app)?;
  let config = config.clone().normalized();
  let raw = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
  code_log(
    "config:write:start",
    request_id,
    format!(
      "path={} bytes={} execution_enabled={} output_line_limit={} overrides={}",
      path.display(),
      raw.len(),
      config.execution_enabled,
      config.output_line_limit,
      config.environments.len()
    ),
  );
  fs::write(&path, raw).map_err(|error| {
    let message = format!("Unable to write code execution settings: {error}");
    code_log("config:write:error", request_id, format!("error={message:?}"));
    message
  })?;
  code_log("config:write:complete", request_id, format!("path={}", path.display()));
  Ok(())
}

fn resolve_executable(definition: &RuntimeDefinition, configured: &str) -> Option<PathBuf> {
  let configured = configured.trim();
  if !configured.is_empty() {
    let path = PathBuf::from(configured);
    if path.components().count() > 1 || path.is_absolute() {
      return path.is_file().then_some(path);
    }
    return which::which(configured).ok();
  }
  definition
    .candidates
    .iter()
    .find_map(|candidate| which::which(candidate).ok())
}

fn invocation_args(definition: &RuntimeDefinition, executable: &Path) -> Vec<String> {
  let executable_name = executable
    .file_name()
    .and_then(|name| name.to_str())
    .unwrap_or("")
    .to_ascii_lowercase();
  match definition.id {
    "python" => vec!["-u".into(), "-".into()],
    "javascript" => vec!["-".into()],
    "bash" | "sh" => vec!["-s".into()],
    "ruby" => vec!["-".into()],
    "php" => Vec::new(),
    "powershell" if executable_name.starts_with("powershell") => vec![
      "-NoLogo".into(),
      "-NoProfile".into(),
      "-NonInteractive".into(),
      "-Command".into(),
      "-".into(),
    ],
    "powershell" => vec![
      "-NoLogo".into(),
      "-NoProfile".into(),
      "-NonInteractive".into(),
      "-Command".into(),
      "-".into(),
    ],
    _ => Vec::new(),
  }
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

fn canonical_working_directory(
  app: &AppHandle,
  requested: Option<String>,
  request_id: &str,
) -> R<PathBuf> {
  code_log(
    "cwd:resolve:start",
    request_id,
    format!("requested={:?}", requested.as_deref().unwrap_or("")),
  );
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
  code_log(
    "cwd:resolve:complete",
    request_id,
    format!("root={} cwd={}", root.display(), candidate.display()),
  );
  Ok(candidate)
}

async fn capture_stream<Rd>(
  mut reader: Rd,
  request_id: String,
  stream: &'static str,
) -> R<CapturedStream>
where
  Rd: AsyncRead + Unpin,
{
  let mut tail = VecDeque::with_capacity(MAX_OUTPUT_BYTES);
  let mut total_bytes = 0usize;
  let mut dropped_bytes = 0usize;
  let mut buffer = vec![0u8; 16 * 1024];
  code_log("process:stream:start", &request_id, format!("stream={stream}"));

  loop {
    let read = reader
      .read(&mut buffer)
      .await
      .map_err(|error| format!("Unable to read {stream}: {error}"))?;
    if read == 0 {
      break;
    }
    total_bytes = total_bytes.saturating_add(read);
    for byte in &buffer[..read] {
      if tail.len() == MAX_OUTPUT_BYTES {
        tail.pop_front();
        dropped_bytes = dropped_bytes.saturating_add(1);
      }
      tail.push_back(*byte);
    }
  }

  let bytes = tail.into_iter().collect::<Vec<_>>();
  code_log(
    "process:stream:complete",
    &request_id,
    format!(
      "stream={stream} total_bytes={total_bytes} retained_bytes={} dropped_bytes={dropped_bytes}",
      bytes.len()
    ),
  );
  Ok(CapturedStream {
    bytes,
    total_bytes,
    dropped_bytes,
  })
}

fn prepare_stream(capture: CapturedStream, line_limit: usize) -> PreparedStream {
  let text = String::from_utf8_lossy(&capture.bytes).to_string();
  let lines = text.split_inclusive('\n').collect::<Vec<_>>();
  let dropped_lines = lines.len().saturating_sub(line_limit);
  let retained = lines
    .into_iter()
    .skip(dropped_lines)
    .collect::<String>();
  let line_count = if retained.is_empty() {
    0
  } else {
    retained.lines().count().max(1)
  };
  PreparedStream {
    text: retained,
    line_count,
    dropped_lines,
    dropped_bytes: capture.dropped_bytes,
    truncated: capture.dropped_bytes > 0 || dropped_lines > 0,
  }
}

fn append_status_line(stream: &mut PreparedStream, message: &str, line_limit: usize) {
  let mut lines = stream.text.lines().map(str::to_string).collect::<Vec<_>>();
  lines.push(message.to_string());
  let overflow = lines.len().saturating_sub(line_limit);
  if overflow > 0 {
    lines.drain(..overflow);
    stream.dropped_lines = stream.dropped_lines.saturating_add(overflow);
    stream.truncated = true;
  }
  stream.text = lines.join("\n");
  stream.line_count = lines.len();
}

async fn join_capture(
  task: tokio::task::JoinHandle<R<CapturedStream>>,
  stream: &str,
) -> R<CapturedStream> {
  task
    .await
    .map_err(|error| format!("{stream} capture task failed: {error}"))?
}

#[cfg(unix)]
fn send_interrupt_signal(pid: u32) -> bool {
  unsafe extern "C" {
    fn kill(pid: i32, signal: i32) -> i32;
  }
  const SIGINT: i32 = 2;
  unsafe { kill(pid as i32, SIGINT) == 0 }
}

#[cfg(not(unix))]
fn send_interrupt_signal(_pid: u32) -> bool {
  false
}

async fn stop_child(
  child: &mut Child,
  request_id: &str,
  interrupt_first: bool,
) -> R<ExitStatus> {
  if interrupt_first {
    if let Some(pid) = child.id() {
      let signaled = send_interrupt_signal(pid);
      code_log(
        "process:interrupt:signal",
        request_id,
        format!("pid={pid} signal=SIGINT sent={signaled}"),
      );
      if signaled {
        match timeout(Duration::from_millis(INTERRUPT_GRACE_MS), child.wait()).await {
          Ok(result) => {
            return result
              .map_err(|error| format!("Unable to wait after interrupting process: {error}"));
          }
          Err(_) => code_log(
            "process:interrupt:grace-expired",
            request_id,
            format!("pid={pid} grace_ms={INTERRUPT_GRACE_MS}"),
          ),
        }
      }
    }
  }

  child
    .start_kill()
    .map_err(|error| format!("Unable to terminate interpreter process: {error}"))?;
  child
    .wait()
    .await
    .map_err(|error| format!("Unable to reap terminated interpreter process: {error}"))
}

async fn execute_process(
  request_id: &str,
  definition: &RuntimeDefinition,
  executable: &Path,
  args: &[String],
  code: &str,
  cwd: &Path,
  timeout_ms: u64,
  output_line_limit: usize,
  mut stop_rx: oneshot::Receiver<()>,
) -> R<ProcessResult> {
  let started = Instant::now();
  code_log(
    "process:spawn:start",
    request_id,
    format!(
      "environment={} executable={} cwd={} source_bytes={} timeout_ms={timeout_ms} output_line_limit={output_line_limit}",
      definition.id,
      executable.display(),
      cwd.display(),
      code.len()
    ),
  );

  let mut child = Command::new(executable)
    .args(args)
    .current_dir(cwd)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true)
    .spawn()
    .map_err(|error| format!("Unable to start {}: {error}", executable.display()))?;

  let stdout = child
    .stdout
    .take()
    .ok_or_else(|| "Unable to capture interpreter stdout.".to_string())?;
  let stderr = child
    .stderr
    .take()
    .ok_or_else(|| "Unable to capture interpreter stderr.".to_string())?;
  let stdout_task = tokio::spawn(capture_stream(stdout, request_id.to_string(), "stdout"));
  let stderr_task = tokio::spawn(capture_stream(stderr, request_id.to_string(), "stderr"));

  let mut stdin = child
    .stdin
    .take()
    .ok_or_else(|| "Unable to open interpreter stdin.".to_string())?;
  let source = code.as_bytes().to_vec();
  let write_request_id = request_id.to_string();
  let write_task = tokio::spawn(async move {
    code_log(
      "process:stdin:write:start",
      &write_request_id,
      format!("bytes={}", source.len()),
    );
    stdin.write_all(&source).await.map_err(|error| error.to_string())?;
    stdin.shutdown().await.map_err(|error| error.to_string())?;
    code_log("process:stdin:write:complete", &write_request_id, "");
    Ok::<(), String>(())
  });

  code_log("process:wait:start", request_id, format!("timeout_ms={timeout_ms}"));
  let timeout_sleep = sleep(Duration::from_millis(timeout_ms));
  tokio::pin!(timeout_sleep);
  let outcome = tokio::select! {
    status = child.wait() => WaitOutcome::Exited(
      status.map_err(|error| format!("Unable to wait for interpreter process: {error}"))?
    ),
    _ = &mut stop_rx => WaitOutcome::Interrupted,
    _ = &mut timeout_sleep => WaitOutcome::TimedOut,
  };

  let (status, timed_out, interrupted) = match outcome {
    WaitOutcome::Exited(status) => (status, false, false),
    WaitOutcome::Interrupted => {
      code_log("process:interrupt:requested", request_id, "action=SIGINT-then-kill");
      (stop_child(&mut child, request_id, true).await?, false, true)
    }
    WaitOutcome::TimedOut => {
      code_log(
        "process:timeout",
        request_id,
        format!("timeout_ms={timeout_ms} action=kill"),
      );
      (stop_child(&mut child, request_id, false).await?, true, false)
    }
  };

  match write_task.await {
    Ok(Ok(())) => {}
    Ok(Err(error)) => code_log("process:stdin:error", request_id, format!("error={error:?}")),
    Err(error) => code_log("process:stdin:join-error", request_id, format!("error={error:?}")),
  }

  let stdout_capture = join_capture(stdout_task, "stdout").await?;
  let stderr_capture = join_capture(stderr_task, "stderr").await?;
  let mut stdout = prepare_stream(stdout_capture, output_line_limit);
  let mut stderr = prepare_stream(stderr_capture, output_line_limit);
  if timed_out {
    append_status_line(
      &mut stderr,
      &format!("Execution timed out after {timeout_ms} ms."),
      output_line_limit,
    );
  }
  if interrupted {
    append_status_line(
      &mut stderr,
      "Execution interrupted by user.",
      output_line_limit,
    );
  }
  let truncated = stdout.truncated || stderr.truncated;

  code_log(
    "process:output:captured",
    request_id,
    format!(
      "success={} exit_code={:?} timed_out={timed_out} interrupted={interrupted} stdout_total_bytes={} stderr_total_bytes={} stdout_retained_bytes={} stderr_retained_bytes={} stdout_dropped_bytes={} stderr_dropped_bytes={} truncated={truncated}",
      status.success(),
      status.code(),
      stdout.total_bytes_for_log(),
      stderr.total_bytes_for_log(),
      stdout.text.len(),
      stderr.text.len(),
      stdout.dropped_bytes,
      stderr.dropped_bytes
    ),
  );

  Ok(ProcessResult {
    success: status.success() && !timed_out && !interrupted,
    exit_code: status.code(),
    stdout,
    stderr,
    duration_ms: started.elapsed().as_millis(),
    timed_out,
    interrupted,
    truncated,
  })
}

impl PreparedStream {
  fn total_bytes_for_log(&self) -> usize {
    self.text.len().saturating_add(self.dropped_bytes)
  }
}

fn environment_payload(config: &CodeExecutionConfig, definition: &RuntimeDefinition) -> Value {
  let configured = config
    .environments
    .get(definition.id)
    .cloned()
    .unwrap_or_default();
  let executable = resolve_executable(definition, &configured.executable);
  json!({
    "id": definition.id,
    "label": definition.label,
    "aliases": definition.aliases,
    "available": executable.is_some(),
    "enabled": configured.enabled.unwrap_or(true),
    "configuredExecutable": configured.executable,
    "executable": executable.as_ref().map(|path| path.to_string_lossy().to_string()).unwrap_or_default(),
    "version": executable.as_ref().map(|path| version_for(path)).unwrap_or_default()
  })
}

fn settings_payload(config: &CodeExecutionConfig) -> Value {
  let environments = runtime_definitions()
    .iter()
    .map(|definition| environment_payload(config, definition))
    .collect::<Vec<_>>();
  json!({
    "runtime": "tauri-rust",
    "executionEnabled": config.execution_enabled,
    "outputLineLimit": config.output_line_limit,
    "environments": environments,
    "limits": {
      "maxCodeBytes": MAX_CODE_BYTES,
      "maxOutputBytes": MAX_OUTPUT_BYTES,
      "defaultTimeoutMs": DEFAULT_TIMEOUT_MS,
      "maxTimeoutMs": MAX_TIMEOUT_MS,
      "minOutputLineLimit": MIN_OUTPUT_LINE_LIMIT,
      "maxOutputLineLimit": MAX_OUTPUT_LINE_LIMIT
    }
  })
}

#[tauri::command]
pub fn tauri_programs_list(app: AppHandle) -> R<Value> {
  let request_id = next_request_id("list");
  let started = Instant::now();
  code_log("command:start", &request_id, "action=list");
  let result = read_config(&app, &request_id).map(|config| settings_payload(&config));
  match &result {
    Ok(value) => code_log(
      "command:complete",
      &request_id,
      format!(
        "action=list duration_ms={} execution_enabled={} output_line_limit={} environments={}",
        started.elapsed().as_millis(),
        value["executionEnabled"].as_bool().unwrap_or(false),
        value["outputLineLimit"].as_u64().unwrap_or(DEFAULT_OUTPUT_LINE_LIMIT as u64),
        value["environments"].as_array().map(Vec::len).unwrap_or(0)
      ),
    ),
    Err(error) => code_log(
      "command:error",
      &request_id,
      format!("action=list duration_ms={} error={error:?}", started.elapsed().as_millis()),
    ),
  }
  result
}

#[tauri::command]
pub fn tauri_programs_set(app: AppHandle, environments: Option<Value>) -> R<Value> {
  let request_id = next_request_id("set");
  let started = Instant::now();
  let value = environments.unwrap_or_else(|| json!({}));
  code_log("command:start", &request_id, "action=set");
  let result = (|| {
    let config: CodeExecutionConfig = serde_json::from_value(value)
      .map_err(|error| format!("Invalid code execution settings: {error}"))?;
    let config = config.normalized();
    write_config(&app, &config, &request_id)?;
    Ok(settings_payload(&config))
  })();
  match &result {
    Ok(value) => code_log(
      "command:complete",
      &request_id,
      format!(
        "action=set duration_ms={} output_line_limit={}",
        started.elapsed().as_millis(),
        value["outputLineLimit"].as_u64().unwrap_or(DEFAULT_OUTPUT_LINE_LIMIT as u64)
      ),
    ),
    Err(error) => code_log(
      "command:error",
      &request_id,
      format!("action=set duration_ms={} error={error:?}", started.elapsed().as_millis()),
    ),
  }
  result
}

async fn run_command(
  app: &AppHandle,
  request_id: &str,
  execution_id: &str,
  id: &str,
  command: &str,
  cwd: Option<String>,
  stop_rx: oneshot::Receiver<()>,
) -> R<Value> {
  code_log(
    "validation:source",
    request_id,
    format!("bytes={} max_bytes={MAX_CODE_BYTES}", command.len()),
  );
  if command.len() > MAX_CODE_BYTES {
    return Err(format!(
      "Code block exceeds the {MAX_CODE_BYTES} byte execution limit."
    ));
  }

  code_log("validation:language:start", request_id, format!("requested={id:?}"));
  let definition = resolve_definition(id)
    .ok_or_else(|| format!("No executable environment is registered for language: {id}"))?;
  let config = read_config(app, request_id)?;
  if !config.execution_enabled {
    return Err(
      "Code execution is disabled. Enable it in Settings → Editor → Code execution."
        .to_string(),
    );
  }

  let configured = config
    .environments
    .get(definition.id)
    .cloned()
    .unwrap_or_default();
  if configured.enabled == Some(false) {
    return Err(format!("The {} environment is disabled.", definition.label));
  }
  let executable = resolve_executable(&definition, &configured.executable).ok_or_else(|| {
    format!(
      "{} was not detected. Configure its executable in Settings.",
      definition.label
    )
  })?;
  code_log(
    "executable:resolve:complete",
    request_id,
    format!("environment={} executable={}", definition.id, executable.display()),
  );

  let working_directory = canonical_working_directory(app, cwd, request_id)?;
  let args = invocation_args(&definition, &executable);
  let result = execute_process(
    request_id,
    &definition,
    &executable,
    &args,
    command,
    &working_directory,
    DEFAULT_TIMEOUT_MS,
    config.output_line_limit,
    stop_rx,
  )
  .await?;

  Ok(json!({
    "runtime": "tauri-rust",
    "executionId": execution_id,
    "language": definition.id,
    "environment": definition.label,
    "executable": executable.to_string_lossy(),
    "success": result.success,
    "exitCode": result.exit_code,
    "stdout": result.stdout.text,
    "stderr": result.stderr.text,
    "stdoutLines": result.stdout.line_count,
    "stderrLines": result.stderr.line_count,
    "stdoutDroppedLines": result.stdout.dropped_lines,
    "stderrDroppedLines": result.stderr.dropped_lines,
    "stdoutDroppedBytes": result.stdout.dropped_bytes,
    "stderrDroppedBytes": result.stderr.dropped_bytes,
    "outputLineLimit": config.output_line_limit,
    "durationMs": result.duration_ms,
    "timedOut": result.timed_out,
    "interrupted": result.interrupted,
    "truncated": result.truncated
  }))
}

async fn request_stop(request_id: &str, execution_id: &str) -> Value {
  let sender = running_executions().lock().await.remove(execution_id);
  let stopped = sender.map(|sender| sender.send(()).is_ok()).unwrap_or(false);
  code_log(
    if stopped { "stop:dispatched" } else { "stop:not-found" },
    request_id,
    format!("execution_id={execution_id:?} stopped={stopped}"),
  );
  json!({
    "runtime": "tauri-rust",
    "executionId": execution_id,
    "success": stopped,
    "stopped": stopped
  })
}

#[tauri::command]
pub async fn tauri_programs_run(
  app: AppHandle,
  id: String,
  command: String,
  cwd: Option<String>,
  execution_id: Option<String>,
  stop: Option<bool>,
) -> R<Value> {
  let action = if stop.unwrap_or(false) { "stop" } else { "run" };
  let request_id = next_request_id(action);
  let started = Instant::now();
  let execution_id = execution_id
    .filter(|value| !value.trim().is_empty())
    .unwrap_or_else(|| request_id.clone());

  code_log(
    "command:start",
    &request_id,
    format!(
      "action={action} execution_id={execution_id:?} requested_language={id:?} source_bytes={} cwd_requested={:?}",
      command.len(),
      cwd.as_deref().unwrap_or("")
    ),
  );

  if action == "stop" {
    return Ok(request_stop(&request_id, &execution_id).await);
  }

  let (stop_tx, stop_rx) = oneshot::channel();
  {
    let mut running = running_executions().lock().await;
    if running.contains_key(&execution_id) {
      return Err(format!("Execution identifier is already running: {execution_id}"));
    }
    running.insert(execution_id.clone(), stop_tx);
  }

  let result = run_command(
    &app,
    &request_id,
    &execution_id,
    &id,
    &command,
    cwd,
    stop_rx,
  )
  .await;
  running_executions().lock().await.remove(&execution_id);

  match &result {
    Ok(value) => code_log(
      "command:complete",
      &request_id,
      format!(
        "action=run execution_id={execution_id:?} language={} success={} exit_code={:?} duration_ms={} timed_out={} interrupted={} truncated={} stdout_bytes={} stderr_bytes={} output_line_limit={}",
        value["language"].as_str().unwrap_or(""),
        value["success"].as_bool().unwrap_or(false),
        value["exitCode"].as_i64(),
        started.elapsed().as_millis(),
        value["timedOut"].as_bool().unwrap_or(false),
        value["interrupted"].as_bool().unwrap_or(false),
        value["truncated"].as_bool().unwrap_or(false),
        value["stdout"].as_str().map(str::len).unwrap_or(0),
        value["stderr"].as_str().map(str::len).unwrap_or(0),
        value["outputLineLimit"].as_u64().unwrap_or(DEFAULT_OUTPUT_LINE_LIMIT as u64)
      ),
    ),
    Err(error) => code_log(
      "command:error",
      &request_id,
      format!(
        "action=run execution_id={execution_id:?} requested_language={id:?} duration_ms={} error={error:?}",
        started.elapsed().as_millis()
      ),
    ),
  }
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn resolves_supported_aliases() {
    assert_eq!(resolve_definition("py").unwrap().id, "python");
    assert_eq!(resolve_definition("nodejs").unwrap().id, "javascript");
    assert_eq!(resolve_definition("ps1").unwrap().id, "powershell");
    assert!(resolve_definition("totally-unknown").is_none());
  }

  #[test]
  fn default_configuration_requires_explicit_opt_in_and_uses_bounded_tail() {
    let config = CodeExecutionConfig::default();
    assert!(!config.execution_enabled);
    assert_eq!(config.output_line_limit, 200);
    assert!(config.environments.is_empty());
  }

  #[test]
  fn normalizes_output_line_limit() {
    let low = CodeExecutionConfig {
      output_line_limit: 0,
      ..CodeExecutionConfig::default()
    }
    .normalized();
    let high = CodeExecutionConfig {
      output_line_limit: usize::MAX,
      ..CodeExecutionConfig::default()
    }
    .normalized();
    assert_eq!(low.output_line_limit, MIN_OUTPUT_LINE_LIMIT);
    assert_eq!(high.output_line_limit, MAX_OUTPUT_LINE_LIMIT);
  }

  #[test]
  fn keeps_the_last_configured_output_lines() {
    let text = (1..=12)
      .map(|index| format!("line-{index}"))
      .collect::<Vec<_>>()
      .join("\n")
      + "\n";
    let capture = CapturedStream {
      bytes: text.as_bytes().to_vec(),
      total_bytes: text.len(),
      dropped_bytes: 0,
    };
    let prepared = prepare_stream(capture, 10);
    assert!(prepared.text.starts_with("line-3\n"));
    assert!(prepared.text.ends_with("line-12\n"));
    assert_eq!(prepared.line_count, 10);
    assert_eq!(prepared.dropped_lines, 2);
    assert!(prepared.truncated);
  }

  #[tokio::test]
  async fn capture_stream_is_memory_bounded_and_keeps_the_tail() {
    let (mut writer, reader) = tokio::io::duplex(64 * 1024);
    let task = tokio::spawn(capture_stream(
      reader,
      "test-bounded-output".to_string(),
      "stdout",
    ));
    let total = MAX_OUTPUT_BYTES + 64 * 1024;
    writer.write_all(&vec![b'a'; total]).await.unwrap();
    drop(writer);
    let capture = task.await.unwrap().unwrap();
    assert_eq!(capture.bytes.len(), MAX_OUTPUT_BYTES);
    assert_eq!(capture.total_bytes, total);
    assert_eq!(capture.dropped_bytes, 64 * 1024);
  }

  #[tokio::test]
  async fn stop_request_reaches_the_registered_execution() {
    let execution_id = "test-stop-request".to_string();
    let (sender, receiver) = oneshot::channel();
    running_executions()
      .lock()
      .await
      .insert(execution_id.clone(), sender);
    let response = request_stop("test-stop", &execution_id).await;
    assert_eq!(response["stopped"].as_bool(), Some(true));
    assert!(receiver.await.is_ok());
  }

  #[tokio::test]
  async fn executes_a_real_python_interpreter_when_available() {
    let definition = resolve_definition("python").unwrap();
    let Some(executable) = resolve_executable(&definition, "") else {
      eprintln!("[Code:test] real-python skipped reason=python-not-installed");
      return;
    };
    let cwd = std::env::current_dir().unwrap();
    let args = invocation_args(&definition, &executable);
    let (_stop_tx, stop_rx) = oneshot::channel();
    let result = execute_process(
      "test-real-python",
      &definition,
      &executable,
      &args,
      "print(6 * 7)",
      &cwd,
      5_000,
      DEFAULT_OUTPUT_LINE_LIMIT,
      stop_rx,
    )
    .await
    .unwrap();
    assert!(result.success, "stderr: {}", result.stderr.text);
    assert_eq!(result.stdout.text.trim(), "42");
  }

  #[tokio::test]
  async fn interrupts_a_real_python_process_when_available() {
    let definition = resolve_definition("python").unwrap();
    let Some(executable) = resolve_executable(&definition, "") else {
      eprintln!("[Code:test] interrupt skipped reason=python-not-installed");
      return;
    };
    let cwd = std::env::current_dir().unwrap();
    let args = invocation_args(&definition, &executable);
    let (stop_tx, stop_rx) = oneshot::channel();
    let task = tokio::spawn(async move {
      execute_process(
        "test-interrupt-python",
        &definition,
        &executable,
        &args,
        "while True:\n    print('running')",
        &cwd,
        10_000,
        20,
        stop_rx,
      )
      .await
    });
    sleep(Duration::from_millis(150)).await;
    stop_tx.send(()).unwrap();
    let result = task.await.unwrap().unwrap();
    assert!(result.interrupted);
    assert!(!result.success);
    assert!(result.stderr.text.contains("interrupted by user"));
    assert!(result.stdout.line_count <= 20);
  }
}

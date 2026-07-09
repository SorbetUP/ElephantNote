use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  collections::HashMap,
  fs,
  io::ErrorKind,
  path::{Path, PathBuf},
  process::Stdio,
  sync::atomic::{AtomicU64, Ordering},
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
use tokio::{io::AsyncWriteExt, process::Command, time::timeout};

use crate::vault::config as vault_config;

type R<T> = Result<T, String>;

const CONFIG_FILE: &str = "code-execution.json";
const DEFAULT_TIMEOUT_MS: u64 = 15_000;
const MAX_TIMEOUT_MS: u64 = 120_000;
const MAX_CODE_BYTES: usize = 256 * 1024;
const MAX_OUTPUT_BYTES: usize = 1024 * 1024;
static REQUEST_SEQUENCE: AtomicU64 = AtomicU64::new(1);

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

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct CodeExecutionConfig {
  #[serde(default)]
  execution_enabled: bool,
  #[serde(default)]
  environments: HashMap<String, EnvironmentOverride>,
}

impl Default for CodeExecutionConfig {
  fn default() -> Self {
    Self {
      execution_enabled: false,
      environments: HashMap::new(),
    }
  }
}

#[derive(Debug)]
struct ProcessResult {
  success: bool,
  exit_code: Option<i32>,
  stdout: String,
  stderr: String,
  duration_ms: u128,
  timed_out: bool,
  truncated: bool,
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
        "reason=not-found execution_enabled=false",
      );
      return Ok(CodeExecutionConfig::default());
    }
    Err(error) => {
      let message = format!("Unable to read code execution settings: {error}");
      code_log("config:read:error", request_id, format!("error={message:?}"));
      return Err(message);
    }
  };

  match serde_json::from_str::<CodeExecutionConfig>(&raw) {
    Ok(config) => {
      code_log(
        "config:read:complete",
        request_id,
        format!(
          "bytes={} execution_enabled={} overrides={}",
          raw.len(),
          config.execution_enabled,
          config.environments.len()
        ),
      );
      Ok(config)
    }
    Err(error) => {
      let message = format!("Invalid code execution settings file: {error}");
      code_log("config:parse:error", request_id, format!("error={message:?}"));
      Err(message)
    }
  }
}

fn write_config(app: &AppHandle, config: &CodeExecutionConfig, request_id: &str) -> R<()> {
  let path = config_path(app)?;
  let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
  code_log(
    "config:write:start",
    request_id,
    format!(
      "path={} bytes={} execution_enabled={} overrides={}",
      path.display(),
      raw.len(),
      config.execution_enabled,
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

fn version_for(executable: &Path, request_id: &str, environment_id: &str) -> String {
  code_log(
    "environment:version:start",
    request_id,
    format!("environment={environment_id} executable={}", executable.display()),
  );
  let started = Instant::now();
  let version = std::process::Command::new(executable)
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
    .to_string();
  code_log(
    "environment:version:complete",
    request_id,
    format!(
      "environment={environment_id} duration_ms={} version_present={}",
      started.elapsed().as_millis(),
      !version.is_empty()
    ),
  );
  version
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
  let vault = vault_config::get_active_vault(app).map_err(|error| {
    let message = "Open a vault before running a code block.".to_string();
    code_log(
      "cwd:resolve:error",
      request_id,
      format!("stage=active-vault backend_error={error:?} error={message:?}"),
    );
    message
  })?;
  let root = fs::canonicalize(&vault.path).map_err(|error| {
    let message = format!("Unable to resolve the active vault path: {error}");
    code_log("cwd:resolve:error", request_id, format!("stage=vault-root error={message:?}"));
    message
  })?;
  let candidate = requested
    .filter(|value| !value.trim().is_empty())
    .map(PathBuf::from)
    .map(|path| if path.is_absolute() { path } else { root.join(path) })
    .unwrap_or_else(|| root.clone());
  let candidate = fs::canonicalize(&candidate).map_err(|error| {
    let message = format!("Unable to resolve the code execution working directory: {error}");
    code_log(
      "cwd:resolve:error",
      request_id,
      format!("stage=candidate candidate={} error={message:?}", candidate.display()),
    );
    message
  })?;
  if !candidate.starts_with(&root) {
    let message = "Refusing to execute code outside the active vault.".to_string();
    code_log(
      "cwd:resolve:error",
      request_id,
      format!(
        "stage=boundary root={} candidate={} error={message:?}",
        root.display(),
        candidate.display()
      ),
    );
    return Err(message);
  }
  if !candidate.is_dir() {
    let message = "The code execution working directory is not a folder.".to_string();
    code_log(
      "cwd:resolve:error",
      request_id,
      format!("stage=type candidate={} error={message:?}", candidate.display()),
    );
    return Err(message);
  }
  code_log(
    "cwd:resolve:complete",
    request_id,
    format!("root={} cwd={}", root.display(), candidate.display()),
  );
  Ok(candidate)
}

fn truncate_bytes(bytes: &[u8]) -> (String, bool) {
  let truncated = bytes.len() > MAX_OUTPUT_BYTES;
  let slice = if truncated {
    &bytes[..MAX_OUTPUT_BYTES]
  } else {
    bytes
  };
  (String::from_utf8_lossy(slice).to_string(), truncated)
}

async fn execute_process(
  request_id: &str,
  definition: &RuntimeDefinition,
  executable: &Path,
  args: &[String],
  code: &str,
  cwd: &Path,
  timeout_ms: u64,
) -> R<ProcessResult> {
  let started = Instant::now();
  code_log(
    "process:spawn:start",
    request_id,
    format!(
      "environment={} executable={} cwd={} args={:?} source_bytes={} timeout_ms={timeout_ms}",
      definition.id,
      executable.display(),
      cwd.display(),
      args,
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
    .map_err(|error| {
      let message = format!("Unable to start {}: {error}", executable.display());
      code_log("process:spawn:error", request_id, format!("error={message:?}"));
      message
    })?;

  code_log(
    "process:spawn:complete",
    request_id,
    format!("pid={:?} duration_ms={}", child.id(), started.elapsed().as_millis()),
  );

  let mut stdin = child.stdin.take().ok_or_else(|| {
    let message = "Unable to open interpreter stdin.".to_string();
    code_log("process:stdin:error", request_id, format!("error={message:?}"));
    message
  })?;
  let source = code.as_bytes().to_vec();
  let source_len = source.len();
  let stdin_request_id = request_id.to_string();
  let write_task = tokio::spawn(async move {
    code_log(
      "process:stdin:write:start",
      &stdin_request_id,
      format!("bytes={source_len}"),
    );
    stdin.write_all(&source).await.map_err(|error| {
      let message = error.to_string();
      code_log(
        "process:stdin:write:error",
        &stdin_request_id,
        format!("bytes={source_len} error={message:?}"),
      );
      message
    })?;
    stdin.shutdown().await.map_err(|error| {
      let message = error.to_string();
      code_log(
        "process:stdin:shutdown:error",
        &stdin_request_id,
        format!("error={message:?}"),
      );
      message
    })?;
    code_log(
      "process:stdin:write:complete",
      &stdin_request_id,
      format!("bytes={source_len}"),
    );
    Ok::<(), String>(())
  });

  code_log(
    "process:wait:start",
    request_id,
    format!("timeout_ms={timeout_ms}"),
  );
  let output = match timeout(Duration::from_millis(timeout_ms), child.wait_with_output()).await {
    Ok(result) => result.map_err(|error| {
      let message = format!("Unable to wait for interpreter process: {error}");
      code_log("process:wait:error", request_id, format!("error={message:?}"));
      message
    })?,
    Err(_) => {
      write_task.abort();
      code_log(
        "process:timeout",
        request_id,
        format!(
          "timeout_ms={timeout_ms} duration_ms={} action=kill-on-drop",
          started.elapsed().as_millis()
        ),
      );
      return Ok(ProcessResult {
        success: false,
        exit_code: None,
        stdout: String::new(),
        stderr: format!("Execution timed out after {timeout_ms} ms."),
        duration_ms: started.elapsed().as_millis(),
        timed_out: true,
        truncated: false,
      });
    }
  };

  match write_task.await {
    Ok(Ok(())) => {}
    Ok(Err(error)) => code_log(
      "process:stdin:task:error",
      request_id,
      format!("error={error:?}"),
    ),
    Err(error) => code_log(
      "process:stdin:task:join-error",
      request_id,
      format!("error={error:?}"),
    ),
  }

  code_log(
    "process:wait:complete",
    request_id,
    format!(
      "success={} exit_code={:?} stdout_bytes={} stderr_bytes={} duration_ms={}",
      output.status.success(),
      output.status.code(),
      output.stdout.len(),
      output.stderr.len(),
      started.elapsed().as_millis()
    ),
  );

  let (stdout, stdout_truncated) = truncate_bytes(&output.stdout);
  let (stderr, stderr_truncated) = truncate_bytes(&output.stderr);
  let truncated = stdout_truncated || stderr_truncated;
  code_log(
    "process:output:captured",
    request_id,
    format!(
      "stdout_bytes={} stderr_bytes={} stdout_truncated={} stderr_truncated={}",
      output.stdout.len(),
      output.stderr.len(),
      stdout_truncated,
      stderr_truncated
    ),
  );

  Ok(ProcessResult {
    success: output.status.success(),
    exit_code: output.status.code(),
    stdout,
    stderr,
    duration_ms: started.elapsed().as_millis(),
    timed_out: false,
    truncated,
  })
}

fn environment_payload(
  config: &CodeExecutionConfig,
  definition: &RuntimeDefinition,
  request_id: &str,
) -> Value {
  let configured = config
    .environments
    .get(definition.id)
    .cloned()
    .unwrap_or_default();
  code_log(
    "environment:resolve:start",
    request_id,
    format!(
      "environment={} configured={} candidates={:?}",
      definition.id,
      !configured.executable.trim().is_empty(),
      definition.candidates
    ),
  );
  let executable = resolve_executable(definition, &configured.executable);
  code_log(
    "environment:resolve:complete",
    request_id,
    format!(
      "environment={} available={} enabled={} executable={}",
      definition.id,
      executable.is_some(),
      configured.enabled.unwrap_or(true),
      executable
        .as_ref()
        .map(|path| path.to_string_lossy().to_string())
        .unwrap_or_default()
    ),
  );
  json!({
    "id": definition.id,
    "label": definition.label,
    "aliases": definition.aliases,
    "available": executable.is_some(),
    "enabled": configured.enabled.unwrap_or(true),
    "configuredExecutable": configured.executable,
    "executable": executable.as_ref().map(|path| path.to_string_lossy().to_string()).unwrap_or_default(),
    "version": executable.as_ref().map(|path| version_for(path, request_id, definition.id)).unwrap_or_default()
  })
}

#[tauri::command]
pub fn tauri_programs_list(app: AppHandle) -> R<Value> {
  let request_id = next_request_id("list");
  let started = Instant::now();
  code_log("command:start", &request_id, "action=list");
  let result = (|| {
    let config = read_config(&app, &request_id)?;
    let environments = runtime_definitions()
      .iter()
      .map(|definition| environment_payload(&config, definition, &request_id))
      .collect::<Vec<_>>();
    Ok(json!({
      "runtime": "tauri-rust",
      "executionEnabled": config.execution_enabled,
      "environments": environments,
      "limits": {
        "maxCodeBytes": MAX_CODE_BYTES,
        "maxOutputBytes": MAX_OUTPUT_BYTES,
        "defaultTimeoutMs": DEFAULT_TIMEOUT_MS,
        "maxTimeoutMs": MAX_TIMEOUT_MS
      }
    }))
  })();
  match &result {
    Ok(value) => code_log(
      "command:complete",
      &request_id,
      format!(
        "action=list duration_ms={} execution_enabled={} environments={}",
        started.elapsed().as_millis(),
        value["executionEnabled"].as_bool().unwrap_or(false),
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
  code_log(
    "command:start",
    &request_id,
    format!("action=set payload_type={}", if value.is_object() { "object" } else { "other" }),
  );
  let result = (|| {
    let config: CodeExecutionConfig = serde_json::from_value(value)
      .map_err(|error| format!("Invalid code execution settings: {error}"))?;
    write_config(&app, &config, &request_id)?;
    let environments = runtime_definitions()
      .iter()
      .map(|definition| environment_payload(&config, definition, &request_id))
      .collect::<Vec<_>>();
    Ok(json!({
      "runtime": "tauri-rust",
      "executionEnabled": config.execution_enabled,
      "environments": environments,
      "limits": {
        "maxCodeBytes": MAX_CODE_BYTES,
        "maxOutputBytes": MAX_OUTPUT_BYTES,
        "defaultTimeoutMs": DEFAULT_TIMEOUT_MS,
        "maxTimeoutMs": MAX_TIMEOUT_MS
      }
    }))
  })();
  match &result {
    Ok(_) => code_log(
      "command:complete",
      &request_id,
      format!("action=set duration_ms={}", started.elapsed().as_millis()),
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
  id: &str,
  command: &str,
  cwd: Option<String>,
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

  code_log(
    "validation:language:start",
    request_id,
    format!("requested={id:?}"),
  );
  let definition = resolve_definition(id)
    .ok_or_else(|| format!("No executable environment is registered for language: {id}"))?;
  code_log(
    "validation:language:complete",
    request_id,
    format!("requested={id:?} resolved={}", definition.id),
  );

  let config = read_config(app, request_id)?;
  code_log(
    "validation:global-opt-in",
    request_id,
    format!("execution_enabled={}", config.execution_enabled),
  );
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
  code_log(
    "validation:environment-enabled",
    request_id,
    format!(
      "environment={} enabled={} configured_executable={}",
      definition.id,
      configured.enabled.unwrap_or(true),
      !configured.executable.trim().is_empty()
    ),
  );
  if configured.enabled == Some(false) {
    return Err(format!("The {} environment is disabled.", definition.label));
  }

  code_log(
    "executable:resolve:start",
    request_id,
    format!(
      "environment={} configured={} candidates={:?}",
      definition.id,
      !configured.executable.trim().is_empty(),
      definition.candidates
    ),
  );
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
  )
  .await?;

  Ok(json!({
    "runtime": "tauri-rust",
    "language": definition.id,
    "environment": definition.label,
    "executable": executable.to_string_lossy(),
    "success": result.success,
    "exitCode": result.exit_code,
    "stdout": result.stdout,
    "stderr": result.stderr,
    "durationMs": result.duration_ms,
    "timedOut": result.timed_out,
    "truncated": result.truncated
  }))
}

#[tauri::command]
pub async fn tauri_programs_run(
  app: AppHandle,
  id: String,
  command: String,
  cwd: Option<String>,
) -> R<Value> {
  let request_id = next_request_id("run");
  let started = Instant::now();
  code_log(
    "command:start",
    &request_id,
    format!(
      "action=run requested_language={id:?} source_bytes={} cwd_requested={:?}",
      command.len(),
      cwd.as_deref().unwrap_or("")
    ),
  );

  let result = run_command(&app, &request_id, &id, &command, cwd).await;
  match &result {
    Ok(value) => code_log(
      "command:complete",
      &request_id,
      format!(
        "action=run language={} success={} exit_code={:?} duration_ms={} timed_out={} truncated={} stdout_bytes={} stderr_bytes={}",
        value["language"].as_str().unwrap_or(""),
        value["success"].as_bool().unwrap_or(false),
        value["exitCode"].as_i64(),
        started.elapsed().as_millis(),
        value["timedOut"].as_bool().unwrap_or(false),
        value["truncated"].as_bool().unwrap_or(false),
        value["stdout"].as_str().map(str::len).unwrap_or(0),
        value["stderr"].as_str().map(str::len).unwrap_or(0)
      ),
    ),
    Err(error) => code_log(
      "command:error",
      &request_id,
      format!(
        "action=run requested_language={id:?} duration_ms={} error={error:?}",
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
  fn default_configuration_requires_explicit_opt_in() {
    let config = CodeExecutionConfig::default();
    assert!(!config.execution_enabled);
    assert!(config.environments.is_empty());
  }

  #[test]
  fn truncates_output_at_the_documented_limit() {
    let bytes = vec![b'x'; MAX_OUTPUT_BYTES + 100];
    let (output, truncated) = truncate_bytes(&bytes);
    assert!(truncated);
    assert_eq!(output.len(), MAX_OUTPUT_BYTES);
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
    let result = execute_process(
      "test-real-python",
      &definition,
      &executable,
      &args,
      "print(6 * 7)",
      &cwd,
      5_000,
    )
    .await
    .unwrap();
    assert!(result.success, "stderr: {}", result.stderr);
    assert_eq!(result.stdout.trim(), "42");
  }
}

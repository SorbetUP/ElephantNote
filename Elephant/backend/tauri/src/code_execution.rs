use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  collections::HashMap,
  fs,
  path::{Path, PathBuf},
  process::Stdio,
  time::{Duration, Instant},
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

fn read_config(app: &AppHandle) -> CodeExecutionConfig {
  let Ok(path) = config_path(app) else {
    return CodeExecutionConfig::default();
  };
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or_default()
}

fn write_config(app: &AppHandle, config: &CodeExecutionConfig) -> R<()> {
  let raw = serde_json::to_string_pretty(config).map_err(|error| error.to_string())?;
  fs::write(config_path(app)?, raw).map_err(|error| error.to_string())
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

fn canonical_working_directory(app: &AppHandle, requested: Option<String>) -> R<PathBuf> {
  let vault = vault_config::get_active_vault(app)
    .map_err(|_| "Open a vault before running a code block.".to_string())?;
  let root = fs::canonicalize(&vault.path).map_err(|error| error.to_string())?;
  let candidate = requested
    .filter(|value| !value.trim().is_empty())
    .map(PathBuf::from)
    .map(|path| if path.is_absolute() { path } else { root.join(path) })
    .unwrap_or_else(|| root.clone());
  let candidate = fs::canonicalize(candidate).map_err(|error| error.to_string())?;
  if !candidate.starts_with(&root) {
    return Err("Refusing to execute code outside the active vault.".to_string());
  }
  if !candidate.is_dir() {
    return Err("The code execution working directory is not a folder.".to_string());
  }
  Ok(candidate)
}

fn truncate_bytes(bytes: &[u8]) -> (String, bool) {
  let truncated = bytes.len() > MAX_OUTPUT_BYTES;
  let slice = if truncated { &bytes[..MAX_OUTPUT_BYTES] } else { bytes };
  (String::from_utf8_lossy(slice).to_string(), truncated)
}

async fn execute_process(
  executable: &Path,
  args: &[String],
  code: &str,
  cwd: &Path,
  timeout_ms: u64,
) -> R<ProcessResult> {
  let started = Instant::now();
  let mut child = Command::new(executable)
    .args(args)
    .current_dir(cwd)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .kill_on_drop(true)
    .spawn()
    .map_err(|error| format!("Unable to start {}: {error}", executable.display()))?;

  let mut stdin = child.stdin.take().ok_or_else(|| "Unable to open interpreter stdin.".to_string())?;
  let source = code.as_bytes().to_vec();
  let write_task = tokio::spawn(async move {
    stdin.write_all(&source).await.map_err(|error| error.to_string())?;
    stdin.shutdown().await.map_err(|error| error.to_string())
  });

  let output = match timeout(Duration::from_millis(timeout_ms), child.wait_with_output()).await {
    Ok(result) => result.map_err(|error| error.to_string())?,
    Err(_) => {
      write_task.abort();
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
  let _ = write_task.await;
  let (stdout, stdout_truncated) = truncate_bytes(&output.stdout);
  let (stderr, stderr_truncated) = truncate_bytes(&output.stderr);
  Ok(ProcessResult {
    success: output.status.success(),
    exit_code: output.status.code(),
    stdout,
    stderr,
    duration_ms: started.elapsed().as_millis(),
    timed_out: false,
    truncated: stdout_truncated || stderr_truncated,
  })
}

fn environment_payload(config: &CodeExecutionConfig, definition: &RuntimeDefinition) -> Value {
  let configured = config.environments.get(definition.id).cloned().unwrap_or_default();
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

#[tauri::command]
pub fn tauri_programs_list(app: AppHandle) -> R<Value> {
  let config = read_config(&app);
  let environments = runtime_definitions()
    .iter()
    .map(|definition| environment_payload(&config, definition))
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
}

#[tauri::command]
pub fn tauri_programs_set(app: AppHandle, environments: Option<Value>) -> R<Value> {
  let value = environments.unwrap_or_else(|| json!({}));
  let config: CodeExecutionConfig = serde_json::from_value(value)
    .map_err(|error| format!("Invalid code execution settings: {error}"))?;
  write_config(&app, &config)?;
  tauri_programs_list(app)
}

#[tauri::command]
pub async fn tauri_programs_run(
  app: AppHandle,
  id: String,
  command: String,
  cwd: Option<String>,
) -> R<Value> {
  if command.as_bytes().len() > MAX_CODE_BYTES {
    return Err(format!("Code block exceeds the {MAX_CODE_BYTES} byte execution limit."));
  }
  let definition = resolve_definition(&id)
    .ok_or_else(|| format!("No executable environment is registered for language: {id}"))?;
  let config = read_config(&app);
  if !config.execution_enabled {
    return Err("Code execution is disabled. Enable it in Settings → Editor → Code execution.".to_string());
  }
  let configured = config.environments.get(definition.id).cloned().unwrap_or_default();
  if configured.enabled == Some(false) {
    return Err(format!("The {} environment is disabled.", definition.label));
  }
  let executable = resolve_executable(&definition, &configured.executable)
    .ok_or_else(|| format!("{} was not detected. Configure its executable in Settings.", definition.label))?;
  let working_directory = canonical_working_directory(&app, cwd)?;
  let args = invocation_args(&definition, &executable);
  eprintln!(
    "[Code] run:start language={} executable={} cwd={} bytes={}",
    definition.id,
    executable.display(),
    working_directory.display(),
    command.len()
  );
  let result = execute_process(
    &executable,
    &args,
    &command,
    &working_directory,
    DEFAULT_TIMEOUT_MS,
  )
  .await?;
  eprintln!(
    "[Code] run:complete language={} success={} code={:?} duration={}ms timed_out={} truncated={}",
    definition.id,
    result.success,
    result.exit_code,
    result.duration_ms,
    result.timed_out,
    result.truncated
  );
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn resolves_common_markdown_language_aliases() {
    assert_eq!(resolve_definition("py").map(|definition| definition.id), Some("python"));
    assert_eq!(resolve_definition("js").map(|definition| definition.id), Some("javascript"));
    assert_eq!(resolve_definition("ps1").map(|definition| definition.id), Some("powershell"));
    assert!(resolve_definition("made-up-language").is_none());
  }

  #[test]
  fn output_is_bounded_and_reports_truncation() {
    let bytes = vec![b'x'; MAX_OUTPUT_BYTES + 32];
    let (text, truncated) = truncate_bytes(&bytes);
    assert!(truncated);
    assert_eq!(text.len(), MAX_OUTPUT_BYTES);
  }

  #[tokio::test]
  async fn executes_a_real_python_interpreter_when_available() {
    let definition = resolve_definition("python").unwrap();
    let Some(executable) = resolve_executable(&definition, "") else {
      return;
    };
    let cwd = std::env::temp_dir();
    let result = execute_process(
      &executable,
      &invocation_args(&definition, &executable),
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

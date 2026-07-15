use serde::Deserialize;
use serde_json::{json, Value};
use std::{
  collections::HashMap,
  env,
  fs,
  io::{self, BufRead, BufReader, Read, Write},
  path::{Path, PathBuf},
  process::{Child, Command, ExitStatus, Stdio},
  sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    Arc, Mutex,
  },
  thread,
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

const PROTOCOL: &str = "elephant-addon-service-v1";
const ADDON_ID: &str = "elephant.code-execution";
const SERVICE_VERSION: &str = "2.2.0";
const DEFAULT_TIMEOUT_MS: u64 = 15_000;
const MAX_TIMEOUT_MS: u64 = 120_000;
const DEFAULT_OUTPUT_LINE_LIMIT: usize = 200;
const MAX_OUTPUT_LINE_LIMIT: usize = 20_000;
const MAX_CODE_BYTES: usize = 256 * 1024;
const MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;
const POLL_INTERVAL_MS: u64 = 20;
const SHUTDOWN_GRACE_MS: u64 = 2_000;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
  protocol: String,
  id: u64,
  addon_id: String,
  method: String,
  #[serde(default)]
  params: Value,
}

#[derive(Clone, Debug)]
struct ExecutionSnapshot {
  state: String,
  result: Option<Value>,
  error: Option<String>,
  started_at_ms: u128,
  updated_at_ms: u128,
}

impl ExecutionSnapshot {
  fn running() -> Self {
    let now = timestamp_ms();
    Self {
      state: "running".to_string(),
      result: None,
      error: None,
      started_at_ms: now,
      updated_at_ms: now,
    }
  }

  fn as_json(&self, execution_id: &str) -> Value {
    json!({
      "executionId": execution_id,
      "state": self.state,
      "running": self.state == "running",
      "startedAtMs": self.started_at_ms,
      "updatedAtMs": self.updated_at_ms,
      "result": self.result,
      "error": self.error,
    })
  }
}

#[derive(Clone)]
struct ExecutionRecord {
  cancel: Arc<AtomicBool>,
  snapshot: Arc<Mutex<ExecutionSnapshot>>,
}

struct ExecutionService {
  executions: HashMap<String, ExecutionRecord>,
  sequence: AtomicU64,
}

impl ExecutionService {
  fn new() -> Self {
    Self {
      executions: HashMap::new(),
      sequence: AtomicU64::new(1),
    }
  }

  fn next_execution_id(&self) -> String {
    let sequence = self.sequence.fetch_add(1, Ordering::Relaxed);
    format!("execution-{}-{sequence}", timestamp_ms())
  }

  fn start_execution(&mut self, params: Value) -> Result<Value, String> {
    let prepared = PreparedExecution::from_params(&params)?;
    let execution_id = self.next_execution_id();
    let cancel = Arc::new(AtomicBool::new(false));
    let snapshot = Arc::new(Mutex::new(ExecutionSnapshot::running()));
    self.executions.insert(
      execution_id.clone(),
      ExecutionRecord {
        cancel: cancel.clone(),
        snapshot: snapshot.clone(),
      },
    );

    let worker_id = execution_id.clone();
    thread::Builder::new()
      .name(format!("elephant-code-{worker_id}"))
      .spawn(move || {
        let outcome = run_execution(&prepared, cancel);
        let mut current = snapshot.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        current.updated_at_ms = timestamp_ms();
        match outcome {
          Ok(result) => {
            current.state = if result.get("interrupted").and_then(Value::as_bool) == Some(true) {
              "cancelled".to_string()
            } else if result.get("timedOut").and_then(Value::as_bool) == Some(true) {
              "timed_out".to_string()
            } else {
              "completed".to_string()
            };
            current.result = Some(result);
            current.error = None;
          }
          Err(error) => {
            current.state = "failed".to_string();
            current.result = None;
            current.error = Some(error);
          }
        }
      })
      .map_err(|error| format!("Unable to start execution worker: {error}"))?;

    Ok(json!({
      "executionId": execution_id,
      "state": "running",
      "running": true,
      "timeoutMs": prepared.timeout_ms,
    }))
  }

  fn execution_status(&self, params: &Value) -> Result<Value, String> {
    let execution_id = required_string(params, "executionId")?;
    let record = self
      .executions
      .get(execution_id)
      .ok_or_else(|| format!("Unknown code execution: {execution_id}"))?;
    let snapshot = record
      .snapshot
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner())
      .clone();
    Ok(snapshot.as_json(execution_id))
  }

  fn cancel_execution(&self, params: &Value) -> Result<Value, String> {
    let execution_id = required_string(params, "executionId")?;
    let record = self
      .executions
      .get(execution_id)
      .ok_or_else(|| format!("Unknown code execution: {execution_id}"))?;
    let state = record
      .snapshot
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner())
      .state
      .clone();
    if state == "running" {
      record.cancel.store(true, Ordering::Release);
    }
    Ok(json!({
      "executionId": execution_id,
      "cancelRequested": state == "running",
      "state": state,
    }))
  }

  fn forget_execution(&mut self, params: &Value) -> Result<Value, String> {
    let execution_id = required_string(params, "executionId")?.to_string();
    let Some(record) = self.executions.get(&execution_id) else {
      return Ok(json!({ "executionId": execution_id, "removed": false }));
    };
    let state = record
      .snapshot
      .lock()
      .unwrap_or_else(|poisoned| poisoned.into_inner())
      .state
      .clone();
    if state == "running" {
      return Err("A running execution must be cancelled before it can be forgotten".to_string());
    }
    self.executions.remove(&execution_id);
    Ok(json!({ "executionId": execution_id, "removed": true }))
  }

  fn list_executions(&self) -> Value {
    let mut executions = self
      .executions
      .iter()
      .map(|(execution_id, record)| {
        record
          .snapshot
          .lock()
          .unwrap_or_else(|poisoned| poisoned.into_inner())
          .clone()
          .as_json(execution_id)
      })
      .collect::<Vec<_>>();
    executions.sort_by_key(|value| value.get("startedAtMs").and_then(Value::as_u64).unwrap_or(0));
    json!({ "executions": executions })
  }

  fn stop_all(&self) -> Value {
    for record in self.executions.values() {
      record.cancel.store(true, Ordering::Release);
    }
    let deadline = Instant::now() + Duration::from_millis(SHUTDOWN_GRACE_MS);
    loop {
      let running = self.executions.values().any(|record| {
        record
          .snapshot
          .lock()
          .unwrap_or_else(|poisoned| poisoned.into_inner())
          .state
          == "running"
      });
      if !running || Instant::now() >= deadline {
        return json!({ "stopped": true, "remaining": running });
      }
      thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
    }
  }

  fn handle(&mut self, method: &str, params: &Value) -> Result<Value, String> {
    match method {
      "service.start" => Ok(json!({
        "running": true,
        "owner": ADDON_ID,
        "version": SERVICE_VERSION,
        "capabilities": ["execute", "execution.status", "execution.cancel", "execution.forget", "executions.list", "interpreter.status"]
      })),
      "service.stop" => Ok(self.stop_all()),
      "interpreter.status" | "status" => Ok(executable_status(params)),
      "execute" => self.start_execution(params.clone()),
      "execution.status" => self.execution_status(params),
      "execution.cancel" => self.cancel_execution(params),
      "execution.forget" => self.forget_execution(params),
      "executions.list" => Ok(self.list_executions()),
      other => Err(format!("Unsupported Code execution service method: {other}")),
    }
  }
}

struct PreparedExecution {
  executable: String,
  args: Vec<String>,
  code: String,
  cwd: PathBuf,
  output_line_limit: usize,
  timeout_ms: u64,
}

impl PreparedExecution {
  fn from_params(params: &Value) -> Result<Self, String> {
    let executable = required_string(params, "executable")?.to_string();
    let code = required_string(params, "code")?.to_string();
    if code.len() > MAX_CODE_BYTES {
      return Err(format!("Code exceeds the {} KiB execution limit", MAX_CODE_BYTES / 1024));
    }
    let args = params
      .get("args")
      .and_then(Value::as_array)
      .map(|values| {
        values
          .iter()
          .filter_map(Value::as_str)
          .map(ToString::to_string)
          .collect::<Vec<_>>()
      })
      .unwrap_or_default();
    let output_line_limit = params
      .get("outputLineLimit")
      .and_then(Value::as_u64)
      .map(|value| value.clamp(1, MAX_OUTPUT_LINE_LIMIT as u64) as usize)
      .unwrap_or(DEFAULT_OUTPUT_LINE_LIMIT);
    let timeout_ms = params
      .get("timeoutMs")
      .and_then(Value::as_u64)
      .unwrap_or(DEFAULT_TIMEOUT_MS)
      .clamp(250, MAX_TIMEOUT_MS);
    let requested_cwd = params.get("cwd").and_then(Value::as_str).unwrap_or("");
    let cwd = resolve_working_directory(requested_cwd)?;
    Ok(Self {
      executable,
      args,
      code,
      cwd,
      output_line_limit,
      timeout_ms,
    })
  }
}

#[derive(Default)]
struct CapturedOutput {
  bytes: Vec<u8>,
  total_bytes: usize,
  dropped_bytes: usize,
}

fn capture_stream<R>(mut reader: R) -> CapturedOutput
where
  R: Read,
{
  let mut output = CapturedOutput::default();
  let mut buffer = [0u8; 16 * 1024];
  loop {
    let read = match reader.read(&mut buffer) {
      Ok(0) | Err(_) => break,
      Ok(read) => read,
    };
    output.total_bytes = output.total_bytes.saturating_add(read);
    let remaining = MAX_OUTPUT_BYTES.saturating_sub(output.bytes.len());
    let retained = read.min(remaining);
    output.bytes.extend_from_slice(&buffer[..retained]);
    output.dropped_bytes = output.dropped_bytes.saturating_add(read - retained);
  }
  output
}

fn prepared_output(output: CapturedOutput, line_limit: usize) -> Value {
  let decoded = String::from_utf8_lossy(&output.bytes);
  let mut lines = decoded.lines();
  let kept = lines.by_ref().take(line_limit).collect::<Vec<_>>();
  let dropped_lines = lines.count();
  let mut text = kept.join("\n");
  let truncated = dropped_lines > 0 || output.dropped_bytes > 0;
  if truncated {
    if !text.is_empty() {
      text.push('\n');
    }
    text.push_str("… output truncated by Elephant Code execution …");
  }
  json!({
    "text": text,
    "lineCount": kept.len(),
    "droppedLines": dropped_lines,
    "totalBytes": output.total_bytes,
    "droppedBytes": output.dropped_bytes,
    "truncated": truncated,
  })
}

fn run_execution(prepared: &PreparedExecution, cancel: Arc<AtomicBool>) -> Result<Value, String> {
  let started = Instant::now();
  let mut command = Command::new(&prepared.executable);
  command.args(&prepared.args);
  command.current_dir(&prepared.cwd);
  command.stdin(Stdio::piped());
  command.stdout(Stdio::piped());
  command.stderr(Stdio::piped());

  let mut child = command
    .spawn()
    .map_err(|error| format!("Interpreter spawn failed: {error}"))?;
  if let Some(mut stdin) = child.stdin.take() {
    stdin
      .write_all(prepared.code.as_bytes())
      .map_err(|error| format!("Failed to send code to interpreter: {error}"))?;
  }

  let stdout = child.stdout.take().ok_or_else(|| "Interpreter stdout is unavailable".to_string())?;
  let stderr = child.stderr.take().ok_or_else(|| "Interpreter stderr is unavailable".to_string())?;
  let stdout_thread = thread::spawn(move || capture_stream(stdout));
  let stderr_thread = thread::spawn(move || capture_stream(stderr));

  let mut timed_out = false;
  let mut interrupted = false;
  let status = loop {
    if cancel.load(Ordering::Acquire) {
      interrupted = true;
      terminate_child(&mut child);
      break child.wait().ok();
    }
    if started.elapsed() >= Duration::from_millis(prepared.timeout_ms) {
      timed_out = true;
      terminate_child(&mut child);
      break child.wait().ok();
    }
    match child.try_wait() {
      Ok(Some(status)) => break Some(status),
      Ok(None) => thread::sleep(Duration::from_millis(POLL_INTERVAL_MS)),
      Err(error) => {
        terminate_child(&mut child);
        return Err(format!("Interpreter execution failed: {error}"));
      }
    }
  };

  let stdout = stdout_thread.join().unwrap_or_default();
  let stderr = stderr_thread.join().unwrap_or_default();
  let stdout = prepared_output(stdout, prepared.output_line_limit);
  let stderr = prepared_output(stderr, prepared.output_line_limit);
  let success = status.as_ref().map(ExitStatus::success).unwrap_or(false) && !timed_out && !interrupted;
  Ok(json!({
    "success": success,
    "code": status.and_then(|value| value.code()),
    "stdout": stdout.get("text").cloned().unwrap_or(Value::String(String::new())),
    "stderr": stderr.get("text").cloned().unwrap_or(Value::String(String::new())),
    "stdoutMeta": stdout,
    "stderrMeta": stderr,
    "executable": prepared.executable,
    "cwd": prepared.cwd.to_string_lossy(),
    "durationMs": started.elapsed().as_millis(),
    "timedOut": timed_out,
    "interrupted": interrupted,
    "truncated": stdout.get("truncated").and_then(Value::as_bool).unwrap_or(false)
      || stderr.get("truncated").and_then(Value::as_bool).unwrap_or(false),
  }))
}

fn terminate_child(child: &mut Child) {
  let _ = child.kill();
}

fn executable_status(params: &Value) -> Value {
  let executable = params.get("executable").and_then(Value::as_str).unwrap_or("").trim();
  if executable.is_empty() {
    return json!({ "available": false, "error": "No executable was configured" });
  }
  let started = Instant::now();
  let mut child = match Command::new(executable)
    .arg("--version")
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .spawn()
  {
    Ok(child) => child,
    Err(error) => {
      return json!({
        "available": false,
        "executable": executable,
        "error": format!("Interpreter could not be started: {error}")
      })
    }
  };
  loop {
    match child.try_wait() {
      Ok(Some(_)) => break,
      Ok(None) if started.elapsed() < Duration::from_secs(3) => {
        thread::sleep(Duration::from_millis(POLL_INTERVAL_MS));
      }
      _ => {
        terminate_child(&mut child);
        break;
      }
    }
  }
  match child.wait_with_output() {
    Ok(output) => json!({
      "available": output.status.success(),
      "executable": executable,
      "version": first_lines(&output.stdout, 3),
      "stderr": first_lines(&output.stderr, 3),
    }),
    Err(error) => json!({
      "available": false,
      "executable": executable,
      "error": format!("Interpreter status failed: {error}")
    }),
  }
}

fn first_lines(bytes: &[u8], limit: usize) -> String {
  String::from_utf8_lossy(bytes).lines().take(limit).collect::<Vec<_>>().join("\n")
}

fn resolve_working_directory(requested: &str) -> Result<PathBuf, String> {
  let vault = env::var_os("ELEPHANT_VAULT_DIR")
    .map(PathBuf::from)
    .ok_or_else(|| "ELEPHANT_VAULT_DIR is unavailable".to_string())?;
  let root = fs::canonicalize(&vault)
    .map_err(|error| format!("Unable to resolve the active vault: {error}"))?;
  let candidate = if requested.trim().is_empty() {
    root.clone()
  } else {
    let requested = Path::new(requested.trim());
    if requested.is_absolute() {
      requested.to_path_buf()
    } else {
      root.join(requested)
    }
  };
  let candidate = fs::canonicalize(&candidate)
    .map_err(|error| format!("Unable to resolve the execution directory: {error}"))?;
  if !candidate.starts_with(&root) {
    return Err("Refusing to execute code outside the active vault".to_string());
  }
  if !candidate.is_dir() {
    return Err("The execution directory is not a folder".to_string());
  }
  Ok(candidate)
}

fn required_string<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
  let value = params.get(key).and_then(Value::as_str).unwrap_or("").trim();
  if value.is_empty() {
    Err(format!("{key} is required"))
  } else {
    Ok(value)
  }
}

fn timestamp_ms() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis()
}

fn success(id: u64, result: Value) -> Value {
  json!({ "protocol": PROTOCOL, "id": id, "ok": true, "result": result })
}

fn failure(id: u64, message: impl Into<String>) -> Value {
  json!({
    "protocol": PROTOCOL,
    "id": id,
    "ok": false,
    "error": { "message": message.into() }
  })
}

fn main() {
  let stdin = io::stdin();
  let stdout = io::stdout();
  let mut writer = stdout.lock();
  let mut service = ExecutionService::new();

  for line in BufReader::new(stdin.lock()).lines() {
    let line = match line {
      Ok(line) if !line.trim().is_empty() => line,
      Ok(_) => continue,
      Err(error) => {
        eprintln!("[code-execution] stdin error: {error}");
        break;
      }
    };
    let request = match serde_json::from_str::<Request>(&line) {
      Ok(request) => request,
      Err(error) => {
        let response = failure(0, format!("Invalid service request: {error}"));
        let _ = writeln!(writer, "{response}");
        let _ = writer.flush();
        continue;
      }
    };
    let stop = request.method == "service.stop";
    let response = if request.protocol != PROTOCOL {
      failure(request.id, format!("Unsupported service protocol: {}", request.protocol))
    } else if request.addon_id != ADDON_ID {
      failure(request.id, format!("Service addon id mismatch: {}", request.addon_id))
    } else {
      match service.handle(&request.method, &request.params) {
        Ok(result) => success(request.id, result),
        Err(error) => failure(request.id, error),
      }
    };
    if writeln!(writer, "{response}").is_err() || writer.flush().is_err() {
      break;
    }
    if stop {
      break;
    }
  }

  let _ = service.stop_all();
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_empty_execution_request() {
    assert!(PreparedExecution::from_params(&json!({})).is_err());
  }

  #[test]
  fn clamps_timeout_and_output_limit() {
    let temporary = env::temp_dir().join(format!("elephant-code-test-{}", timestamp_ms()));
    fs::create_dir_all(&temporary).unwrap();
    env::set_var("ELEPHANT_VAULT_DIR", &temporary);
    let prepared = PreparedExecution::from_params(&json!({
      "executable": "python3",
      "code": "print(1)",
      "timeoutMs": 999_999,
      "outputLineLimit": 999_999
    }))
    .unwrap();
    assert_eq!(prepared.timeout_ms, MAX_TIMEOUT_MS);
    assert_eq!(prepared.output_line_limit, MAX_OUTPUT_LINE_LIMIT);
    let _ = fs::remove_dir_all(temporary);
  }

  #[test]
  fn working_directory_cannot_escape_the_vault() {
    let root = env::temp_dir().join(format!("elephant-code-vault-{}", timestamp_ms()));
    let outside = env::temp_dir().join(format!("elephant-code-outside-{}", timestamp_ms()));
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&outside).unwrap();
    env::set_var("ELEPHANT_VAULT_DIR", &root);
    assert!(resolve_working_directory(outside.to_string_lossy().as_ref()).is_err());
    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(outside);
  }

  #[test]
  fn unknown_execution_is_rejected() {
    let service = ExecutionService::new();
    assert!(service.execution_status(&json!({ "executionId": "missing" })).is_err());
  }
}

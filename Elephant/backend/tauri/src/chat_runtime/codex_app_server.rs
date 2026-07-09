use serde_json::{json, Value};
use std::{
  collections::{HashMap, HashSet},
  env,
  path::{Path, PathBuf},
  process::Stdio,
  sync::{
    atomic::{AtomicU64, Ordering},
    Arc, OnceLock,
  },
  time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};
use tokio::{
  io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
  process::{Child, ChildStdin, Command},
  sync::{broadcast, oneshot, Mutex},
  time::{timeout, Instant},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TURN_TIMEOUT: Duration = Duration::from_secs(180);
const PROBE_TIMEOUT: Duration = Duration::from_secs(12);
const SHELL_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_LOG_TEXT: usize = 900;

type R<T> = Result<T, String>;

#[derive(Debug)]
pub struct CodexChatResult {
  pub answer: String,
  pub model: String,
  pub thread_id: String,
}

#[derive(Clone, Debug)]
struct CodexCandidate {
  path: PathBuf,
  source: String,
}

#[derive(Clone, Debug)]
struct CodexRuntime {
  path: PathBuf,
  source: String,
  version: String,
}

#[derive(Clone, Debug)]
struct CodexProbe {
  path: PathBuf,
  source: String,
  exists: bool,
  executable: bool,
  version: Option<String>,
  error: Option<String>,
}

#[derive(Debug)]
struct CodexResolution {
  runtime: Option<CodexRuntime>,
  probes: Vec<CodexProbe>,
  detected: bool,
}

struct CodexClient {
  runtime: CodexRuntime,
  child: Arc<Mutex<Child>>,
  stdin: Arc<Mutex<ChildStdin>>,
  pending: Arc<Mutex<HashMap<u64, oneshot::Sender<R<Value>>>>>,
  events: broadcast::Sender<Value>,
  next_id: AtomicU64,
}

struct CodexAppServerState {
  client: Mutex<Option<Arc<CodexClient>>>,
}

static STATE: OnceLock<CodexAppServerState> = OnceLock::new();

fn state() -> &'static CodexAppServerState {
  STATE.get_or_init(CodexAppServerState::new)
}

fn codex_log(stage: &str, message: impl AsRef<str>) {
  eprintln!("[Codex][{stage}] {}", message.as_ref());
}

fn truncate_log(value: impl AsRef<str>) -> String {
  let value = value.as_ref().trim();
  if value.chars().count() <= MAX_LOG_TEXT {
    return value.to_string();
  }
  let shortened = value.chars().take(MAX_LOG_TEXT).collect::<String>();
  format!("{shortened}…")
}

fn path_text(path: &Path) -> String {
  path.to_string_lossy().to_string()
}

fn target_triple() -> Option<&'static str> {
  match (env::consts::OS, env::consts::ARCH) {
    ("macos", "aarch64") => Some("aarch64-apple-darwin"),
    ("macos", "x86_64") => Some("x86_64-apple-darwin"),
    ("linux", "aarch64") => Some("aarch64-unknown-linux-musl"),
    ("linux", "x86_64") => Some("x86_64-unknown-linux-musl"),
    ("windows", "aarch64") => Some("aarch64-pc-windows-msvc"),
    ("windows", "x86_64") => Some("x86_64-pc-windows-msvc"),
    _ => None,
  }
}

fn platform_package() -> Option<&'static str> {
  match target_triple()? {
    "aarch64-apple-darwin" => Some("codex-darwin-arm64"),
    "x86_64-apple-darwin" => Some("codex-darwin-x64"),
    "aarch64-unknown-linux-musl" => Some("codex-linux-arm64"),
    "x86_64-unknown-linux-musl" => Some("codex-linux-x64"),
    "aarch64-pc-windows-msvc" => Some("codex-win32-arm64"),
    "x86_64-pc-windows-msvc" => Some("codex-win32-x64"),
    _ => None,
  }
}

fn native_binary_name() -> &'static str {
  if cfg!(windows) { "codex.exe" } else { "codex" }
}

fn home_dir() -> Option<PathBuf> {
  env::var_os("HOME")
    .map(PathBuf::from)
    .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
}

fn is_executable(path: &Path) -> bool {
  let Ok(metadata) = std::fs::metadata(path) else {
    return false;
  };
  if !metadata.is_file() {
    return false;
  }
  #[cfg(unix)]
  {
    use std::os::unix::fs::PermissionsExt;
    metadata.permissions().mode() & 0o111 != 0
  }
  #[cfg(not(unix))]
  {
    true
  }
}

fn push_candidate(
  candidates: &mut Vec<CodexCandidate>,
  seen: &mut HashSet<PathBuf>,
  path: PathBuf,
  source: impl Into<String>,
) {
  if path.as_os_str().is_empty() {
    return;
  }
  let normalized = std::fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
  if seen.insert(normalized) {
    candidates.push(CodexCandidate { path, source: source.into() });
  }
}

fn package_roots_from_entry(entry: &Path) -> Vec<PathBuf> {
  let mut roots = Vec::new();
  let mut variants = vec![entry.to_path_buf()];
  if let Ok(canonical) = std::fs::canonicalize(entry) {
    if canonical != entry {
      variants.push(canonical);
    }
  }

  for variant in variants {
    if variant.file_name().and_then(|value| value.to_str()) == Some("codex.js") {
      if let Some(root) = variant.parent().and_then(Path::parent) {
        roots.push(root.to_path_buf());
      }
    }
    for ancestor in variant.ancestors() {
      let is_codex = ancestor.file_name().and_then(|value| value.to_str()) == Some("codex");
      let is_openai_parent = ancestor
        .parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        == Some("@openai");
      if is_codex && is_openai_parent {
        roots.push(ancestor.to_path_buf());
      }
    }
  }

  roots.sort();
  roots.dedup();
  roots
}

fn add_native_candidates_for_entry(
  candidates: &mut Vec<CodexCandidate>,
  seen: &mut HashSet<PathBuf>,
  entry: &Path,
  source: &str,
) {
  let Some(triple) = target_triple() else {
    return;
  };
  let binary = native_binary_name();
  let Some(platform_package) = platform_package() else {
    return;
  };

  for root in package_roots_from_entry(entry) {
    push_candidate(
      candidates,
      seen,
      root.join("vendor").join(triple).join("bin").join(binary),
      format!("{source}:bundled-current"),
    );
    push_candidate(
      candidates,
      seen,
      root.join("vendor").join(triple).join("codex").join(binary),
      format!("{source}:bundled-legacy"),
    );
    push_candidate(
      candidates,
      seen,
      root.join("vendor").join(triple).join(binary),
      format!("{source}:bundled-flat"),
    );

    let mut package_bases = vec![root.join("node_modules").join("@openai").join(platform_package)];
    if let Some(node_modules) = root.parent().and_then(Path::parent) {
      package_bases.push(node_modules.join("@openai").join(platform_package));
    }
    for package_base in package_bases {
      push_candidate(
        candidates,
        seen,
        package_base.join("vendor").join(triple).join("bin").join(binary),
        format!("{source}:optional-platform-package"),
      );
      push_candidate(
        candidates,
        seen,
        package_base.join("vendor").join(triple).join("codex").join(binary),
        format!("{source}:optional-platform-package-legacy"),
      );
    }
  }
}

fn add_nvm_candidates(entries: &mut Vec<CodexCandidate>, seen: &mut HashSet<PathBuf>) {
  let Some(home) = home_dir() else {
    return;
  };
  let versions = home.join(".nvm").join("versions").join("node");
  let Ok(read_dir) = std::fs::read_dir(&versions) else {
    return;
  };
  let mut paths = read_dir
    .filter_map(Result::ok)
    .map(|entry| entry.path().join("bin").join(native_binary_name()))
    .collect::<Vec<_>>();
  paths.sort();
  paths.reverse();
  for path in paths {
    push_candidate(entries, seen, path, "nvm-global-bin");
  }
}

async fn login_shell_codex_path() -> Option<PathBuf> {
  #[cfg(unix)]
  {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    codex_log("resolver", format!("login-shell probe shell={shell}"));
    let output = timeout(
      SHELL_TIMEOUT,
      Command::new(&shell)
        .args(["-lic", "whence -p codex 2>/dev/null || command -v codex 2>/dev/null"])
        .stdin(Stdio::null())
        .output(),
    )
    .await
    .ok()??;
    if !output.status.success() {
      codex_log(
        "resolver",
        format!(
          "login-shell probe failed status={} stderr={}",
          output.status,
          truncate_log(String::from_utf8_lossy(&output.stderr))
        ),
      );
      return None;
    }
    let first_line = String::from_utf8_lossy(&output.stdout).lines().next()?.trim().to_string();
    if first_line.starts_with('/') {
      codex_log("resolver", format!("login-shell resolved path={first_line}"));
      return Some(PathBuf::from(first_line));
    }
    codex_log("resolver", format!("login-shell returned non-path value={first_line}"));
    None
  }
  #[cfg(not(unix))]
  {
    None
  }
}

async fn collect_candidates() -> Vec<CodexCandidate> {
  let mut entrypoints = Vec::new();
  let mut entry_seen = HashSet::new();

  for key in ["ELEPHANTNOTE_CODEX_PATH", "CODEX_PATH"] {
    if let Some(value) = env::var_os(key) {
      push_candidate(&mut entrypoints, &mut entry_seen, PathBuf::from(value), format!("env:{key}"));
    }
  }

  match which::which("codex") {
    Ok(path) => push_candidate(&mut entrypoints, &mut entry_seen, path, "process-path"),
    Err(error) => codex_log("resolver", format!("process PATH has no codex: {error}")),
  }

  if let Some(path) = login_shell_codex_path().await {
    push_candidate(&mut entrypoints, &mut entry_seen, path, "login-shell");
  }

  #[cfg(target_os = "macos")]
  for path in [
    "/opt/homebrew/bin/codex",
    "/usr/local/bin/codex",
    "/Applications/Codex.app/Contents/MacOS/codex",
  ] {
    push_candidate(&mut entrypoints, &mut entry_seen, PathBuf::from(path), "macos-common-path");
  }

  add_nvm_candidates(&mut entrypoints, &mut entry_seen);

  let mut candidates = Vec::new();
  let mut seen = HashSet::new();
  for entry in entrypoints {
    add_native_candidates_for_entry(&mut candidates, &mut seen, &entry.path, &entry.source);
    push_candidate(&mut candidates, &mut seen, entry.path, entry.source);
  }
  candidates
}

async fn probe_candidate(candidate: CodexCandidate) -> CodexProbe {
  let exists = candidate.path.is_file();
  let executable = is_executable(&candidate.path);
  codex_log(
    "resolver",
    format!(
      "candidate source={} path={} exists={} executable={}",
      candidate.source,
      path_text(&candidate.path),
      exists,
      executable
    ),
  );

  if !exists {
    return CodexProbe {
      path: candidate.path,
      source: candidate.source,
      exists,
      executable,
      version: None,
      error: Some("file does not exist".to_string()),
    };
  }
  if !executable {
    return CodexProbe {
      path: candidate.path,
      source: candidate.source,
      exists,
      executable,
      version: None,
      error: Some("file is not executable".to_string()),
    };
  }

  let started = Instant::now();
  let output = timeout(
    PROBE_TIMEOUT,
    Command::new(&candidate.path)
      .arg("--version")
      .stdin(Stdio::null())
      .output(),
  )
  .await;

  match output {
    Err(_) => {
      let error = format!("version probe timed out after {}ms", started.elapsed().as_millis());
      codex_log("resolver", format!("candidate rejected path={} error={error}", path_text(&candidate.path)));
      CodexProbe {
        path: candidate.path,
        source: candidate.source,
        exists,
        executable,
        version: None,
        error: Some(error),
      }
    }
    Ok(Err(error)) => {
      let error = format!("spawn failed: {error}");
      codex_log("resolver", format!("candidate rejected path={} error={error}", path_text(&candidate.path)));
      CodexProbe {
        path: candidate.path,
        source: candidate.source,
        exists,
        executable,
        version: None,
        error: Some(error),
      }
    }
    Ok(Ok(output)) if output.status.success() => {
      let stdout = truncate_log(String::from_utf8_lossy(&output.stdout));
      let stderr = truncate_log(String::from_utf8_lossy(&output.stderr));
      let version = if stdout.is_empty() { stderr } else { stdout };
      codex_log(
        "resolver",
        format!(
          "candidate accepted source={} path={} version={} duration_ms={}",
          candidate.source,
          path_text(&candidate.path),
          version,
          started.elapsed().as_millis()
        ),
      );
      CodexProbe {
        path: candidate.path,
        source: candidate.source,
        exists,
        executable,
        version: Some(version),
        error: None,
      }
    }
    Ok(Ok(output)) => {
      let stdout = truncate_log(String::from_utf8_lossy(&output.stdout));
      let stderr = truncate_log(String::from_utf8_lossy(&output.stderr));
      let error = format!("exit={} stdout={} stderr={}", output.status, stdout, stderr);
      codex_log(
        "resolver",
        format!(
          "candidate rejected source={} path={} duration_ms={} error={}",
          candidate.source,
          path_text(&candidate.path),
          started.elapsed().as_millis(),
          error
        ),
      );
      CodexProbe {
        path: candidate.path,
        source: candidate.source,
        exists,
        executable,
        version: None,
        error: Some(error),
      }
    }
  }
}

async fn diagnose_codex_runtime() -> CodexResolution {
  codex_log(
    "resolver",
    format!(
      "start os={} arch={} target={} cwd={} PATH={}",
      env::consts::OS,
      env::consts::ARCH,
      target_triple().unwrap_or("unsupported"),
      env::current_dir().map(|path| path_text(&path)).unwrap_or_else(|_| "<unknown>".to_string()),
      env::var("PATH").unwrap_or_else(|_| "<unset>".to_string())
    ),
  );

  let candidates = collect_candidates().await;
  codex_log("resolver", format!("candidate-count={}", candidates.len()));
  let mut probes = Vec::new();
  let mut detected = false;

  for candidate in candidates {
    let probe = probe_candidate(candidate).await;
    detected |= probe.exists;
    if let Some(version) = probe.version.clone() {
      let runtime = CodexRuntime {
        path: probe.path.clone(),
        source: probe.source.clone(),
        version,
      };
      probes.push(probe);
      codex_log(
        "resolver",
        format!("selected source={} path={}", runtime.source, path_text(&runtime.path)),
      );
      return CodexResolution { runtime: Some(runtime), probes, detected: true };
    }
    probes.push(probe);
  }

  codex_log("resolver", format!("failed detected={} probes={}", detected, probes.len()));
  CodexResolution { runtime: None, probes, detected }
}

fn resolution_error(resolution: &CodexResolution) -> String {
  let headline = if resolution.detected {
    "Codex CLI was detected, but every discovered installation is unusable."
  } else {
    "Codex CLI was not found in the process PATH, login shell, common install locations, or NVM installations."
  };
  let details = resolution
    .probes
    .iter()
    .filter(|probe| probe.exists || probe.error.as_deref() != Some("file does not exist"))
    .take(10)
    .map(|probe| {
      format!(
        "- {} [{}]: {}",
        path_text(&probe.path),
        probe.source,
        probe.error.as_deref().unwrap_or("unknown failure")
      )
    })
    .collect::<Vec<_>>()
    .join("\n");
  if details.is_empty() {
    headline.to_string()
  } else {
    format!("{headline}\n{details}")
  }
}

fn probes_json(probes: &[CodexProbe]) -> Vec<Value> {
  probes
    .iter()
    .map(|probe| {
      json!({
        "path": path_text(&probe.path),
        "source": probe.source,
        "exists": probe.exists,
        "executable": probe.executable,
        "version": probe.version,
        "error": probe.error
      })
    })
    .collect()
}

fn params_summary(method: &str, params: &Value) -> String {
  match method {
    "turn/start" => format!(
      "thread={} model={} input_items={} input_chars={}",
      params.get("threadId").and_then(Value::as_str).unwrap_or("<none>"),
      params.get("model").and_then(Value::as_str).unwrap_or("<default>"),
      params.get("input").and_then(Value::as_array).map_or(0, Vec::len),
      params
        .get("input")
        .and_then(Value::as_array)
        .map(|items| {
          items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .map(str::chars)
            .map(Iterator::count)
            .sum::<usize>()
        })
        .unwrap_or(0)
    ),
    "thread/start" => format!(
      "model={} cwd={} approval={}",
      params.get("model").and_then(Value::as_str).unwrap_or("<default>"),
      params.get("cwd").and_then(Value::as_str).unwrap_or("<none>"),
      params.get("approvalPolicy").and_then(Value::as_str).unwrap_or("<none>")
    ),
    "account/login/start" => format!("type={}", params.get("type").and_then(Value::as_str).unwrap_or("<none>")),
    _ => format!(
      "keys={}",
      params
        .as_object()
        .map(|object| object.keys().cloned().collect::<Vec<_>>().join(","))
        .unwrap_or_else(|| "<non-object>".to_string())
    ),
  }
}

fn event_summary(event: &Value) -> String {
  let method = event.get("method").and_then(Value::as_str).unwrap_or("<none>");
  let thread = event_thread_id(event);
  let turn = event_turn_id(event);
  let delta_chars = delta_text(event).chars().count();
  let item_type = event.pointer("/params/item/type").and_then(Value::as_str).unwrap_or("");
  format!("method={method} thread={thread} turn={turn} item_type={item_type} delta_chars={delta_chars}")
}

impl CodexAppServerState {
  pub fn new() -> Self {
    Self { client: Mutex::new(None) }
  }

  async fn client(&self, app: &AppHandle) -> R<Arc<CodexClient>> {
    let mut slot = self.client.lock().await;
    if let Some(client) = slot.as_ref() {
      if client.is_running().await {
        codex_log(
          "state",
          format!("reuse pid runtime={} source={}", path_text(&client.runtime.path), client.runtime.source),
        );
        return Ok(client.clone());
      }
      codex_log("state", "cached app-server is no longer running; resolving a replacement");
    }

    let resolution = diagnose_codex_runtime().await;
    let runtime = resolution.runtime.ok_or_else(|| resolution_error(&resolution))?;
    let client = Arc::new(CodexClient::spawn(app.clone(), runtime).await?);
    *slot = Some(client.clone());
    Ok(client)
  }

  async fn stop(&self) -> R<()> {
    let client = self.client.lock().await.take();
    if let Some(client) = client {
      let mut child = client.child.lock().await;
      codex_log("process", format!("stop requested pid={:?}", child.id()));
      child.kill().await.map_err(|error| error.to_string())?;
      codex_log("process", "stop complete");
    } else {
      codex_log("process", "stop requested with no active app-server");
    }
    Ok(())
  }
}

impl Default for CodexAppServerState {
  fn default() -> Self {
    Self::new()
  }
}

impl CodexClient {
  async fn spawn(app: AppHandle, runtime: CodexRuntime) -> R<Self> {
    codex_log(
      "process",
      format!(
        "spawn:start executable={} source={} version={} args=app-server --listen stdio://",
        path_text(&runtime.path),
        runtime.source,
        runtime.version
      ),
    );
    let started = Instant::now();
    let mut child = Command::new(&runtime.path)
      .args(["app-server", "--listen", "stdio://"])
      .stdin(Stdio::piped())
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .kill_on_drop(true)
      .spawn()
      .map_err(|error| {
        let message = format!("Unable to start codex app-server from {}: {error}", path_text(&runtime.path));
        codex_log("process", format!("spawn:error {message}"));
        message
      })?;
    codex_log(
      "process",
      format!("spawn:complete pid={:?} duration_ms={}", child.id(), started.elapsed().as_millis()),
    );

    let stdin = child.stdin.take().ok_or_else(|| "Codex app-server stdin is unavailable.".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Codex app-server stdout is unavailable.".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Codex app-server stderr is unavailable.".to_string())?;
    let child = Arc::new(Mutex::new(child));
    let stdin = Arc::new(Mutex::new(stdin));
    let pending = Arc::new(Mutex::new(HashMap::<u64, oneshot::Sender<R<Value>>>::new()));
    let (events, _) = broadcast::channel(256);

    {
      let pending = pending.clone();
      let events = events.clone();
      let app = app.clone();
      tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        loop {
          match lines.next_line().await {
            Ok(Some(line)) => {
              let message = match serde_json::from_str::<Value>(&line) {
                Ok(message) => message,
                Err(error) => {
                  codex_log("stdout", format!("invalid-json error={error} line={}", truncate_log(&line)));
                  continue;
                }
              };

              if message.get("method").is_some() {
                codex_log("event", event_summary(&message));
                let _ = events.send(message.clone());
                let _ = app.emit("elephantnote:codex:event", &message);
                continue;
              }

              let Some(id) = message.get("id").and_then(Value::as_u64) else {
                codex_log("stdout", format!("response-without-id payload={}", truncate_log(message.to_string())));
                continue;
              };
              let sender = pending.lock().await.remove(&id);
              if let Some(sender) = sender {
                let result = if let Some(error) = message.get("error") {
                  let detail = error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Codex app-server request failed.")
                    .to_string();
                  codex_log("response", format!("id={id} status=error message={}", truncate_log(&detail)));
                  Err(detail)
                } else {
                  codex_log("response", format!("id={id} status=ok"));
                  Ok(message.get("result").cloned().unwrap_or(Value::Null))
                };
                let _ = sender.send(result);
              } else {
                codex_log("response", format!("id={id} has no pending receiver"));
              }
            }
            Ok(None) => {
              codex_log("stdout", "app-server stdout reached EOF");
              break;
            }
            Err(error) => {
              codex_log("stdout", format!("read-error {error}"));
              break;
            }
          }
        }

        let mut pending = pending.lock().await;
        codex_log("state", format!("failing pending requests count={}", pending.len()));
        for (_, sender) in pending.drain() {
          let _ = sender.send(Err("Codex app-server stopped before responding.".to_string()));
        }
      });
    }

    tokio::spawn(async move {
      let mut lines = BufReader::new(stderr).lines();
      loop {
        match lines.next_line().await {
          Ok(Some(line)) => codex_log("stderr", truncate_log(line)),
          Ok(None) => {
            codex_log("stderr", "app-server stderr reached EOF");
            break;
          }
          Err(error) => {
            codex_log("stderr", format!("read-error {error}"));
            break;
          }
        }
      }
    });

    let client = Self { runtime, child, stdin, pending, events, next_id: AtomicU64::new(1) };
    codex_log("protocol", "initialize:start");
    client
      .request(
        "initialize",
        json!({
          "clientInfo": {
            "name": "elephantnote",
            "title": "ElephantNote",
            "version": env!("CARGO_PKG_VERSION")
          }
        }),
      )
      .await?;
    client.notify("initialized", json!({})).await?;
    codex_log("protocol", "initialize:complete");
    Ok(client)
  }

  async fn is_running(&self) -> bool {
    let mut child = self.child.lock().await;
    match child.try_wait() {
      Ok(None) => true,
      Ok(Some(status)) => {
        codex_log("process", format!("exited status={status}"));
        false
      }
      Err(error) => {
        codex_log("process", format!("try-wait-error {error}"));
        false
      }
    }
  }

  async fn write(&self, message: &Value) -> R<()> {
    let line = serde_json::to_string(message).map_err(|error| error.to_string())?;
    let mut stdin = self.stdin.lock().await;
    stdin.write_all(line.as_bytes()).await.map_err(|error| error.to_string())?;
    stdin.write_all(b"\n").await.map_err(|error| error.to_string())?;
    stdin.flush().await.map_err(|error| error.to_string())
  }

  async fn request(&self, method: &str, params: Value) -> R<Value> {
    let id = self.next_id.fetch_add(1, Ordering::Relaxed);
    let started = Instant::now();
    codex_log("request", format!("id={id} method={method} {}", params_summary(method, &params)));
    let (sender, receiver) = oneshot::channel();
    self.pending.lock().await.insert(id, sender);
    if let Err(error) = self.write(&json!({ "method": method, "id": id, "params": params })).await {
      self.pending.lock().await.remove(&id);
      codex_log("request", format!("id={id} method={method} write-error={error}"));
      return Err(error);
    }
    let result = timeout(REQUEST_TIMEOUT, receiver)
      .await
      .map_err(|_| format!("Codex app-server request timed out: {method}"))?
      .map_err(|_| format!("Codex app-server response channel closed: {method}"))?;
    codex_log(
      "request",
      format!(
        "id={id} method={method} complete={} duration_ms={}",
        if result.is_ok() { "ok" } else { "error" },
        started.elapsed().as_millis()
      ),
    );
    result
  }

  async fn notify(&self, method: &str, params: Value) -> R<()> {
    codex_log("notify", format!("method={method} {}", params_summary(method, &params)));
    self.write(&json!({ "method": method, "params": params })).await
  }

  fn subscribe(&self) -> broadcast::Receiver<Value> {
    self.events.subscribe()
  }
}

fn account_summary(result: Value, client: &CodexClient) -> Value {
  let account = result.get("account").cloned().unwrap_or(Value::Null);
  let connected = !account.is_null();
  let plan = account.get("planType").and_then(Value::as_str).unwrap_or("<unknown>");
  codex_log("account", format!("read connected={connected} plan={plan}"));
  json!({
    "installed": true,
    "detected": true,
    "running": true,
    "connected": connected,
    "account": account,
    "requiresOpenaiAuth": result.get("requiresOpenaiAuth").cloned().unwrap_or(Value::Bool(true)),
    "version": client.runtime.version,
    "runtimePath": path_text(&client.runtime.path),
    "runtimeSource": client.runtime.source
  })
}

async fn status(app: &AppHandle) -> R<Value> {
  codex_log("operation", "status:start");
  let client = match state().client(app).await {
    Ok(client) => client,
    Err(error) => {
      codex_log("operation", format!("status:client-error {}", truncate_log(&error)));
      let resolution = diagnose_codex_runtime().await;
      let installed = resolution.runtime.is_some();
      return Ok(json!({
        "installed": installed,
        "detected": resolution.detected,
        "running": false,
        "connected": false,
        "error": error,
        "diagnostics": probes_json(&resolution.probes),
        "runtimePath": resolution.runtime.as_ref().map(|runtime| path_text(&runtime.path)),
        "runtimeSource": resolution.runtime.as_ref().map(|runtime| runtime.source.clone()),
        "version": resolution.runtime.as_ref().map(|runtime| runtime.version.clone())
      }));
    }
  };
  let account = client.request("account/read", json!({ "refreshToken": false })).await?;
  codex_log("operation", "status:complete");
  Ok(account_summary(account, &client))
}

async fn login(app: &AppHandle, flow: Option<String>) -> R<Value> {
  codex_log("operation", format!("login:start flow={}", flow.as_deref().unwrap_or("browser")));
  let client = state().client(app).await?;
  let params = if flow.as_deref() == Some("device-code") {
    json!({ "type": "chatgptDeviceCode" })
  } else {
    json!({ "type": "chatgpt", "useHostedLoginSuccessPage": true, "appBrand": "chatgpt" })
  };
  let result = client.request("account/login/start", params).await;
  codex_log("operation", format!("login:complete status={}", if result.is_ok() { "ok" } else { "error" }));
  result
}

async fn logout(app: &AppHandle) -> R<Value> {
  codex_log("operation", "logout:start");
  let client = state().client(app).await?;
  let result = client.request("account/logout", json!({})).await?;
  codex_log("operation", "logout:complete");
  Ok(json!({ "ok": true, "result": result }))
}

async fn models(app: &AppHandle) -> R<Value> {
  codex_log("operation", "models:start");
  let client = state().client(app).await?;
  let result = client.request("model/list", json!({ "limit": 100, "includeHidden": false })).await?;
  let count = result.get("data").and_then(Value::as_array).map_or(0, Vec::len);
  codex_log("operation", format!("models:complete count={count}"));
  Ok(result)
}

async fn rate_limits(app: &AppHandle) -> R<Value> {
  codex_log("operation", "rate-limits:start");
  let client = state().client(app).await?;
  let result = client.request("account/rateLimits/read", json!({})).await;
  codex_log("operation", format!("rate-limits:complete status={}", if result.is_ok() { "ok" } else { "error" }));
  result
}

async fn stop() -> R<Value> {
  codex_log("operation", "stop:start");
  state().stop().await?;
  codex_log("operation", "stop:complete");
  Ok(json!({ "ok": true }))
}

pub async fn command(app: &AppHandle, payload: &Value) -> R<Value> {
  let operation = payload.get("codexOperation").and_then(Value::as_str).unwrap_or("");
  codex_log("command", format!("received operation={operation}"));
  match operation {
    "status" => status(app).await,
    "login" => login(app, payload.get("flow").and_then(Value::as_str).map(str::to_string)).await,
    "logout" => logout(app).await,
    "models" => models(app).await,
    "rateLimits" => rate_limits(app).await,
    "stop" => stop().await,
    operation => Err(format!("Unsupported Codex operation: {operation}")),
  }
}

fn event_thread_id(event: &Value) -> &str {
  event
    .pointer("/params/threadId")
    .and_then(Value::as_str)
    .or_else(|| event.pointer("/params/thread/id").and_then(Value::as_str))
    .unwrap_or("")
}

fn event_turn_id(event: &Value) -> &str {
  event
    .pointer("/params/turnId")
    .and_then(Value::as_str)
    .or_else(|| event.pointer("/params/turn/id").and_then(Value::as_str))
    .unwrap_or("")
}

fn delta_text(event: &Value) -> &str {
  event
    .pointer("/params/delta")
    .and_then(Value::as_str)
    .or_else(|| event.pointer("/params/textDelta").and_then(Value::as_str))
    .unwrap_or("")
}

fn completed_agent_text(event: &Value) -> &str {
  event
    .pointer("/params/item")
    .filter(|item| item.get("type").and_then(Value::as_str) == Some("agentMessage"))
    .and_then(|item| item.get("text"))
    .and_then(Value::as_str)
    .unwrap_or("")
}

fn turn_failure(event: &Value) -> Option<String> {
  let status = event.pointer("/params/turn/status").and_then(Value::as_str).unwrap_or("");
  if status == "completed" {
    return None;
  }
  event
    .pointer("/params/turn/error/message")
    .and_then(Value::as_str)
    .map(str::to_string)
    .or_else(|| Some(format!("Codex turn ended with status: {status}")))
}

pub async fn chat(app: &AppHandle, model: &str, prompt: &str) -> R<CodexChatResult> {
  let chat_started = Instant::now();
  codex_log(
    "chat",
    format!("start model={} prompt_chars={}", model, prompt.chars().count()),
  );
  if model.trim().is_empty() {
    return Err("No Codex model is selected.".to_string());
  }
  if prompt.trim().is_empty() {
    return Err("Cannot send an empty prompt to Codex.".to_string());
  }

  let client = state().client(app).await?;
  let account = client.request("account/read", json!({ "refreshToken": false })).await?;
  if account.get("account").is_none_or(Value::is_null) {
    codex_log("chat", "rejected because account is not authenticated");
    return Err("Codex is not authenticated. Connect your ChatGPT account in AI settings.".to_string());
  }

  let cwd = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("codex-chat-sandbox");
  tokio::fs::create_dir_all(&cwd).await.map_err(|error| error.to_string())?;
  codex_log("chat", format!("sandbox cwd={}", path_text(&cwd)));
  let thread = client
    .request(
      "thread/start",
      json!({
        "model": model,
        "cwd": cwd.to_string_lossy(),
        "approvalPolicy": "never",
        "sandbox": "readOnly",
        "serviceName": "elephantnote"
      }),
    )
    .await?;
  let thread_id = thread
    .pointer("/thread/id")
    .and_then(Value::as_str)
    .ok_or_else(|| "Codex thread/start returned no thread id.".to_string())?
    .to_string();
  codex_log("chat", format!("thread-started id={thread_id}"));

  let mut events = client.subscribe();
  let turn = client
    .request(
      "turn/start",
      json!({
        "threadId": thread_id,
        "input": [{ "type": "text", "text": prompt }],
        "model": model,
        "cwd": cwd.to_string_lossy(),
        "approvalPolicy": "never",
        "sandboxPolicy": {
          "type": "readOnly",
          "access": {
            "type": "restricted",
            "includePlatformDefaults": true,
            "readableRoots": [cwd.to_string_lossy()]
          }
        }
      }),
    )
    .await?;
  let turn_id = turn
    .pointer("/turn/id")
    .and_then(Value::as_str)
    .ok_or_else(|| "Codex turn/start returned no turn id.".to_string())?
    .to_string();
  codex_log("chat", format!("turn-started id={turn_id} thread={thread_id}"));

  let mut answer = String::new();
  loop {
    let event = timeout(TURN_TIMEOUT, events.recv())
      .await
      .map_err(|_| "Codex generation timed out.".to_string())?
      .map_err(|error| format!("Codex event stream closed: {error}"))?;
    if !event_thread_id(&event).is_empty() && event_thread_id(&event) != thread_id {
      continue;
    }
    if !event_turn_id(&event).is_empty() && event_turn_id(&event) != turn_id {
      continue;
    }

    match event.get("method").and_then(Value::as_str).unwrap_or("") {
      "item/agentMessage/delta" => answer.push_str(delta_text(&event)),
      "item/completed" => {
        let text = completed_agent_text(&event);
        if !text.is_empty() {
          answer = text.to_string();
        }
      }
      "turn/completed" => {
        if let Some(error) = turn_failure(&event) {
          codex_log("chat", format!("turn-failed id={turn_id} error={}", truncate_log(&error)));
          return Err(error);
        }
        break;
      }
      "error" => {
        let message = event
          .pointer("/params/error/message")
          .and_then(Value::as_str)
          .unwrap_or("Codex generation failed.");
        codex_log("chat", format!("event-error id={turn_id} message={}", truncate_log(message)));
        return Err(message.to_string());
      }
      _ => {}
    }
  }

  if answer.trim().is_empty() {
    codex_log("chat", format!("empty-answer thread={thread_id} turn={turn_id}"));
    return Err("Codex completed the turn without an assistant message.".to_string());
  }
  codex_log(
    "chat",
    format!(
      "complete thread={} turn={} answer_chars={} duration_ms={}",
      thread_id,
      turn_id,
      answer.chars().count(),
      chat_started.elapsed().as_millis()
    ),
  );
  Ok(CodexChatResult { answer, model: model.to_string(), thread_id })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_delta_text_from_current_protocol_shape() {
    let event = json!({ "method": "item/agentMessage/delta", "params": { "delta": "hello" } });
    assert_eq!(delta_text(&event), "hello");
  }

  #[test]
  fn reads_completed_agent_message_as_authoritative_text() {
    let event = json!({ "method": "item/completed", "params": { "item": { "type": "agentMessage", "text": "final" } } });
    assert_eq!(completed_agent_text(&event), "final");
  }

  #[test]
  fn completed_turn_has_no_failure() {
    let event = json!({ "method": "turn/completed", "params": { "turn": { "status": "completed" } } });
    assert!(turn_failure(&event).is_none());
  }

  #[test]
  fn failed_turn_returns_server_message() {
    let event = json!({ "method": "turn/completed", "params": { "turn": { "status": "failed", "error": { "message": "quota" } } } });
    assert_eq!(turn_failure(&event).as_deref(), Some("quota"));
  }

  #[test]
  fn finds_codex_package_root_from_npm_launcher() {
    let entry = Path::new("/Users/test/.nvm/versions/node/v22/lib/node_modules/@openai/codex/bin/codex.js");
    assert!(package_roots_from_entry(entry)
      .iter()
      .any(|root| root.ends_with("lib/node_modules/@openai/codex")));
  }

  #[test]
  fn resolution_error_distinguishes_broken_installation() {
    let resolution = CodexResolution {
      runtime: None,
      probes: vec![CodexProbe {
        path: PathBuf::from("/tmp/codex"),
        source: "test".to_string(),
        exists: true,
        executable: true,
        version: None,
        error: Some("ENOENT native binary".to_string()),
      }],
      detected: true,
    };
    assert!(resolution_error(&resolution).contains("detected"));
    assert!(resolution_error(&resolution).contains("ENOENT"));
  }

  #[test]
  fn turn_summary_does_not_log_prompt_contents() {
    let params = json!({
      "threadId": "thread-1",
      "model": "gpt-test",
      "input": [{ "type": "text", "text": "secret prompt" }]
    });
    let summary = params_summary("turn/start", &params);
    assert!(summary.contains("input_chars=13"));
    assert!(!summary.contains("secret prompt"));
  }
}

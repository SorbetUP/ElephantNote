mod codex_runtime_installer;
use serde_json::{json, Value};
use std::{
  collections::{HashMap, HashSet},
  env,
  fs,
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
const MAX_BUNDLE_SCAN_ENTRIES: usize = 20_000;

type R<T> = Result<T, String>;

#[derive(Debug)]
pub struct CodexChatResult {
  pub answer: String,
  pub model: String,
  pub thread_id: String,
}

#[derive(Clone, Debug)]
struct Candidate {
  path: PathBuf,
  source: String,
}

#[derive(Clone, Debug)]
struct Runtime {
  path: PathBuf,
  source: String,
  version: String,
}

#[derive(Clone, Debug)]
struct Probe {
  path: PathBuf,
  source: String,
  exists: bool,
  executable: bool,
  version: Option<String>,
  app_server: bool,
  error: Option<String>,
}

#[derive(Debug)]
struct Resolution {
  runtime: Option<Runtime>,
  probes: Vec<Probe>,
  detected: bool,
  install_error: Option<String>,
}

struct CodexClient {
  runtime: Runtime,
  child: Arc<Mutex<Child>>,
  stdin: Arc<Mutex<ChildStdin>>,
  pending: Arc<Mutex<HashMap<u64, oneshot::Sender<R<Value>>>>>,
  events: broadcast::Sender<Value>,
  next_id: AtomicU64,
}

struct CodexState {
  client: Mutex<Option<Arc<CodexClient>>>,
}

static STATE: OnceLock<CodexState> = OnceLock::new();

fn state() -> &'static CodexState {
  STATE.get_or_init(|| CodexState { client: Mutex::new(None) })
}

fn log(stage: &str, message: impl AsRef<str>) {
  eprintln!("[Codex][{stage}] {}", message.as_ref());
}

fn short(value: impl AsRef<str>) -> String {
  let value = value.as_ref().trim();
  if value.chars().count() <= MAX_LOG_TEXT {
    value.to_string()
  } else {
    format!("{}…", value.chars().take(MAX_LOG_TEXT).collect::<String>())
  }
}

fn path_string(path: &Path) -> String {
  path.to_string_lossy().to_string()
}

fn home_dir() -> Option<PathBuf> {
  env::var_os("HOME")
    .map(PathBuf::from)
    .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
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

fn binary_name() -> &'static str {
  if cfg!(windows) { "codex.exe" } else { "codex" }
}

fn executable(path: &Path) -> bool {
  let Ok(metadata) = fs::metadata(path) else {
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
  candidates: &mut Vec<Candidate>,
  seen: &mut HashSet<PathBuf>,
  path: PathBuf,
  source: impl Into<String>,
) {
  if path.as_os_str().is_empty() {
    return;
  }
  let identity = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
  if seen.insert(identity) {
    candidates.push(Candidate { path, source: source.into() });
  }
}

fn package_roots(entry: &Path) -> Vec<PathBuf> {
  let mut roots = Vec::new();
  let mut variants = vec![entry.to_path_buf()];
  if let Ok(canonical) = fs::canonicalize(entry) {
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
      let parent_is_openai = ancestor
        .parent()
        .and_then(Path::file_name)
        .and_then(|value| value.to_str())
        == Some("@openai");
      if is_codex && parent_is_openai {
        roots.push(ancestor.to_path_buf());
      }
    }
  }
  roots.sort();
  roots.dedup();
  roots
}

fn add_native_candidates(
  candidates: &mut Vec<Candidate>,
  seen: &mut HashSet<PathBuf>,
  entry: &Path,
  source: &str,
) {
  let (Some(triple), Some(package)) = (target_triple(), platform_package()) else {
    return;
  };
  let binary = binary_name();
  for root in package_roots(entry) {
    for (suffix, label) in [
      (PathBuf::from(triple).join("bin").join(binary), "bundled-current"),
      (PathBuf::from(triple).join("codex").join(binary), "bundled-legacy"),
      (PathBuf::from(triple).join(binary), "bundled-flat"),
    ] {
      push_candidate(
        candidates,
        seen,
        root.join("vendor").join(suffix),
        format!("{source}:{label}"),
      );
    }
    let mut package_roots = vec![root.join("node_modules").join("@openai").join(package)];
    if let Some(node_modules) = root.parent().and_then(Path::parent) {
      package_roots.push(node_modules.join("@openai").join(package));
    }
    for package_root in package_roots {
      push_candidate(
        candidates,
        seen,
        package_root.join("vendor").join(triple).join("bin").join(binary),
        format!("{source}:optional-package"),
      );
      push_candidate(
        candidates,
        seen,
        package_root.join("vendor").join(triple).join("codex").join(binary),
        format!("{source}:optional-package-legacy"),
      );
    }
  }
}

fn add_nvm_entrypoints(entrypoints: &mut Vec<Candidate>, seen: &mut HashSet<PathBuf>) {
  let Some(home) = home_dir() else {
    return;
  };
  let versions = home.join(".nvm").join("versions").join("node");
  let Ok(read_dir) = fs::read_dir(versions) else {
    return;
  };
  let mut paths = read_dir
    .filter_map(Result::ok)
    .map(|entry| entry.path().join("bin").join(binary_name()))
    .collect::<Vec<_>>();
  paths.sort();
  paths.reverse();
  for path in paths {
    push_candidate(entrypoints, seen, path, "nvm-global-bin");
  }
}

fn bundle_candidate_name(path: &Path) -> bool {
  let name = path.file_name().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
  if matches!(name.as_str(), "codex" | "codex-cli" | "codex-app-server") {
    return true;
  }
  let text = path.to_string_lossy().to_ascii_lowercase();
  name.starts_with("codex-") && text.contains("/vendor/")
}

fn scan_bundle_dir(
  root: &Path,
  depth: usize,
  remaining: &mut usize,
  candidates: &mut Vec<Candidate>,
  seen: &mut HashSet<PathBuf>,
) {
  if depth == 0 || *remaining == 0 {
    return;
  }
  let Ok(read_dir) = fs::read_dir(root) else {
    return;
  };
  for entry in read_dir.filter_map(Result::ok) {
    if *remaining == 0 {
      return;
    }
    *remaining -= 1;
    let path = entry.path();
    let Ok(file_type) = entry.file_type() else {
      continue;
    };
    if file_type.is_dir() {
      scan_bundle_dir(&path, depth - 1, remaining, candidates, seen);
    } else if file_type.is_file() && bundle_candidate_name(&path) {
      push_candidate(candidates, seen, path, "codex-app-bundle-resource");
    }
  }
}

fn add_codex_app_resources(candidates: &mut Vec<Candidate>, seen: &mut HashSet<PathBuf>) {
  #[cfg(target_os = "macos")]
  {
    let roots = [
      PathBuf::from("/Applications/Codex.app/Contents/Resources"),
      home_dir()
        .unwrap_or_default()
        .join("Applications")
        .join("Codex.app")
        .join("Contents")
        .join("Resources"),
    ];
    for root in roots {
      if root.is_dir() {
        log("resolver", format!("bundle-scan:start root={}", path_string(&root)));
        let mut remaining = MAX_BUNDLE_SCAN_ENTRIES;
        scan_bundle_dir(&root, 12, &mut remaining, candidates, seen);
        log(
          "resolver",
          format!("bundle-scan:complete root={} entries_scanned={}", path_string(&root), MAX_BUNDLE_SCAN_ENTRIES - remaining),
        );
      }
    }
  }
}

async fn shell_entrypoint() -> Option<PathBuf> {
  #[cfg(unix)]
  {
    let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    log("resolver", format!("login-shell:start shell={shell}"));
    let result = timeout(
      SHELL_TIMEOUT,
      Command::new(&shell)
        .args(["-lic", "whence -p codex 2>/dev/null || command -v codex 2>/dev/null"])
        .stdin(Stdio::null())
        .output(),
    )
    .await;
    let output = match result {
      Err(_) => {
        log("resolver", "login-shell:timeout");
        return None;
      }
      Ok(Err(error)) => {
        log("resolver", format!("login-shell:spawn-error {error}"));
        return None;
      }
      Ok(Ok(output)) => output,
    };
    if !output.status.success() {
      log(
        "resolver",
        format!(
          "login-shell:failed status={} stderr={}",
          output.status,
          short(String::from_utf8_lossy(&output.stderr))
        ),
      );
      return None;
    }
    let path = String::from_utf8_lossy(&output.stdout)
      .lines()
      .next()
      .map(str::trim)
      .filter(|value| value.starts_with('/'))
      .map(PathBuf::from);
    if let Some(path) = path.as_ref() {
      log("resolver", format!("login-shell:path={}", path_string(path)));
    }
    path
  }
  #[cfg(not(unix))]
  {
    None
  }
}

async fn candidates(app: &AppHandle) -> Vec<Candidate> {
  let mut entrypoints = Vec::new();
  let mut entry_seen = HashSet::new();

  if let Some(runtime) = codex_runtime_installer::existing(app) {
    push_candidate(&mut entrypoints, &mut entry_seen, runtime.path, "elephantnote-managed");
  }
  for key in ["ELEPHANTNOTE_CODEX_PATH", "CODEX_PATH"] {
    if let Some(value) = env::var_os(key) {
      push_candidate(&mut entrypoints, &mut entry_seen, PathBuf::from(value), format!("env:{key}"));
    }
  }
  match which::which("codex") {
    Ok(path) => push_candidate(&mut entrypoints, &mut entry_seen, path, "process-path"),
    Err(error) => log("resolver", format!("process-path:not-found {error}")),
  }
  if let Some(path) = shell_entrypoint().await {
    push_candidate(&mut entrypoints, &mut entry_seen, path, "login-shell");
  }
  #[cfg(target_os = "macos")]
  for path in ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"] {
    push_candidate(&mut entrypoints, &mut entry_seen, PathBuf::from(path), "macos-common-path");
  }
  add_nvm_entrypoints(&mut entrypoints, &mut entry_seen);

  let mut result = Vec::new();
  let mut seen = HashSet::new();
  for entry in entrypoints {
    add_native_candidates(&mut result, &mut seen, &entry.path, &entry.source);
    push_candidate(&mut result, &mut seen, entry.path, entry.source);
  }
  add_codex_app_resources(&mut result, &mut seen);
  result
}

async fn run_probe(path: &Path, args: &[&str]) -> Result<std::process::Output, String> {
  match timeout(PROBE_TIMEOUT, Command::new(path).args(args).stdin(Stdio::null()).output()).await {
    Err(_) => Err(format!("probe timed out for args={args:?}")),
    Ok(Err(error)) => Err(format!("spawn failed for args={args:?}: {error}")),
    Ok(Ok(output)) => Ok(output),
  }
}

fn app_server_help_valid(output: &std::process::Output) -> bool {
  if !output.status.success() {
    return false;
  }
  let combined = format!(
    "{}\n{}",
    String::from_utf8_lossy(&output.stdout),
    String::from_utf8_lossy(&output.stderr)
  )
  .to_ascii_lowercase();
  combined.contains("app-server") && (combined.contains("--listen") || combined.contains("stdio://") || combined.contains("stdio"))
}

async fn probe(candidate: Candidate) -> Probe {
  let exists = candidate.path.is_file();
  let is_executable = executable(&candidate.path);
  log(
    "resolver",
    format!(
      "candidate source={} path={} exists={} executable={}",
      candidate.source,
      path_string(&candidate.path),
      exists,
      is_executable
    ),
  );
  if !exists || !is_executable {
    return Probe {
      path: candidate.path,
      source: candidate.source,
      exists,
      executable: is_executable,
      version: None,
      app_server: false,
      error: Some(if exists { "file is not executable" } else { "file does not exist" }.to_string()),
    };
  }

  let started = Instant::now();
  let version_output = match run_probe(&candidate.path, &["--version"]).await {
    Ok(output) if output.status.success() => output,
    Ok(output) => {
      let error = format!(
        "--version exit={} stdout={} stderr={}",
        output.status,
        short(String::from_utf8_lossy(&output.stdout)),
        short(String::from_utf8_lossy(&output.stderr))
      );
      log("resolver", format!("rejected source={} path={} error={error}", candidate.source, path_string(&candidate.path)));
      return Probe {
        path: candidate.path,
        source: candidate.source,
        exists,
        executable: is_executable,
        version: None,
        app_server: false,
        error: Some(error),
      };
    }
    Err(error) => {
      log("resolver", format!("rejected source={} path={} error={error}", candidate.source, path_string(&candidate.path)));
      return Probe {
        path: candidate.path,
        source: candidate.source,
        exists,
        executable: is_executable,
        version: None,
        app_server: false,
        error: Some(error),
      };
    }
  };
  let stdout = short(String::from_utf8_lossy(&version_output.stdout));
  let stderr = short(String::from_utf8_lossy(&version_output.stderr));
  let version = if stdout.is_empty() { stderr } else { stdout };

  let help_output = match run_probe(&candidate.path, &["app-server", "--help"]).await {
    Ok(output) => output,
    Err(error) => {
      log(
        "resolver",
        format!("rejected source={} path={} reason=app-server-capability error={error}", candidate.source, path_string(&candidate.path)),
      );
      return Probe {
        path: candidate.path,
        source: candidate.source,
        exists,
        executable: is_executable,
        version: Some(version),
        app_server: false,
        error: Some(error),
      };
    }
  };
  if !app_server_help_valid(&help_output) {
    let error = format!(
      "not a Codex CLI app-server runtime; help_exit={} stdout={} stderr={}",
      help_output.status,
      short(String::from_utf8_lossy(&help_output.stdout)),
      short(String::from_utf8_lossy(&help_output.stderr))
    );
    log(
      "resolver",
      format!(
        "rejected source={} path={} reason=app-server-capability error={}",
        candidate.source,
        path_string(&candidate.path),
        error
      ),
    );
    return Probe {
      path: candidate.path,
      source: candidate.source,
      exists,
      executable: is_executable,
      version: Some(version),
      app_server: false,
      error: Some(error),
    };
  }

  log(
    "resolver",
    format!(
      "accepted source={} path={} version={} app_server=true duration_ms={}",
      candidate.source,
      path_string(&candidate.path),
      version,
      started.elapsed().as_millis()
    ),
  );
  Probe {
    path: candidate.path,
    source: candidate.source,
    exists,
    executable: is_executable,
    version: Some(version),
    app_server: true,
    error: None,
  }
}

async fn resolve_without_install(app: &AppHandle) -> Resolution {
  log(
    "resolver",
    format!(
      "start os={} arch={} target={} cwd={} PATH={}",
      env::consts::OS,
      env::consts::ARCH,
      target_triple().unwrap_or("unsupported"),
      env::current_dir().map(|path| path_string(&path)).unwrap_or_else(|_| "<unknown>".to_string()),
      env::var("PATH").unwrap_or_else(|_| "<unset>".to_string())
    ),
  );
  let candidates = candidates(app).await;
  log("resolver", format!("candidate-count={}", candidates.len()));
  let mut probes = Vec::new();
  let mut detected = false;
  for candidate in candidates {
    let probe = probe(candidate).await;
    detected |= probe.exists;
    if probe.app_server {
      let runtime = Runtime {
        path: probe.path.clone(),
        source: probe.source.clone(),
        version: probe.version.clone().unwrap_or_default(),
      };
      probes.push(probe);
      log(
        "resolver",
        format!("selected source={} path={}", runtime.source, path_string(&runtime.path)),
      );
      return Resolution { runtime: Some(runtime), probes, detected: true, install_error: None };
    }
    probes.push(probe);
  }
  Resolution { runtime: None, probes, detected, install_error: None }
}

async fn resolve(app: &AppHandle) -> Resolution {
  let mut resolution = resolve_without_install(app).await;
  if resolution.runtime.is_some() {
    return resolution;
  }

  log("installer", "no valid app-server runtime found; installing official managed Codex CLI");
  let app_clone = app.clone();
  let install_result = tokio::task::spawn_blocking(move || codex_runtime_installer::ensure_installed(app_clone)).await;
  match install_result {
    Ok(Ok(runtime)) => {
      log(
        "installer",
        format!(
          "installed path={} version={} release={} asset={}",
          path_string(&runtime.path),
          runtime.version,
          runtime.release,
          runtime.asset
        ),
      );
      let managed_probe = probe(Candidate { path: runtime.path, source: "elephantnote-managed-download".to_string() }).await;
      if managed_probe.app_server {
        let selected = Runtime {
          path: managed_probe.path.clone(),
          source: managed_probe.source.clone(),
          version: managed_probe.version.clone().unwrap_or(runtime.version),
        };
        resolution.probes.push(managed_probe);
        resolution.runtime = Some(selected);
        resolution.detected = true;
      } else {
        resolution.install_error = managed_probe.error.clone().or_else(|| Some("Downloaded Codex binary does not expose app-server.".to_string()));
        resolution.probes.push(managed_probe);
      }
    }
    Ok(Err(error)) => {
      log("installer", format!("failed error={}", short(&error)));
      resolution.install_error = Some(error);
    }
    Err(error) => {
      let error = format!("Managed Codex installer task failed: {error}");
      log("installer", &error);
      resolution.install_error = Some(error);
    }
  }
  resolution
}

fn resolution_error(resolution: &Resolution) -> String {
  let headline = if resolution.detected {
    "Codex was detected, but no discovered executable provides the Codex app-server protocol."
  } else {
    "No Codex app-server runtime was found."
  };
  let details = resolution
    .probes
    .iter()
    .filter(|probe| probe.exists)
    .take(12)
    .map(|probe| {
      format!(
        "- {} [{}]: {}",
        path_string(&probe.path),
        probe.source,
        probe.error.as_deref().unwrap_or("app-server capability unavailable")
      )
    })
    .collect::<Vec<_>>()
    .join("\n");
  let install = resolution
    .install_error
    .as_ref()
    .map(|error| format!("\nManaged runtime installation failed: {error}"))
    .unwrap_or_default();
  if details.is_empty() {
    format!("{headline}{install}")
  } else {
    format!("{headline}\n{details}{install}")
  }
}

fn probes_json(probes: &[Probe]) -> Vec<Value> {
  probes
    .iter()
    .map(|probe| {
      json!({
        "path": path_string(&probe.path),
        "source": probe.source.clone(),
        "exists": probe.exists,
        "executable": probe.executable,
        "version": probe.version.clone(),
        "appServer": probe.app_server,
        "error": probe.error.clone()
      })
    })
    .collect()
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

fn event_summary(event: &Value) -> String {
  format!(
    "method={} thread={} turn={} item_type={} delta_chars={}",
    event.get("method").and_then(Value::as_str).unwrap_or("<none>"),
    event_thread_id(event),
    event_turn_id(event),
    event.pointer("/params/item/type").and_then(Value::as_str).unwrap_or(""),
    delta_text(event).chars().count()
  )
}

fn params_summary(method: &str, params: &Value) -> String {
  match method {
    "turn/start" => {
      let input_chars = params
        .get("input")
        .and_then(Value::as_array)
        .map(|items| {
          items
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .map(|text| text.chars().count())
            .sum::<usize>()
        })
        .unwrap_or(0);
      format!(
        "thread={} model={} input_chars={}",
        params.get("threadId").and_then(Value::as_str).unwrap_or("<none>"),
        params.get("model").and_then(Value::as_str).unwrap_or("<default>"),
        input_chars
      )
    }
    "thread/start" => format!(
      "model={} cwd={} approval={}",
      params.get("model").and_then(Value::as_str).unwrap_or("<default>"),
      params.get("cwd").and_then(Value::as_str).unwrap_or("<none>"),
      params.get("approvalPolicy").and_then(Value::as_str).unwrap_or("<none>")
    ),
    "account/login/start" => {
      format!("type={}", params.get("type").and_then(Value::as_str).unwrap_or("<none>"))
    }
    _ => format!(
      "keys={}",
      params
        .as_object()
        .map(|object| object.keys().cloned().collect::<Vec<_>>().join(","))
        .unwrap_or_else(|| "<non-object>".to_string())
    ),
  }
}

impl CodexState {
  async fn client(&self, app: &AppHandle) -> R<Arc<CodexClient>> {
    let mut slot = self.client.lock().await;
    if let Some(client) = slot.as_ref() {
      if client.is_running().await {
        log(
          "state",
          format!("reuse source={} path={}", client.runtime.source, path_string(&client.runtime.path)),
        );
        return Ok(client.clone());
      }
      log("state", "cached app-server exited; resolving again");
    }
    let resolution = resolve(app).await;
    let runtime = match resolution.runtime.clone() {
      Some(runtime) => runtime,
      None => return Err(resolution_error(&resolution)),
    };
    let client = Arc::new(CodexClient::spawn(app.clone(), runtime).await?);
    *slot = Some(client.clone());
    Ok(client)
  }

  async fn stop(&self) -> R<()> {
    if let Some(client) = self.client.lock().await.take() {
      let mut child = client.child.lock().await;
      log("process", format!("stop:start pid={:?}", child.id()));
      child.kill().await.map_err(|error| error.to_string())?;
      log("process", "stop:complete");
    } else {
      log("process", "stop:no-active-process");
    }
    Ok(())
  }
}

impl CodexClient {
  async fn spawn(app: AppHandle, runtime: Runtime) -> R<Self> {
    log(
      "process",
      format!(
        "spawn:start source={} path={} version={} args=app-server --listen stdio://",
        runtime.source,
        path_string(&runtime.path),
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
        let message = format!("Unable to start codex app-server from {}: {error}", path_string(&runtime.path));
        log("process", format!("spawn:error {message}"));
        message
      })?;
    log(
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
                  log("stdout", format!("invalid-json error={error} line={}", short(&line)));
                  continue;
                }
              };
              if message.get("method").is_some() {
                log("event", event_summary(&message));
                let _ = events.send(message.clone());
                let _ = app.emit("elephantnote:codex:event", &message);
                continue;
              }
              let Some(id) = message.get("id").and_then(Value::as_u64) else {
                log("stdout", format!("response-without-id payload={}", short(message.to_string())));
                continue;
              };
              if let Some(sender) = pending.lock().await.remove(&id) {
                let result = if let Some(error) = message.get("error") {
                  let detail = error
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or("Codex app-server request failed.")
                    .to_string();
                  log("response", format!("id={id} status=error message={}", short(&detail)));
                  Err(detail)
                } else {
                  log("response", format!("id={id} status=ok"));
                  Ok(message.get("result").cloned().unwrap_or(Value::Null))
                };
                let _ = sender.send(result);
              } else {
                log("response", format!("id={id} no-pending-receiver"));
              }
            }
            Ok(None) => {
              log("stdout", "eof");
              break;
            }
            Err(error) => {
              log("stdout", format!("read-error {error}"));
              break;
            }
          }
        }
        let mut pending = pending.lock().await;
        log("state", format!("failing-pending count={}", pending.len()));
        for (_, sender) in pending.drain() {
          let _ = sender.send(Err("Codex app-server stopped before responding.".to_string()));
        }
      });
    }

    tokio::spawn(async move {
      let mut lines = BufReader::new(stderr).lines();
      loop {
        match lines.next_line().await {
          Ok(Some(line)) => log("stderr", short(line)),
          Ok(None) => {
            log("stderr", "eof");
            break;
          }
          Err(error) => {
            log("stderr", format!("read-error {error}"));
            break;
          }
        }
      }
    });

    let client = Self { runtime, child, stdin, pending, events, next_id: AtomicU64::new(1) };
    log("protocol", "initialize:start");
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
    log("protocol", "initialize:complete");
    Ok(client)
  }

  async fn is_running(&self) -> bool {
    let mut child = self.child.lock().await;
    match child.try_wait() {
      Ok(None) => true,
      Ok(Some(status)) => {
        log("process", format!("exited status={status}"));
        false
      }
      Err(error) => {
        log("process", format!("try-wait-error {error}"));
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
    log("request", format!("id={id} method={method} {}", params_summary(method, &params)));
    let (sender, receiver) = oneshot::channel();
    self.pending.lock().await.insert(id, sender);
    if let Err(error) = self.write(&json!({ "method": method, "id": id, "params": params })).await {
      self.pending.lock().await.remove(&id);
      log("request", format!("id={id} method={method} write-error={error}"));
      return Err(error);
    }
    let result = timeout(REQUEST_TIMEOUT, receiver)
      .await
      .map_err(|_| format!("Codex app-server request timed out: {method}"))?
      .map_err(|_| format!("Codex app-server response channel closed: {method}"))?;
    log(
      "request",
      format!(
        "id={id} method={method} status={} duration_ms={}",
        if result.is_ok() { "ok" } else { "error" },
        started.elapsed().as_millis()
      ),
    );
    result
  }

  async fn notify(&self, method: &str, params: Value) -> R<()> {
    log("notify", format!("method={method} {}", params_summary(method, &params)));
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
  log("account", format!("connected={connected} plan={plan}"));
  json!({
    "installed": true,
    "detected": true,
    "running": true,
    "connected": connected,
    "account": account,
    "requiresOpenaiAuth": result.get("requiresOpenaiAuth").cloned().unwrap_or(Value::Bool(true)),
    "version": client.runtime.version.clone(),
    "runtimePath": path_string(&client.runtime.path),
    "runtimeSource": client.runtime.source.clone()
  })
}

async fn status(app: &AppHandle) -> R<Value> {
  log("operation", "status:start");
  match state().client(app).await {
    Ok(client) => {
      let account = client.request("account/read", json!({ "refreshToken": false })).await?;
      log("operation", "status:complete");
      Ok(account_summary(account, &client))
    }
    Err(error) => {
      log("operation", format!("status:error {}", short(&error)));
      let resolution = resolve_without_install(app).await;
      Ok(json!({
        "installed": false,
        "detected": resolution.detected,
        "running": false,
        "connected": false,
        "error": error,
        "diagnostics": probes_json(&resolution.probes),
        "installError": resolution.install_error
      }))
    }
  }
}

async fn login(app: &AppHandle, flow: Option<String>) -> R<Value> {
  log("operation", format!("login:start flow={}", flow.as_deref().unwrap_or("browser")));
  let client = state().client(app).await?;
  let params = if flow.as_deref() == Some("device-code") {
    json!({ "type": "chatgptDeviceCode" })
  } else {
    json!({ "type": "chatgpt", "useHostedLoginSuccessPage": true, "appBrand": "chatgpt" })
  };
  let result = client.request("account/login/start", params).await;
  log("operation", format!("login:complete status={}", if result.is_ok() { "ok" } else { "error" }));
  result
}

async fn logout(app: &AppHandle) -> R<Value> {
  log("operation", "logout:start");
  let client = state().client(app).await?;
  let result = client.request("account/logout", json!({})).await?;
  log("operation", "logout:complete");
  Ok(json!({ "ok": true, "result": result }))
}

async fn models(app: &AppHandle) -> R<Value> {
  log("operation", "models:start");
  let client = state().client(app).await?;
  let result = client.request("model/list", json!({ "limit": 100, "includeHidden": false })).await?;
  let count = result.get("data").and_then(Value::as_array).map_or(0, Vec::len);
  log("operation", format!("models:complete count={count}"));
  Ok(result)
}

async fn rate_limits(app: &AppHandle) -> R<Value> {
  log("operation", "rate-limits:start");
  let client = state().client(app).await?;
  let result = client.request("account/rateLimits/read", json!({})).await;
  log("operation", format!("rate-limits:complete status={}", if result.is_ok() { "ok" } else { "error" }));
  result
}

async fn stop() -> R<Value> {
  log("operation", "stop:start");
  state().stop().await?;
  log("operation", "stop:complete");
  Ok(json!({ "ok": true }))
}

pub async fn command(app: &AppHandle, payload: &Value) -> R<Value> {
  let operation = payload.get("codexOperation").and_then(Value::as_str).unwrap_or("");
  log("command", format!("operation={operation}"));
  match operation {
    "status" => status(app).await,
    "login" => login(app, payload.get("flow").and_then(Value::as_str).map(str::to_string)).await,
    "logout" => logout(app).await,
    "models" => models(app).await,
    "rateLimits" => rate_limits(app).await,
    "stop" => stop().await,
    _ => Err(format!("Unsupported Codex operation: {operation}")),
  }
}

pub async fn chat(app: &AppHandle, model: &str, prompt: &str) -> R<CodexChatResult> {
  let started = Instant::now();
  log("chat", format!("start model={model} prompt_chars={}", prompt.chars().count()));
  if model.trim().is_empty() {
    return Err("No Codex model is selected.".to_string());
  }
  if prompt.trim().is_empty() {
    return Err("Cannot send an empty prompt to Codex.".to_string());
  }

  let client = state().client(app).await?;
  let account = client.request("account/read", json!({ "refreshToken": false })).await?;
  if account.get("account").is_none_or(Value::is_null) {
    log("chat", "rejected:not-authenticated");
    return Err("Codex is not authenticated. Connect your ChatGPT account in AI settings.".to_string());
  }

  let cwd = app.path().app_cache_dir().map_err(|error| error.to_string())?.join("codex-chat-sandbox");
  tokio::fs::create_dir_all(&cwd).await.map_err(|error| error.to_string())?;
  log("chat", format!("sandbox={}", path_string(&cwd)));
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
  log("chat", format!("thread-started id={thread_id}"));

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
  log("chat", format!("turn-started id={turn_id} thread={thread_id}"));

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
          log("chat", format!("turn-failed id={turn_id} error={}", short(&error)));
          return Err(error);
        }
        break;
      }
      "error" => {
        let message = event
          .pointer("/params/error/message")
          .and_then(Value::as_str)
          .unwrap_or("Codex generation failed.");
        log("chat", format!("event-error id={turn_id} message={}", short(message)));
        return Err(message.to_string());
      }
      _ => {}
    }
  }

  if answer.trim().is_empty() {
    log("chat", format!("empty-answer thread={thread_id} turn={turn_id}"));
    return Err("Codex completed the turn without an assistant message.".to_string());
  }
  log(
    "chat",
    format!(
      "complete thread={} turn={} answer_chars={} duration_ms={}",
      thread_id,
      turn_id,
      answer.chars().count(),
      started.elapsed().as_millis()
    ),
  );
  Ok(CodexChatResult { answer, model: model.to_string(), thread_id })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn reads_delta_text() {
    let event = json!({ "method": "item/agentMessage/delta", "params": { "delta": "hello" } });
    assert_eq!(delta_text(&event), "hello");
  }

  #[test]
  fn reads_completed_agent_message() {
    let event = json!({ "method": "item/completed", "params": { "item": { "type": "agentMessage", "text": "final" } } });
    assert_eq!(completed_agent_text(&event), "final");
  }

  #[test]
  fn completed_turn_has_no_failure() {
    let event = json!({ "method": "turn/completed", "params": { "turn": { "status": "completed" } } });
    assert!(turn_failure(&event).is_none());
  }

  #[test]
  fn failed_turn_returns_message() {
    let event = json!({ "method": "turn/completed", "params": { "turn": { "status": "failed", "error": { "message": "quota" } } } });
    assert_eq!(turn_failure(&event).as_deref(), Some("quota"));
  }

  #[test]
  fn finds_package_root_from_npm_launcher() {
    let entry = Path::new("/Users/test/.nvm/versions/node/v22/lib/node_modules/@openai/codex/bin/codex.js");
    assert!(package_roots(entry)
      .iter()
      .any(|root| root.ends_with("lib/node_modules/@openai/codex")));
  }

  #[test]
  fn gui_launcher_output_is_not_app_server_help() {
    let combined = "Ouverture dans une session de navigateur existante.".to_ascii_lowercase();
    assert!(!(combined.contains("app-server") && combined.contains("--listen")));
  }

  #[test]
  fn turn_summary_does_not_log_prompt() {
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

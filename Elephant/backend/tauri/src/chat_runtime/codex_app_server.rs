mod codex_runtime_installer;

use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    env, fs,
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

type R<T> = Result<T, String>;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TURN_TIMEOUT: Duration = Duration::from_secs(180);
const PROBE_TIMEOUT: Duration = Duration::from_secs(12);
const MAX_LOG_TEXT: usize = 900;
const READ_ONLY_SANDBOX: &str = "read-only";

#[derive(Debug)]
pub struct CodexChatResult {
    pub answer: String,
    pub model: String,
    pub thread_id: String,
}

#[derive(Clone, Debug)]
struct Runtime {
    path: PathBuf,
    source: String,
    version: String,
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
    STATE.get_or_init(|| CodexState {
        client: Mutex::new(None),
    })
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

fn binary_name() -> &'static str {
    if cfg!(windows) {
        "codex.exe"
    } else {
        "codex"
    }
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
    out: &mut Vec<(PathBuf, String)>,
    seen: &mut HashSet<PathBuf>,
    path: PathBuf,
    source: impl Into<String>,
) {
    if path.as_os_str().is_empty() {
        return;
    }
    let id = fs::canonicalize(&path).unwrap_or_else(|_| path.clone());
    if seen.insert(id) {
        out.push((path, source.into()));
    }
}

fn package_roots(entry: &Path) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    let mut variants = vec![entry.to_path_buf()];
    if let Ok(canonical) = fs::canonicalize(entry) {
        variants.push(canonical);
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

fn add_native_package_candidates(
    out: &mut Vec<(PathBuf, String)>,
    seen: &mut HashSet<PathBuf>,
    entry: &Path,
    source: &str,
) {
    let (Some(triple), Some(package)) = (target_triple(), platform_package()) else {
        return;
    };
    for root in package_roots(entry) {
        for (suffix, label) in [
            (
                PathBuf::from(triple).join("bin").join(binary_name()),
                "bundled-current",
            ),
            (
                PathBuf::from(triple).join("codex").join(binary_name()),
                "bundled-legacy",
            ),
            (PathBuf::from(triple).join(binary_name()), "bundled-flat"),
        ] {
            push_candidate(
                out,
                seen,
                root.join("vendor").join(suffix),
                format!("{source}:{label}"),
            );
        }
        let optional_roots = [
            root.join("node_modules").join("@openai").join(package),
            root.parent()
                .and_then(Path::parent)
                .map(|node_modules| node_modules.join("@openai").join(package))
                .unwrap_or_default(),
        ];
        for optional_root in optional_roots {
            push_candidate(
                out,
                seen,
                optional_root
                    .join("vendor")
                    .join(triple)
                    .join("bin")
                    .join(binary_name()),
                format!("{source}:optional-package"),
            );
            push_candidate(
                out,
                seen,
                optional_root
                    .join("vendor")
                    .join(triple)
                    .join("codex")
                    .join(binary_name()),
                format!("{source}:optional-package-legacy"),
            );
        }
    }
}

fn add_nvm_candidates(out: &mut Vec<(PathBuf, String)>, seen: &mut HashSet<PathBuf>) {
    let Some(home) = home_dir() else {
        return;
    };
    let Ok(read_dir) = fs::read_dir(home.join(".nvm").join("versions").join("node")) else {
        return;
    };
    let mut paths = read_dir
        .filter_map(Result::ok)
        .map(|entry| entry.path().join("bin").join(binary_name()))
        .collect::<Vec<_>>();
    paths.sort();
    paths.reverse();
    for path in paths {
        push_candidate(out, seen, path, "nvm-global-bin");
    }
}

fn add_codex_app_candidates(out: &mut Vec<(PathBuf, String)>, seen: &mut HashSet<PathBuf>) {
    #[cfg(target_os = "macos")]
    for root in [
        PathBuf::from("/Applications/Codex.app/Contents/Resources"),
        home_dir()
            .unwrap_or_default()
            .join("Applications/Codex.app/Contents/Resources"),
    ] {
        let candidate = root.join("codex");
        if candidate.exists() {
            push_candidate(out, seen, candidate, "codex-app-bundle-resource");
        }
    }
}

async fn shell_candidate() -> Option<PathBuf> {
    #[cfg(unix)]
    {
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        log("resolver", format!("login-shell:start shell={shell}"));
        let result = timeout(
            Duration::from_secs(8),
            Command::new(shell)
                .args([
                    "-lic",
                    "whence -p codex 2>/dev/null || command -v codex 2>/dev/null",
                ])
                .stdin(Stdio::null())
                .output(),
        )
        .await
        .ok()??;
        if !result.status.success() {
            return None;
        }
        String::from_utf8_lossy(&result.stdout)
            .lines()
            .next()
            .map(str::trim)
            .filter(|value| value.starts_with('/'))
            .map(PathBuf::from)
    }
    #[cfg(not(unix))]
    {
        None
    }
}

async fn candidate_paths(app: &AppHandle) -> Vec<(PathBuf, String)> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    if let Some(runtime) = codex_runtime_installer::existing(app) {
        push_candidate(&mut out, &mut seen, runtime.path, "elephantnote-managed");
    }
    for key in ["ELEPHANTNOTE_CODEX_PATH", "CODEX_PATH"] {
        if let Some(value) = env::var_os(key) {
            push_candidate(
                &mut out,
                &mut seen,
                PathBuf::from(value),
                format!("env:{key}"),
            );
        }
    }
    if let Ok(path) = which::which("codex") {
        add_native_package_candidates(&mut out, &mut seen, &path, "process-path");
        push_candidate(&mut out, &mut seen, path, "process-path");
    }
    if let Some(path) = shell_candidate().await {
        add_native_package_candidates(&mut out, &mut seen, &path, "login-shell");
        push_candidate(&mut out, &mut seen, path, "login-shell");
    }
    #[cfg(target_os = "macos")]
    for path in ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"] {
        push_candidate(
            &mut out,
            &mut seen,
            PathBuf::from(path),
            "macos-common-path",
        );
    }
    add_nvm_candidates(&mut out, &mut seen);
    add_codex_app_candidates(&mut out, &mut seen);
    out
}

async fn run_probe(path: &Path, args: &[&str]) -> R<std::process::Output> {
    timeout(
        PROBE_TIMEOUT,
        Command::new(path).args(args).stdin(Stdio::null()).output(),
    )
    .await
    .map_err(|_| format!("probe timed out args={args:?}"))?
    .map_err(|error| format!("probe spawn failed args={args:?}: {error}"))
}

fn app_server_help_valid(output: &std::process::Output) -> bool {
    if !output.status.success() {
        return false;
    }
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .to_ascii_lowercase();
    text.contains("app-server") && (text.contains("--listen") || text.contains("stdio"))
}

async fn probe_runtime(path: PathBuf, source: String) -> Option<Runtime> {
    log(
        "resolver",
        format!(
            "candidate source={source} path={} exists={} executable={}",
            path_string(&path),
            path.is_file(),
            executable(&path)
        ),
    );
    if !executable(&path) {
        return None;
    }
    let version_output = match run_probe(&path, &["--version"]).await {
        Ok(output) if output.status.success() => output,
        Ok(output) => {
            log(
                "resolver",
                format!(
                    "rejected source={source} path={} error=--version exit={} stdout={} stderr={}",
                    path_string(&path),
                    output.status,
                    short(String::from_utf8_lossy(&output.stdout)),
                    short(String::from_utf8_lossy(&output.stderr))
                ),
            );
            return None;
        }
        Err(error) => {
            log(
                "resolver",
                format!(
                    "rejected source={source} path={} error={error}",
                    path_string(&path)
                ),
            );
            return None;
        }
    };
    let stdout = short(String::from_utf8_lossy(&version_output.stdout));
    let stderr = short(String::from_utf8_lossy(&version_output.stderr));
    let version = if stdout.is_empty() { stderr } else { stdout };
    let help_output = match run_probe(&path, &["app-server", "--help"]).await {
        Ok(output) => output,
        Err(error) => {
            log(
                "resolver",
                format!(
                    "rejected source={source} path={} reason=app-server-capability error={error}",
                    path_string(&path)
                ),
            );
            return None;
        }
    };
    if !app_server_help_valid(&help_output) {
        log(
      "resolver",
      format!(
        "rejected source={source} path={} reason=app-server-capability help_exit={} stdout={} stderr={}",
        path_string(&path),
        help_output.status,
        short(String::from_utf8_lossy(&help_output.stdout)),
        short(String::from_utf8_lossy(&help_output.stderr))
      ),
    );
        return None;
    }
    log(
        "resolver",
        format!(
            "accepted source={source} path={} version={version} app_server=true",
            path_string(&path)
        ),
    );
    Some(Runtime {
        path,
        source,
        version,
    })
}

async fn resolve_runtime(app: &AppHandle) -> R<Runtime> {
    log(
        "resolver",
        format!(
            "start os={} arch={} target={} cwd={} PATH={}",
            env::consts::OS,
            env::consts::ARCH,
            target_triple().unwrap_or("unsupported"),
            env::current_dir()
                .map(|path| path_string(&path))
                .unwrap_or_else(|_| "<unknown>".to_string()),
            env::var("PATH").unwrap_or_else(|_| "<unset>".to_string())
        ),
    );
    for (path, source) in candidate_paths(app).await {
        if let Some(runtime) = probe_runtime(path, source).await {
            return Ok(runtime);
        }
    }
    log(
        "installer",
        "no valid app-server runtime found; installing official managed Codex CLI",
    );
    let app_clone = app.clone();
    let installed =
        tokio::task::spawn_blocking(move || codex_runtime_installer::ensure_installed(app_clone))
            .await
            .map_err(|error| format!("Managed Codex installer task failed: {error}"))??;
    probe_runtime(installed.path, "elephantnote-managed-download".to_string())
        .await
        .ok_or_else(|| {
            "Downloaded Codex binary does not expose the app-server protocol.".to_string()
        })
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
    let status = event
        .pointer("/params/turn/status")
        .and_then(Value::as_str)
        .unwrap_or("");
    if status == "completed" {
        return None;
    }
    event
        .pointer("/params/turn/error/message")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| Some(format!("Codex turn ended with status: {status}")))
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
                params
                    .get("threadId")
                    .and_then(Value::as_str)
                    .unwrap_or("<none>"),
                params
                    .get("model")
                    .and_then(Value::as_str)
                    .unwrap_or("<default>"),
                input_chars
            )
        }
        "thread/start" => format!(
            "model={} cwd={} approval={} sandbox={}",
            params
                .get("model")
                .and_then(Value::as_str)
                .unwrap_or("<default>"),
            params
                .get("cwd")
                .and_then(Value::as_str)
                .unwrap_or("<none>"),
            params
                .get("approvalPolicy")
                .and_then(Value::as_str)
                .unwrap_or("<none>"),
            params
                .get("sandbox")
                .and_then(Value::as_str)
                .unwrap_or("<none>")
        ),
        "account/login/start" => format!(
            "type={}",
            params
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("<none>")
        ),
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
                    format!(
                        "reuse source={} path={}",
                        client.runtime.source,
                        path_string(&client.runtime.path)
                    ),
                );
                return Ok(client.clone());
            }
            log("state", "cached app-server exited; resolving again");
        }
        let runtime = resolve_runtime(app).await?;
        let client = Arc::new(CodexClient::spawn(app.clone(), runtime).await?);
        *slot = Some(client.clone());
        Ok(client)
    }

    async fn stop(&self) -> R<()> {
        if let Some(client) = self.client.lock().await.take() {
            let mut child = client.child.lock().await;
            log("process", format!("stop:start pid={:?}", child.id()));
            child.kill().await.map_err(|error| error.to_string())?;
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
        let mut child = Command::new(&runtime.path)
            .args(["app-server", "--listen", "stdio://"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|error| {
                format!(
                    "Unable to start codex app-server from {}: {error}",
                    path_string(&runtime.path)
                )
            })?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Codex app-server stdin is unavailable.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "Codex app-server stdout is unavailable.".to_string())?;
        let stderr = child
            .stderr
            .take()
            .ok_or_else(|| "Codex app-server stderr is unavailable.".to_string())?;
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
                                    log(
                                        "stdout",
                                        format!("invalid-json error={error} line={}", short(&line)),
                                    );
                                    continue;
                                }
                            };
                            if message.get("method").is_some() {
                                let method = message
                                    .get("method")
                                    .and_then(Value::as_str)
                                    .unwrap_or("<none>");
                                log(
                                    "event",
                                    format!(
                                        "method={method} thread={} turn={}",
                                        event_thread_id(&message),
                                        event_turn_id(&message)
                                    ),
                                );
                                let _ = events.send(message.clone());
                                let _ = app.emit("elephantnote:codex:event", &message);
                                continue;
                            }
                            let Some(id) = message.get("id").and_then(Value::as_u64) else {
                                continue;
                            };
                            if let Some(sender) = pending.lock().await.remove(&id) {
                                let result = if let Some(error) = message.get("error") {
                                    let detail = error
                                        .get("message")
                                        .and_then(Value::as_str)
                                        .unwrap_or("Codex app-server request failed.")
                                        .to_string();
                                    log(
                                        "response",
                                        format!("id={id} status=error message={}", short(&detail)),
                                    );
                                    Err(detail)
                                } else {
                                    log("response", format!("id={id} status=ok"));
                                    Ok(message.get("result").cloned().unwrap_or(Value::Null))
                                };
                                let _ = sender.send(result);
                            }
                        }
                        Ok(None) => break,
                        Err(error) => {
                            log("stdout", format!("read-error {error}"));
                            break;
                        }
                    }
                }
                for (_, sender) in pending.lock().await.drain() {
                    let _ = sender.send(Err(
                        "Codex app-server stopped before responding.".to_string()
                    ));
                }
            });
        }

        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                log("stderr", short(line));
            }
        });

        let client = Self {
            runtime,
            child,
            stdin,
            pending,
            events,
            next_id: AtomicU64::new(1),
        };
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
        matches!(child.try_wait(), Ok(None))
    }

    async fn write(&self, message: &Value) -> R<()> {
        let line = serde_json::to_string(message).map_err(|error| error.to_string())?;
        let mut stdin = self.stdin.lock().await;
        stdin
            .write_all(line.as_bytes())
            .await
            .map_err(|error| error.to_string())?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|error| error.to_string())?;
        stdin.flush().await.map_err(|error| error.to_string())
    }

    async fn request(&self, method: &str, params: Value) -> R<Value> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let started = Instant::now();
        log(
            "request",
            format!(
                "id={id} method={method} {}",
                params_summary(method, &params)
            ),
        );
        let (sender, receiver) = oneshot::channel();
        self.pending.lock().await.insert(id, sender);
        if let Err(error) = self
            .write(&json!({ "method": method, "id": id, "params": params }))
            .await
        {
            self.pending.lock().await.remove(&id);
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
        log(
            "notify",
            format!("method={method} {}", params_summary(method, &params)),
        );
        self.write(&json!({ "method": method, "params": params }))
            .await
    }

    fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.events.subscribe()
    }
}

fn account_summary(result: Value, client: &CodexClient) -> Value {
    let account = result.get("account").cloned().unwrap_or(Value::Null);
    let connected = !account.is_null();
    let plan = account
        .get("planType")
        .and_then(Value::as_str)
        .unwrap_or("<unknown>");
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
    match state().client(app).await {
        Ok(client) => {
            let account = client
                .request("account/read", json!({ "refreshToken": false }))
                .await?;
            Ok(account_summary(account, &client))
        }
        Err(error) => Ok(json!({
          "installed": false,
          "detected": false,
          "running": false,
          "connected": false,
          "error": error
        })),
    }
}

async fn login(app: &AppHandle, flow: Option<String>) -> R<Value> {
    let client = state().client(app).await?;
    let params = if flow.as_deref() == Some("device-code") {
        json!({ "type": "chatgptDeviceCode" })
    } else {
        json!({ "type": "chatgpt", "useHostedLoginSuccessPage": true, "appBrand": "chatgpt" })
    };
    client.request("account/login/start", params).await
}

async fn logout(app: &AppHandle) -> R<Value> {
    let client = state().client(app).await?;
    let result = client.request("account/logout", json!({})).await?;
    Ok(json!({ "ok": true, "result": result }))
}

async fn models(app: &AppHandle) -> R<Value> {
    let client = state().client(app).await?;
    client
        .request(
            "model/list",
            json!({ "limit": 100, "includeHidden": false }),
        )
        .await
}

async fn rate_limits(app: &AppHandle) -> R<Value> {
    let client = state().client(app).await?;
    client.request("account/rateLimits/read", json!({})).await
}

async fn stop() -> R<Value> {
    state().stop().await?;
    Ok(json!({ "ok": true }))
}

pub async fn command(app: &AppHandle, payload: &Value) -> R<Value> {
    let operation = payload
        .get("codexOperation")
        .and_then(Value::as_str)
        .unwrap_or("");
    log("command", format!("operation={operation}"));
    match operation {
        "status" => status(app).await,
        "login" => {
            login(
                app,
                payload
                    .get("flow")
                    .and_then(Value::as_str)
                    .map(str::to_string),
            )
            .await
        }
        "logout" => logout(app).await,
        "models" => models(app).await,
        "rateLimits" => rate_limits(app).await,
        "stop" => stop().await,
        _ => Err(format!("Unsupported Codex operation: {operation}")),
    }
}

pub async fn chat(app: &AppHandle, model: &str, prompt: &str) -> R<CodexChatResult> {
    let started = Instant::now();
    log(
        "chat",
        format!(
            "start model={model} prompt_chars={}",
            prompt.chars().count()
        ),
    );
    if model.trim().is_empty() {
        return Err("No Codex model is selected.".to_string());
    }
    if prompt.trim().is_empty() {
        return Err("Cannot send an empty prompt to Codex.".to_string());
    }

    let client = state().client(app).await?;
    let account = client
        .request("account/read", json!({ "refreshToken": false }))
        .await?;
    if account.get("account").is_none_or(Value::is_null) {
        return Err(
            "Codex is not authenticated. Connect your ChatGPT account in AI settings.".to_string(),
        );
    }

    let cwd = app
        .path()
        .app_cache_dir()
        .map_err(|error| error.to_string())?
        .join("codex-chat-sandbox");
    tokio::fs::create_dir_all(&cwd)
        .await
        .map_err(|error| error.to_string())?;
    let cwd_text = cwd.to_string_lossy().to_string();
    let thread = client
        .request(
            "thread/start",
            json!({
              "model": model,
              "cwd": cwd_text,
              "approvalPolicy": "never",
              "sandbox": READ_ONLY_SANDBOX,
              "serviceName": "elephantnote"
            }),
        )
        .await?;
    let thread_id = thread
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex thread/start returned no thread id.".to_string())?
        .to_string();

    let mut events = client.subscribe();
    let turn = client
        .request(
            "turn/start",
            json!({
              "threadId": thread_id,
              "input": [{ "type": "text", "text": prompt }],
              "model": model,
              "cwd": cwd_text,
              "approvalPolicy": "never",
              "sandboxPolicy": {
                "type": READ_ONLY_SANDBOX,
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
    log(
        "chat",
        format!("turn-started id={turn_id} thread={thread_id}"),
    );

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
                    return Err(error);
                }
                break;
            }
            "error" => {
                let message = event
                    .pointer("/params/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("Codex generation failed.");
                return Err(message.to_string());
            }
            _ => {}
        }
    }

    if answer.trim().is_empty() {
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
    Ok(CodexChatResult {
        answer,
        model: model.to_string(),
        thread_id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn uses_protocol_sandbox_variant() {
        assert_eq!(READ_ONLY_SANDBOX, "read-only");
    }

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
        let event =
            json!({ "method": "turn/completed", "params": { "turn": { "status": "completed" } } });
        assert!(turn_failure(&event).is_none());
    }

    #[test]
    fn failed_turn_returns_message() {
        let event = json!({ "method": "turn/completed", "params": { "turn": { "status": "failed", "error": { "message": "quota" } } } });
        assert_eq!(turn_failure(&event).as_deref(), Some("quota"));
    }

    #[test]
    fn finds_package_root_from_npm_launcher() {
        let entry = Path::new(
            "/Users/test/.nvm/versions/node/v22/lib/node_modules/@openai/codex/bin/codex.js",
        );
        assert!(package_roots(entry)
            .iter()
            .any(|root| root.ends_with("lib/node_modules/@openai/codex")));
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

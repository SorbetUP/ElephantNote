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
    time::{timeout, timeout_at, Instant},
};

type R<T> = Result<T, String>;

const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const TURN_TIMEOUT: Duration = Duration::from_secs(180);
const CLEANUP_TIMEOUT: Duration = Duration::from_secs(3);
const PROBE_TIMEOUT: Duration = Duration::from_secs(12);
const SHELL_LOOKUP_TIMEOUT: Duration = Duration::from_secs(8);
const MAX_LOG_TEXT: usize = 900;
const EVENT_BUFFER_CAPACITY: usize = 1024;
const READ_ONLY_SANDBOX: &str = "read-only";
const TURN_READ_ONLY_SANDBOX: &str = "readOnly";
const CODEX_HOME_DIR: &str = "home";

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

fn source_auth_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(codex_home) = env::var_os("CODEX_HOME").map(PathBuf::from) {
        candidates.push(codex_home.join("auth.json"));
    }
    if let Some(home) = home_dir() {
        candidates.push(
            home.join(".elephantnote")
                .join("codex-home")
                .join("auth.json"),
        );
        candidates.push(home.join(".codex").join("auth.json"));
    }
    candidates.dedup();
    candidates
}

async fn isolated_codex_home(app: &AppHandle) -> R<PathBuf> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve ElephantNote app data directory: {error}"))?
        .join("runtimes")
        .join("codex")
        .join(CODEX_HOME_DIR);
    tokio::fs::create_dir_all(&root).await.map_err(|error| {
        format!(
            "Unable to create isolated Codex home {}: {error}",
            root.display()
        )
    })?;

    let target_auth = root.join("auth.json");
    if !target_auth.exists() {
        if let Some(source_auth) = source_auth_candidates()
            .into_iter()
            .find(|path| path.is_file())
        {
            tokio::fs::copy(&source_auth, &target_auth)
                .await
                .map_err(|error| {
                    format!(
                        "Unable to seed isolated Codex authentication from {}: {error}",
                        source_auth.display()
                    )
                })?;
            restrict_auth_permissions(&target_auth).await?;
            log(
                "auth",
                format!(
                    "seeded isolated authentication source={} target={}",
                    source_auth.display(),
                    target_auth.display()
                ),
            );
        }
    }
    Ok(root)
}

async fn restrict_auth_permissions(path: &Path) -> R<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = tokio::fs::metadata(path)
            .await
            .map_err(|error| error.to_string())?
            .permissions();
        permissions.set_mode(0o600);
        tokio::fs::set_permissions(path, permissions)
            .await
            .map_err(|error| error.to_string())?;
    }
    #[cfg(not(unix))]
    let _ = path;
    Ok(())
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
            for (suffix, label) in [
                (
                    PathBuf::from("vendor")
                        .join(triple)
                        .join("bin")
                        .join(binary_name()),
                    "optional-package",
                ),
                (
                    PathBuf::from("vendor")
                        .join(triple)
                        .join("codex")
                        .join(binary_name()),
                    "optional-package-legacy",
                ),
            ] {
                push_candidate(
                    out,
                    seen,
                    optional_root.join(suffix),
                    format!("{source}:{label}"),
                );
            }
        }
    }
}

fn is_nvm_version_dir(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .is_some_and(|name| name.starts_with('v'))
        && path.is_dir()
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
        .map(|entry| entry.path())
        .filter(|path| is_nvm_version_dir(path))
        .map(|path| path.join("bin").join(binary_name()))
        .collect::<Vec<_>>();
    paths.sort();
    paths.reverse();
    for path in paths {
        add_native_package_candidates(out, seen, &path, "nvm-global-bin");
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
        push_candidate(
            out,
            seen,
            root.join(binary_name()),
            "codex-app-bundle-resource",
        );
    }
}

async fn shell_candidate() -> Option<PathBuf> {
    #[cfg(unix)]
    {
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let result = timeout(
            SHELL_LOOKUP_TIMEOUT,
            Command::new(shell)
                .args([
                    "-lic",
                    "whence -p codex 2>/dev/null || command -v codex 2>/dev/null",
                ])
                .stdin(Stdio::null())
                .output(),
        )
        .await
        .ok()?
        .ok()?;
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

    // Preserve compatibility with one previously downloaded runtime, but only after the bundled
    // binary so application updates always use the version shipped with ElephantNote.
    if let Ok(app_data_dir) = app.path().app_data_dir() {
        push_candidate(
            &mut out,
            &mut seen,
            app_data_dir
                .join("runtimes")
                .join("codex")
                .join("bin")
                .join(binary_name()),
            "legacy-elephantnote-managed",
        );
    }

    add_codex_app_candidates(&mut out, &mut seen);

    #[cfg(target_os = "macos")]
    for path in ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"] {
        push_candidate(
            &mut out,
            &mut seen,
            PathBuf::from(path),
            "macos-common-path",
        );
    }

    if let Ok(path) = which::which("codex") {
        add_native_package_candidates(&mut out, &mut seen, &path, "process-path");
        push_candidate(&mut out, &mut seen, path, "process-path");
    }
    if let Some(path) = shell_candidate().await {
        add_native_package_candidates(&mut out, &mut seen, &path, "login-shell");
        push_candidate(&mut out, &mut seen, path, "login-shell");
    }
    add_nvm_candidates(&mut out, &mut seen);
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
    if !executable(&path) {
        return None;
    }
    let version_output = match run_probe(&path, &["--version"]).await {
        Ok(output) if output.status.success() => output,
        Ok(output) => {
            log(
                "resolver",
                format!(
                    "rejected source={source} path={} error=--version exit={} stderr={}",
                    path_string(&path),
                    output.status,
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
                "rejected source={source} path={} reason=app-server-capability exit={}",
                path_string(&path),
                help_output.status
            ),
        );
        return None;
    }

    log(
        "resolver",
        format!(
            "accepted source={source} path={} version={version}",
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
    let candidates = candidate_paths(app).await;
    log(
        "resolver",
        format!(
            "start os={} arch={} target={} candidates={}",
            env::consts::OS,
            env::consts::ARCH,
            target_triple().unwrap_or("unsupported"),
            candidates.len()
        ),
    );
    for (path, source) in candidates {
        if let Some(runtime) = probe_runtime(path, source).await {
            return Ok(runtime);
        }
    }

    Err(
        "The bundled Codex app-server runtime is missing or invalid. Rebuild ElephantNote with `pnpm tauri:codex:install`; ElephantNote no longer downloads a 100 MB runtime while opening AI settings.".to_string(),
    )
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

fn should_log_event(method: &str) -> bool {
    !matches!(
        method,
        "item/agentMessage/delta"
            | "thread/tokenUsage/updated"
            | "thread/status/changed"
            | "mcpServer/startupStatus/updated"
    )
}

fn should_emit_frontend_event(method: &str) -> bool {
    matches!(
        method,
        "account/login/completed" | "account/updated" | "account/rateLimits/updated" | "warning"
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
            "model={} cwd={} approval={} sandbox={} ephemeral={}",
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
                .unwrap_or("<none>"),
            params
                .get("ephemeral")
                .and_then(Value::as_bool)
                .unwrap_or(false)
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

fn initialize_params() -> Value {
    json!({
      "clientInfo": {
        "name": "elephantnote",
        "title": "ElephantNote",
        "version": env!("CARGO_PKG_VERSION")
      },
      "capabilities": {
        "experimentalApi": true,
        "optOutNotificationMethods": ["mcpServer/startupStatus/updated"]
      }
    })
}

fn thread_start_params(model: &str, cwd: &str) -> Value {
    json!({
      "model": model,
      "cwd": cwd,
      "approvalPolicy": "never",
      "sandbox": READ_ONLY_SANDBOX,
      "serviceName": "elephantnote",
      "ephemeral": true,
      "config": {
        "web_search": "live"
      },
      "environments": [],
      "selectedCapabilityRoots": []
    })
}

fn normalize_reasoning_effort(value: Option<&str>) -> Option<&str> {
    value
        .map(str::trim)
        .filter(|value| matches!(*value, "minimal" | "low" | "medium" | "high" | "xhigh"))
}

fn turn_start_params(
    thread_id: &str,
    model: &str,
    cwd: &str,
    prompt: &str,
    reasoning_effort: Option<&str>,
) -> Value {
    let mut params = json!({
      "threadId": thread_id,
      "input": [{ "type": "text", "text": prompt }],
      "model": model,
      "cwd": cwd,
      "approvalPolicy": "never",
      "sandboxPolicy": {
        "type": TURN_READ_ONLY_SANDBOX,
        "networkAccess": true
      }
    });
    if let Some(effort) = normalize_reasoning_effort(reasoning_effort) {
        params["effort"] = json!(effort);
    }
    params
}

impl CodexState {
    async fn client(&self, app: &AppHandle) -> R<Arc<CodexClient>> {
        let mut slot = self.client.lock().await;
        if let Some(client) = slot.as_ref() {
            if client.is_running().await {
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
            if child
                .try_wait()
                .map_err(|error| error.to_string())?
                .is_none()
            {
                child.kill().await.map_err(|error| error.to_string())?;
                let _ = child.wait().await;
            }
        }
        Ok(())
    }
}

impl CodexClient {
    async fn spawn(app: AppHandle, runtime: Runtime) -> R<Self> {
        let codex_home = isolated_codex_home(&app).await?;
        log(
            "process",
            format!(
                "spawn:start source={} path={} version={} codex_home={} args=app-server --listen stdio://",
                runtime.source,
                path_string(&runtime.path),
                runtime.version,
                codex_home.display()
            ),
        );
        let mut child = Command::new(&runtime.path)
            .args(["app-server", "--listen", "stdio://"])
            .env("CODEX_HOME", &codex_home)
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
        let (events, _) = broadcast::channel(EVENT_BUFFER_CAPACITY);

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
                            if let Some(method) = message.get("method").and_then(Value::as_str) {
                                if should_log_event(method) {
                                    log(
                                        "event",
                                        format!(
                                            "method={method} thread={} turn={}",
                                            event_thread_id(&message),
                                            event_turn_id(&message)
                                        ),
                                    );
                                }
                                let _ = events.send(message.clone());
                                if should_emit_frontend_event(method) {
                                    let _ = app.emit("elephantnote:codex:event", &message);
                                }
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
                if !line.trim().is_empty() {
                    log("stderr", short(line));
                }
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
        let initialized = client.request("initialize", initialize_params()).await?;
        client.notify("initialized", json!({})).await?;
        log(
            "protocol",
            format!(
                "initialize:complete codex_home={}",
                initialized
                    .get("codexHome")
                    .and_then(Value::as_str)
                    .unwrap_or("<unknown>")
            ),
        );
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

        let result = match timeout(REQUEST_TIMEOUT, receiver).await {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => {
                self.pending.lock().await.remove(&id);
                return Err(format!(
                    "Codex app-server response channel closed: {method}"
                ));
            }
            Err(_) => {
                self.pending.lock().await.remove(&id);
                return Err(format!("Codex app-server request timed out: {method}"));
            }
        };
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
        self.write(&json!({ "method": method, "params": params }))
            .await
    }

    fn subscribe(&self) -> broadcast::Receiver<Value> {
        self.events.subscribe()
    }

    async fn cleanup_thread(&self, thread_id: &str) {
        let _ = timeout(
            CLEANUP_TIMEOUT,
            self.request("thread/unsubscribe", json!({ "threadId": thread_id })),
        )
        .await;
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

fn consume_rate_limit_reset_params(payload: &Value) -> R<Value> {
    let credit_id = payload
        .get("creditId")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "A Codex reset credit id is required.".to_string())?;
    let idempotency_key = payload
        .get("idempotencyKey")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "A reset idempotency key is required.".to_string())?;
    Ok(json!({
      "creditId": credit_id,
      "idempotencyKey": idempotency_key
    }))
}

async fn consume_rate_limit_reset(app: &AppHandle, payload: &Value) -> R<Value> {
    let client = state().client(app).await?;
    client
        .request(
            "account/rateLimitResetCredit/consume",
            consume_rate_limit_reset_params(payload)?,
        )
        .await
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
        "consumeRateLimitReset" => consume_rate_limit_reset(app, payload).await,
        "stop" => stop().await,
        _ => Err(format!("Unsupported Codex operation: {operation}")),
    }
}

pub async fn chat(app: &AppHandle, model: &str, prompt: &str) -> R<CodexChatResult> {
    chat_with_effort(app, model, prompt, None).await
}

pub async fn chat_with_effort(
    app: &AppHandle,
    model: &str,
    prompt: &str,
    reasoning_effort: Option<&str>,
) -> R<CodexChatResult> {
    chat_with_effort_streaming(app, model, prompt, reasoning_effort, None).await
}

pub async fn chat_with_effort_streaming(
    app: &AppHandle,
    model: &str,
    prompt: &str,
    reasoning_effort: Option<&str>,
    stream_id: Option<&str>,
) -> R<CodexChatResult> {
    let started = Instant::now();
    log(
        "chat",
        format!(
            "start model={model} effort={} prompt_chars={}",
            normalize_reasoning_effort(reasoning_effort).unwrap_or("default"),
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

    // Subscribe before creating the thread so fast notifications cannot race past this receiver.
    let mut events = client.subscribe();
    let thread = client
        .request("thread/start", thread_start_params(model, &cwd_text))
        .await?;
    let thread_id = thread
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .ok_or_else(|| "Codex thread/start returned no thread id.".to_string())?
        .to_string();

    let turn = match client
        .request(
            "turn/start",
            turn_start_params(&thread_id, model, &cwd_text, prompt, reasoning_effort),
        )
        .await
    {
        Ok(turn) => turn,
        Err(error) => {
            client.cleanup_thread(&thread_id).await;
            return Err(error);
        }
    };
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
    let mut delta_count = 0usize;
    let deadline = Instant::now() + TURN_TIMEOUT;
    let turn_result = loop {
        let event = match timeout_at(deadline, events.recv()).await {
            Err(_) => {
                let _ = timeout(
                    CLEANUP_TIMEOUT,
                    client.request(
                        "turn/interrupt",
                        json!({ "threadId": thread_id, "turnId": turn_id }),
                    ),
                )
                .await;
                break Err("Codex generation timed out before turn/completed.".to_string());
            }
            Ok(Ok(event)) => event,
            Ok(Err(broadcast::error::RecvError::Lagged(skipped))) => {
                log("event", format!("receiver-lagged skipped={skipped}"));
                continue;
            }
            Ok(Err(broadcast::error::RecvError::Closed)) => {
                break Err("Codex event stream closed before turn/completed.".to_string());
            }
        };

        let event_thread = event_thread_id(&event);
        if !event_thread.is_empty() && event_thread != thread_id {
            continue;
        }
        let event_turn = event_turn_id(&event);
        if !event_turn.is_empty() && event_turn != turn_id {
            continue;
        }

        match event.get("method").and_then(Value::as_str).unwrap_or("") {
            "item/agentMessage/delta" => {
                delta_count += 1;
                let delta = delta_text(&event);
                answer.push_str(delta);
                if let Some(stream_id) = stream_id {
                    let _ = app.emit(
                        "elephantnote://chat-stream",
                        json!({ "streamId": stream_id, "type": "delta", "delta": delta }),
                    );
                }
            }
            "item/completed" => {
                let text = completed_agent_text(&event);
                if !text.is_empty() {
                    answer = text.to_string();
                }
            }
            "turn/completed" => {
                if let Some(error) = turn_failure(&event) {
                    break Err(error);
                }
                if let Some(stream_id) = stream_id {
                    let _ = app.emit(
                        "elephantnote://chat-stream",
                        json!({ "streamId": stream_id, "type": "phase", "phase": "finalizing" }),
                    );
                }
                break Ok(());
            }
            "error" => {
                let message = event
                    .pointer("/params/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or("Codex generation failed.");
                break Err(message.to_string());
            }
            _ => {}
        }
    };

    client.cleanup_thread(&thread_id).await;
    turn_result?;

    if answer.trim().is_empty() {
        return Err("Codex completed the turn without an assistant message.".to_string());
    }
    log(
        "chat",
        format!(
            "complete thread={} turn={} answer_chars={} deltas={} duration_ms={}",
            thread_id,
            turn_id,
            answer.chars().count(),
            delta_count,
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
    fn uses_protocol_sandbox_variants() {
        assert_eq!(READ_ONLY_SANDBOX, "read-only");
        assert_eq!(TURN_READ_ONLY_SANDBOX, "readOnly");
    }

    #[test]
    fn isolated_thread_payload_disables_external_environments() {
        let params = thread_start_params("gpt-test", "/tmp/chat");
        assert_eq!(params.get("ephemeral").and_then(Value::as_bool), Some(true));
        assert_eq!(params.get("environments"), Some(&json!([])));
        assert_eq!(params.get("selectedCapabilityRoots"), Some(&json!([])));
        assert_eq!(
            params.get("sandbox").and_then(Value::as_str),
            Some("read-only")
        );
    }

    #[test]
    fn codex_chat_enables_live_web_search_without_filesystem_writes() {
        let thread = thread_start_params("gpt-test", "/tmp/chat");
        assert_eq!(
            thread.pointer("/config/web_search").and_then(Value::as_str),
            Some("live")
        );
        assert!(thread.pointer("/config/tools").is_none());
        let params = turn_start_params("thread", "gpt-test", "/tmp/chat", "hello", None);
        assert_eq!(
            params
                .pointer("/sandboxPolicy/type")
                .and_then(Value::as_str),
            Some("readOnly")
        );
        assert_eq!(
            params
                .pointer("/sandboxPolicy/networkAccess")
                .and_then(Value::as_bool),
            Some(true)
        );
    }

    #[test]
    fn turn_payload_carries_supported_reasoning_effort() {
        let params = turn_start_params("thread", "gpt-test", "/tmp/chat", "hello", Some("high"));
        assert_eq!(params.get("effort").and_then(Value::as_str), Some("high"));
        let invalid = turn_start_params(
            "thread",
            "gpt-test",
            "/tmp/chat",
            "hello",
            Some("impossible"),
        );
        assert!(invalid.get("effort").is_none());
    }

    #[test]
    fn suppresses_high_frequency_event_logs() {
        assert!(!should_log_event("item/agentMessage/delta"));
        assert!(!should_log_event("thread/tokenUsage/updated"));
        assert!(!should_log_event("mcpServer/startupStatus/updated"));
        assert!(should_log_event("turn/completed"));
        assert!(should_log_event("warning"));
    }

    #[test]
    fn emits_only_account_and_warning_events_to_frontend() {
        assert!(should_emit_frontend_event("account/updated"));
        assert!(should_emit_frontend_event("account/rateLimits/updated"));
        assert!(!should_emit_frontend_event("item/agentMessage/delta"));
        assert!(!should_emit_frontend_event("thread/status/changed"));
    }

    #[test]
    fn builds_rate_limit_reset_request_params() {
        let params = consume_rate_limit_reset_params(&json!({
          "creditId": "credit-1",
          "idempotencyKey": "attempt-1"
        }))
        .expect("valid reset params");
        assert_eq!(
            params.get("creditId").and_then(Value::as_str),
            Some("credit-1")
        );
        assert_eq!(
            params.get("idempotencyKey").and_then(Value::as_str),
            Some("attempt-1")
        );
    }

    #[test]
    fn rejects_missing_rate_limit_reset_credit() {
        let error = consume_rate_limit_reset_params(&json!({ "idempotencyKey": "attempt-1" }))
            .expect_err("missing credit id must fail");
        assert!(error.contains("credit id"));
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
        let launcher = Path::new("/tmp/node_modules/@openai/codex/bin/codex.js");
        assert!(package_roots(launcher)
            .iter()
            .any(|root| root.ends_with("node_modules/@openai/codex")));
    }

    #[test]
    fn rejects_non_version_nvm_directories() {
        assert!(!Path::new("/tmp/.DS_Store")
            .file_name()
            .and_then(|value| value.to_str())
            .is_some_and(|name| name.starts_with('v')));
    }
}

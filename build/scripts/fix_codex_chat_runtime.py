from pathlib import Path

path = Path("Elephant/backend/tauri/src/chat_runtime/codex_app_server.rs")
text = path.read_text()

if 'const ISOLATED_CODEX_HOME_DIR:' in text:
    print('Codex isolation patch already present')
    raise SystemExit(0)

replacements = [
    (
        'const TURN_READ_ONLY_SANDBOX: &str = "readOnly";',
        'const TURN_READ_ONLY_SANDBOX: &str = "readOnly";\nconst ISOLATED_CODEX_HOME_DIR: &str = "elephantnote-chat-home";',
        'isolated home constant',
    ),
    (
        '''fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
}
''',
        '''fn home_dir() -> Option<PathBuf> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .or_else(|| env::var_os("USERPROFILE").map(PathBuf::from))
}

fn source_codex_home() -> Option<PathBuf> {
    env::var_os("CODEX_HOME")
        .map(PathBuf::from)
        .or_else(|| home_dir().map(|home| home.join(".codex")))
}

async fn isolated_codex_home(app: &AppHandle) -> R<PathBuf> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Unable to resolve ElephantNote app data directory: {error}"))?
        .join("runtimes")
        .join("codex")
        .join(ISOLATED_CODEX_HOME_DIR);
    tokio::fs::create_dir_all(&root)
        .await
        .map_err(|error| format!("Unable to create isolated Codex home {}: {error}", root.display()))?;

    let target_auth = root.join("auth.json");
    if !target_auth.exists()
        && let Some(source_home) = source_codex_home()
    {
        let source_auth = source_home.join("auth.json");
        if source_auth.is_file() {
            tokio::fs::copy(&source_auth, &target_auth)
                .await
                .map_err(|error| {
                    format!(
                        "Unable to seed isolated Codex authentication from {}: {error}",
                        source_auth.display()
                    )
                })?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut permissions = tokio::fs::metadata(&target_auth)
                    .await
                    .map_err(|error| error.to_string())?
                    .permissions();
                permissions.set_mode(0o600);
                tokio::fs::set_permissions(&target_auth, permissions)
                    .await
                    .map_err(|error| error.to_string())?;
            }
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
''',
        'isolated home helpers',
    ),
    (
        'let (events, _) = broadcast::channel(256);',
        'let (events, _) = broadcast::channel(2048);',
        'broadcast capacity',
    ),
    (
        '''        log(
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
''',
        '''        let codex_home = isolated_codex_home(&app).await?;
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
''',
        'isolated process home',
    ),
    (
        '''        client
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
''',
        '''        let initialized = client
            .request(
                "initialize",
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
                }),
            )
            .await?;
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
''',
        'initialize capabilities',
    ),
    (
        '''    let thread = client
        .request(
            "thread/start",''',
        '''    // Subscribe before thread/start so no notification can race past this chat.
    let mut events = client.subscribe();
    let thread = client
        .request(
            "thread/start",''',
        'early event subscription',
    ),
    (
        '''              "approvalPolicy": "never",
              "sandbox": READ_ONLY_SANDBOX,
              "serviceName": "elephantnote"''',
        '''              "approvalPolicy": "never",
              "sandbox": READ_ONLY_SANDBOX,
              "serviceName": "elephantnote",
              "ephemeral": true,
              "environments": [],
              "selectedCapabilityRoots": []''',
        'isolated thread payload',
    ),
    (
        '''\n    let mut events = client.subscribe();
    let turn = client''',
        '''\n    let turn = client''',
        'late duplicate subscription',
    ),
    (
        '''        let event = timeout(TURN_TIMEOUT, events.recv())
            .await
            .map_err(|_| "Codex generation timed out.".to_string())?
            .map_err(|error| format!("Codex event stream closed: {error}"))?;''',
        '''        let event = match timeout(TURN_TIMEOUT, events.recv()).await {
            Err(_) => {
                let _ = client
                    .request("turn/interrupt", json!({ "threadId": thread_id, "turnId": turn_id }))
                    .await;
                return Err("Codex generation timed out before turn/completed.".to_string());
            }
            Ok(Ok(event)) => event,
            Ok(Err(broadcast::error::RecvError::Lagged(skipped))) => {
                log("event", format!("lagged skipped={skipped}; continuing"));
                continue;
            }
            Ok(Err(broadcast::error::RecvError::Closed)) => {
                return Err("Codex event stream closed before turn/completed.".to_string());
            }
        };''',
        'event receive handling',
    ),
]

for old, new, label in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 occurrence, found {count}')
    text = text.replace(old, new, 1)

marker = '''    #[test]
    fn reads_delta_text() {'''
tests = '''    #[test]
    fn isolated_codex_home_name_is_stable() {
        assert_eq!(ISOLATED_CODEX_HOME_DIR, "elephantnote-chat-home");
    }

    #[test]
    fn isolated_thread_payload_disables_external_environments() {
        let params = json!({
          "ephemeral": true,
          "environments": [],
          "selectedCapabilityRoots": []
        });
        assert_eq!(params.get("ephemeral").and_then(Value::as_bool), Some(true));
        assert_eq!(params.get("environments"), Some(&json!([])));
        assert_eq!(params.get("selectedCapabilityRoots"), Some(&json!([])));
    }

    #[test]
    fn reads_delta_text() {'''
if text.count(marker) != 1:
    raise SystemExit(f'test marker: expected 1 occurrence, found {text.count(marker)}')
text = text.replace(marker, tests, 1)
path.write_text(text)

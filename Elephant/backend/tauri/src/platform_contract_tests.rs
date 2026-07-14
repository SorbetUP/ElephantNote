use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .expect("Elephant/backend/tauri must live three levels under the repository root")
        .to_path_buf()
}

fn read_json(path: &str) -> Value {
    let raw = fs::read_to_string(repo_root().join(path))
        .expect("platform contract JSON file must be readable");
    serde_json::from_str(&raw).expect("platform contract JSON file must be valid JSON")
}

fn read_text(path: &str) -> String {
    fs::read_to_string(repo_root().join(path)).expect("platform contract file must be readable")
}

#[test]
fn desktop_tauri_config_keeps_desktop_runtime_resources() {
    let config = read_json("Elephant/backend/tauri/tauri.conf.json");
    let resources = config
        .pointer("/bundle/resources")
        .and_then(Value::as_array)
        .expect("desktop resources must be an array");
    assert!(
        resources.iter().any(|item| item.as_str() == Some("bin")),
        "desktop Tauri bundle must keep bin resources for llama-server"
    );

    let icons = config
        .pointer("/bundle/icon")
        .and_then(Value::as_array)
        .expect("desktop icons must be an array");
    assert!(
        icons
            .iter()
            .any(|item| item.as_str() == Some("../../assets/static/icon.png")),
        "desktop Tauri config must include a PNG icon for Linux"
    );
    assert!(
        icons
            .iter()
            .any(|item| item.as_str() == Some("../../assets/static/icon.icns")),
        "desktop Tauri config must keep the macOS icon"
    );
}

#[test]
fn linux_override_does_not_reuse_macos_window_chrome() {
    let config = read_json("Elephant/backend/tauri/tauri.linux.conf.json");
    let targets = config
        .pointer("/bundle/targets")
        .and_then(Value::as_array)
        .expect("Linux targets must be explicit");
    assert!(
        targets.iter().any(|item| item.as_str() == Some("deb")),
        "Linux build must produce a deb package"
    );
    assert!(
        targets.iter().any(|item| item.as_str() == Some("appimage")),
        "Linux build must produce an AppImage package"
    );

    let windows = config
        .pointer("/app/windows")
        .and_then(Value::as_array)
        .expect("Linux windows must be explicit");
    let first = windows
        .first()
        .expect("Linux config must define a main window");
    assert!(
        first.get("titleBarStyle").is_none(),
        "Linux override must not inherit macOS titleBarStyle"
    );
    assert_eq!(
        first.get("decorations").and_then(Value::as_bool),
        Some(false)
    );
}

#[test]
fn android_override_is_mobile_only_and_never_bundles_llama_server() {
    let config = read_json("Elephant/backend/tauri/tauri.android.conf.json");
    assert_eq!(
        config
            .pointer("/build/beforeBuildCommand")
            .and_then(Value::as_str),
        Some("pnpm tauri:web:build")
    );

    let resources = config
        .pointer("/bundle/resources")
        .and_then(Value::as_array)
        .expect("Android resources must be explicit");
    assert!(
        resources.is_empty(),
        "Android must not include desktop bin resources"
    );

    let icons = config
        .pointer("/bundle/icon")
        .and_then(Value::as_array)
        .expect("Android icons must be explicit");
    assert_eq!(
        icons.len(),
        1,
        "Android should only use the portable PNG icon"
    );
    assert_eq!(icons[0].as_str(), Some("../../assets/static/icon.png"));
}

#[test]
fn android_scripts_always_use_the_android_config() {
    let package_json = read_json("package.json");
    let scripts = package_json
        .get("scripts")
        .and_then(Value::as_object)
        .expect("package scripts must exist");
    let android_init = scripts
        .get("tauri:android:init")
        .and_then(Value::as_str)
        .unwrap_or("");
    let android_dev = scripts
        .get("tauri:android:dev")
        .and_then(Value::as_str)
        .unwrap_or("");
    assert!(
        android_init.contains("tauri.android.conf.json"),
        "Android init script must use the Android config"
    );
    assert!(
        android_dev.contains("tauri.android.conf.json"),
        "Android dev script must use the Android config"
    );

    let build_script = read_text("build/scripts/build_dev_apk.sh");
    assert!(
        build_script.contains("cargo tauri android init --config \"$ANDROID_CONFIG\""),
        "APK script must initialize Android with the Android config"
    );
    assert!(
        build_script
            .contains("cargo tauri android build --debug --apk --config \"$ANDROID_CONFIG\""),
        "APK script must build Android with the Android config"
    );
    assert!(
        build_script.contains("ELEPHANTNOTE_SKIP_LLAMA_BUNDLE=1"),
        "APK script must skip desktop llama-server bundling"
    );
}

#[test]
fn bundled_llama_runtime_is_desktop_only() {
    let lib_min = read_text("Elephant/backend/tauri/src/lib_min.rs");
    assert!(
        lib_min.contains("#[cfg(not(mobile))]\npub mod local_llama_runtime;"),
        "local_llama_runtime must not be compiled into mobile builds"
    );

    let chat_runtime = read_text("Elephant/backend/tauri/src/chat_runtime.rs");
    assert!(
        chat_runtime.contains("#[cfg(not(mobile))]\nuse crate::local_llama_runtime;"),
        "chat runtime must import local_llama_runtime only on desktop"
    );
    assert!(
        chat_runtime.contains("#[cfg(not(mobile))]\nfn grounded_messages("),
        "grounded desktop prompt assembly must not be required by the mobile chat path"
    );
}

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

use crate::local_runtime::paths::RuntimePaths;

#[derive(Default)]
pub struct OllamaManagerState {
    inner: Mutex<OllamaManagerInner>,
}

#[derive(Default)]
struct OllamaManagerInner {
    child: Option<tokio::process::Child>,
    pid: Option<u32>,
    last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub managed_supported: bool,
    pub managed_installed: bool,
    pub managed_bin_path: Option<String>,
    pub resolved_bin_path: Option<String>,
    pub running: bool,
    pub pid: Option<u32>,
    pub server_version: Option<String>,
    pub managed_version: Option<String>,
    pub latest_version: Option<String>,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GithubReleaseAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GithubRelease {
    tag_name: String,
    assets: Vec<GithubReleaseAsset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OllamaModelInfo {
    pub name: String,
    pub size: Option<u64>,
    pub modified_at: Option<String>,
}

fn normalize_endpoint(endpoint: &str) -> String {
    // Be defensive: users sometimes paste `http:// localhost:11434` (extra whitespace),
    // which makes reqwest reject the URL. Normalize by stripping whitespace.
    let mut e = endpoint.trim().trim_end_matches('/').to_string();
    if e.is_empty() {
        e = "http://127.0.0.1:11434".to_string();
    }
    if let Some((scheme, rest)) = e.split_once("://") {
        // Keep scheme, but trim accidental spaces around it and around the host/path.
        e = format!("{}://{}", scheme.trim(), rest.trim());
    }
    // Remove any remaining whitespace / invisible characters anywhere in the endpoint.
    // Note: some "spaces" (e.g. zero-width) are not considered whitespace by Unicode.
    e = e
        .chars()
        .filter(|c| {
            !c.is_whitespace()
                && !matches!(
                    *c,
                    '\u{200B}' | '\u{FEFF}' | '\u{200E}' | '\u{200F}' // ZWSP/BOM/LRM/RLM
                )
        })
        .collect();
    if !e.starts_with("http://") && !e.starts_with("https://") {
        e = format!("http://{e}");
    }
    e
}

fn endpoint_to_hostport(endpoint: &str) -> String {
    let e = normalize_endpoint(endpoint);
    let e = e
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    let e = e.split('/').next().unwrap_or("127.0.0.1:11434");
    if e.contains(':') {
        e.to_string()
    } else if e.is_empty() {
        "127.0.0.1:11434".to_string()
    } else {
        format!("{e}:11434")
    }
}

fn ollama_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let paths = RuntimePaths::from_app(app)?;
    Ok(paths.root.join("ollama"))
}

fn managed_bin_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = ollama_dir(app)?;
    let bin = if cfg!(windows) {
        "ollama.exe"
    } else {
        "ollama"
    };
    Ok(dir.join(bin))
}

fn is_managed_supported() -> bool {
    // Managed install supported where we can download + extract an official release asset.
    cfg!(target_os = "macos") || cfg!(target_os = "windows") || cfg!(target_os = "linux")
}

async fn file_sha256(path: &Path) -> Result<String, String> {
    let mut hasher = Sha256::new();
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("Failed to open {:?}: {e}", path))?;
    let mut buf = [0u8; 1024 * 64];
    loop {
        let n = file
            .read(&mut buf)
            .await
            .map_err(|e| format!("Failed to read {:?}: {e}", path))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

async fn github_latest_release() -> Result<GithubRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("blinko-tauri")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let url = "https://api.github.com/repos/ollama/ollama/releases/latest";
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch latest release: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "GitHub latest release returned non-success status {}",
            resp.status()
        ));
    }
    resp.json::<GithubRelease>()
        .await
        .map_err(|e| format!("Failed to parse release json: {e}"))
}

async fn download_to_file(url: &str, dest: &Path, app: Option<&AppHandle>) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .user_agent("blinko-tauri")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download {url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Download returned status {} for {url}",
            resp.status()
        ));
    }

    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed creating dir {:?}: {e}", parent))?;
    }

    let total = resp.content_length();
    let mut resp = resp;
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| format!("Failed creating {:?}: {e}", dest))?;
    let mut downloaded: u64 = 0;

    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Download stream error: {e}"))?
    {
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Failed writing {:?}: {e}", dest))?;
        downloaded += chunk.len() as u64;

        if let (Some(app), Some(total)) = (app, total) {
            if total > 0 {
                let p = ((downloaded as f64 / total as f64) * 100.0).round() as i64;
                let p = p.clamp(0, 100) as u8;
                emit_install_progress(app, "download", "Downloading Ollama...", Some(p));
            }
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed flushing {:?}: {e}", dest))?;
    Ok(())
}

async fn parse_sha256sums(url: &str) -> Result<HashMap<String, String>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .user_agent("blinko-tauri")
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to download sha256sums: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("SHA256SUMS returned status {}", resp.status()));
    }
    let text = resp
        .text()
        .await
        .map_err(|e| format!("Failed reading sha256sums: {e}"))?;
    let mut out = HashMap::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        let sha = parts.next().unwrap_or("").to_string();
        let name = parts.next().unwrap_or("").to_string();
        if sha.len() >= 64 && !name.is_empty() {
            out.insert(name, sha);
        }
    }
    Ok(out)
}

fn pick_managed_asset(release: &GithubRelease) -> Option<GithubReleaseAsset> {
    let arch = std::env::consts::ARCH;
    let want_arch = match arch {
        "x86_64" => "amd64",
        "aarch64" => "arm64",
        other => other,
    };

    let mut candidates: Vec<GithubReleaseAsset> = Vec::new();
    for a in release.assets.iter() {
        let name = a.name.to_lowercase();
        if name.contains("rocm") || name.contains("jetpack") {
            continue;
        }

        if cfg!(target_os = "macos") {
            if name.contains("darwin") && (name.ends_with(".tgz") || name.ends_with(".tar.gz")) {
                candidates.push(a.clone());
            }
        } else if cfg!(target_os = "linux") {
            if name.contains("linux")
                && name.contains(want_arch)
                && (name.ends_with(".tgz") || name.ends_with(".tar.gz"))
            {
                candidates.push(a.clone());
            }
        } else if cfg!(target_os = "windows") {
            if name.contains("windows") && name.contains(want_arch) && name.ends_with(".zip") {
                candidates.push(a.clone());
            }
        }
    }

    // Prefer exact names if present.
    if cfg!(target_os = "macos") {
        if let Some(a) = candidates
            .iter()
            .find(|a| a.name == "ollama-darwin.tgz")
            .cloned()
        {
            return Some(a);
        }
    }
    candidates.into_iter().next()
}

async fn extract_tgz_find_bin(
    tgz_path: &Path,
    out_dir: &Path,
    bin_name: &str,
) -> Result<PathBuf, String> {
    let tgz_path = tgz_path.to_path_buf();
    let out_dir = out_dir.to_path_buf();
    let bin_name = bin_name.to_string();

    tokio::task::spawn_blocking(move || -> Result<PathBuf, String> {
        std::fs::create_dir_all(&out_dir)
            .map_err(|e| format!("Failed to create {:?}: {e}", out_dir))?;

        let file = std::fs::File::open(&tgz_path)
            .map_err(|e| format!("Failed to open {:?}: {e}", tgz_path))?;
        let gz = flate2::read::GzDecoder::new(file);
        let mut archive = tar::Archive::new(gz);

        for entry in archive
            .entries()
            .map_err(|e| format!("Failed reading archive entries: {e}"))?
        {
            let mut entry = entry.map_err(|e| format!("Failed reading archive entry: {e}"))?;
            let path = entry
                .path()
                .map_err(|e| format!("Failed to read entry path: {e}"))?
                .to_string_lossy()
                .to_string();
            if path.ends_with(&format!("/{bin_name}")) || path == bin_name {
                let out_path = out_dir.join(&bin_name);
                entry
                    .unpack(&out_path)
                    .map_err(|e| format!("Failed to unpack binary to {:?}: {e}", out_path))?;
                return Ok(out_path);
            }
        }

        Err(format!("Binary {bin_name} not found in archive"))
    })
    .await
    .map_err(|e| format!("Extract task failed: {e}"))?
}

async fn extract_zip_find_bin(
    zip_path: &Path,
    out_dir: &Path,
    bin_name: &str,
) -> Result<PathBuf, String> {
    let zip_path = zip_path.to_path_buf();
    let out_dir = out_dir.to_path_buf();
    let bin_name = bin_name.to_string();

    tokio::task::spawn_blocking(move || -> Result<PathBuf, String> {
        std::fs::create_dir_all(&out_dir)
            .map_err(|e| format!("Failed to create {:?}: {e}", out_dir))?;

        let file = std::fs::File::open(&zip_path)
            .map_err(|e| format!("Failed to open {:?}: {e}", zip_path))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read zip archive {:?}: {e}", zip_path))?;

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("Failed reading zip entry {i}: {e}"))?;
            if !entry.is_file() {
                continue;
            }
            let name = entry.name().to_string();
            if name.ends_with(&format!("/{bin_name}")) || name == bin_name {
                let out_path = out_dir.join(&bin_name);
                let mut out = std::fs::File::create(&out_path)
                    .map_err(|e| format!("Failed to create {:?}: {e}", out_path))?;
                std::io::copy(&mut entry, &mut out)
                    .map_err(|e| format!("Failed to extract {:?}: {e}", out_path))?;
                return Ok(out_path);
            }
        }

        Err(format!("Binary {bin_name} not found in zip"))
    })
    .await
    .map_err(|e| format!("Extract task failed: {e}"))?
}

async fn resolve_bin(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let managed = managed_bin_path(app)?;
    if managed.exists() {
        return Ok(Some(managed));
    }

    let exe = if cfg!(windows) {
        "ollama.exe"
    } else {
        "ollama"
    };
    if let Some(paths) = std::env::var_os("PATH") {
        for p in std::env::split_paths(&paths) {
            let candidate = p.join(exe);
            if candidate.exists() {
                return Ok(Some(candidate));
            }
        }
    }
    Ok(None)
}

async fn run_bin_version(bin: &Path) -> Option<String> {
    let output = Command::new(bin)
        .arg("--version")
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output()
        .await
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

async fn probe_server_version(endpoint: &str) -> Option<String> {
    let endpoint = normalize_endpoint(endpoint);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok()?;

    let resp = client
        .get(format!("{endpoint}/api/version"))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v = resp.json::<serde_json::Value>().await.ok()?;
    v.get("version")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

async fn wait_ready(endpoint: &str, timeout: Duration) -> Result<Option<String>, String> {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        if let Some(v) = probe_server_version(endpoint).await {
            return Ok(Some(v));
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    Ok(None)
}

#[tauri::command]
pub async fn ollama_status(
    app: AppHandle,
    state: State<'_, OllamaManagerState>,
    endpoint: Option<String>,
) -> Result<OllamaStatus, String> {
    let endpoint = endpoint
        .map(|e| normalize_endpoint(&e))
        .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());

    let managed_bin = managed_bin_path(&app)?;
    let managed_installed = managed_bin.exists();
    let resolved = resolve_bin(&app).await?;

    let managed_version = if managed_installed {
        run_bin_version(&managed_bin).await
    } else {
        None
    };

    let server_version = probe_server_version(&endpoint).await;
    let running = server_version.is_some();

    let inner = state.inner.lock().await;

    Ok(OllamaStatus {
        managed_supported: is_managed_supported(),
        managed_installed,
        managed_bin_path: if managed_installed {
            Some(managed_bin.to_string_lossy().to_string())
        } else {
            None
        },
        resolved_bin_path: resolved.map(|p| p.to_string_lossy().to_string()),
        running,
        pid: inner.pid,
        server_version,
        managed_version,
        latest_version: None,
        last_error: inner.last_error.clone(),
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct InstallProgressPayload {
    stage: String,
    message: String,
    percent: Option<u8>,
}

fn emit_install_progress(app: &AppHandle, stage: &str, message: &str, percent: Option<u8>) {
    let _ = app.emit(
        "ollama:install-progress",
        InstallProgressPayload {
            stage: stage.to_string(),
            message: message.to_string(),
            percent,
        },
    );
}

#[tauri::command]
pub async fn ollama_install_managed(app: AppHandle) -> Result<OllamaStatus, String> {
    if !is_managed_supported() {
        return Err("Managed Ollama install is not supported on this platform yet.".to_string());
    }

    let out_dir = ollama_dir(&app)?;
    tokio::fs::create_dir_all(&out_dir)
        .await
        .map_err(|e| format!("Failed to create {:?}: {e}", out_dir))?;

    emit_install_progress(&app, "release", "Fetching latest release info...", Some(5));
    let release = github_latest_release().await?;
    let latest_version = release.tag_name.clone();

    let asset = pick_managed_asset(&release)
        .ok_or_else(|| "No compatible Ollama asset found for this platform.".to_string())?;
    let sha_asset = release
        .assets
        .iter()
        .find(|a| a.name.to_lowercase().contains("sha256"))
        .cloned();

    let expected_sha = if let Some(sha_asset) = sha_asset {
        emit_install_progress(&app, "verify", "Downloading SHA256SUMS...", Some(10));
        let sums = parse_sha256sums(&sha_asset.browser_download_url).await?;
        sums.get(&asset.name).cloned()
    } else {
        None
    };

    let tmp_path = out_dir.join(format!("{}.download", asset.name));
    emit_install_progress(
        &app,
        "download",
        &format!("Downloading {}...", asset.name),
        Some(0),
    );
    download_to_file(&asset.browser_download_url, &tmp_path, Some(&app)).await?;

    if let Some(expected) = expected_sha {
        emit_install_progress(&app, "verify", "Verifying SHA256...", Some(60));
        let got = file_sha256(&tmp_path).await?;
        if got.to_lowercase() != expected.to_lowercase() {
            return Err(format!(
                "SHA256 mismatch for {} (expected {}, got {})",
                asset.name, expected, got
            ));
        }
    }

    emit_install_progress(&app, "extract", "Extracting archive...", Some(75));
    let extract_dir = out_dir.join("extract_tmp");
    if extract_dir.exists() {
        let _ = tokio::fs::remove_dir_all(&extract_dir).await;
    }
    let bin_name = if cfg!(windows) {
        "ollama.exe"
    } else {
        "ollama"
    };
    let extracted = if asset.name.to_lowercase().ends_with(".zip") {
        extract_zip_find_bin(&tmp_path, &extract_dir, bin_name).await?
    } else {
        extract_tgz_find_bin(&tmp_path, &extract_dir, bin_name).await?
    };

    emit_install_progress(&app, "install", "Installing binary...", Some(90));
    let final_path = managed_bin_path(&app)?;
    if final_path.exists() {
        let _ = tokio::fs::remove_file(&final_path).await;
    }
    if let Err(err) = tokio::fs::rename(&extracted, &final_path).await {
        tokio::fs::copy(&extracted, &final_path)
            .await
            .map_err(|e| format!("Failed to copy binary to {:?}: {e}", final_path))?;
        let _ = tokio::fs::remove_file(&extracted).await;
        eprintln!("ollama managed install: rename failed, used copy instead: {err}");
    }

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&final_path, perms)
            .map_err(|e| format!("Failed to set permissions on {:?}: {e}", final_path))?;
    }

    let _ = tokio::fs::remove_file(&tmp_path).await;
    let _ = tokio::fs::remove_dir_all(&extract_dir).await;

    emit_install_progress(&app, "done", "Ollama installed.", Some(100));

    let managed_version = run_bin_version(&final_path).await;
    Ok(OllamaStatus {
        managed_supported: true,
        managed_installed: true,
        managed_bin_path: Some(final_path.to_string_lossy().to_string()),
        resolved_bin_path: Some(final_path.to_string_lossy().to_string()),
        running: false,
        pid: None,
        server_version: None,
        managed_version,
        latest_version: Some(latest_version),
        last_error: None,
    })
}

#[tauri::command]
pub async fn ollama_update_managed(app: AppHandle) -> Result<OllamaStatus, String> {
    ollama_install_managed(app).await
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LogPayload {
    stream: String,
    line: String,
}

fn emit_log(app: &AppHandle, stream: &str, line: &str) {
    let _ = app.emit(
        "ollama:log",
        LogPayload {
            stream: stream.to_string(),
            line: line.to_string(),
        },
    );
}

#[tauri::command]
pub async fn ollama_start(
    app: AppHandle,
    state: State<'_, OllamaManagerState>,
    endpoint: Option<String>,
) -> Result<OllamaStatus, String> {
    let endpoint = endpoint
        .map(|e| normalize_endpoint(&e))
        .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());

    if probe_server_version(&endpoint).await.is_some() {
        return ollama_status(app, state, Some(endpoint)).await;
    }

    let bin = resolve_bin(&app)
        .await?
        .ok_or_else(|| "Ollama binary not found. Install managed Ollama first, or install Ollama on your system.".to_string())?;

    let hostport = endpoint_to_hostport(&endpoint);
    let models_dir = ollama_dir(&app)?.join("models");
    let _ = tokio::fs::create_dir_all(&models_dir).await;

    let mut cmd = Command::new(&bin);
    cmd.arg("serve");
    cmd.env("OLLAMA_HOST", hostport);
    // Keep managed Ollama data under the app data directory to avoid polluting ~/.ollama.
    cmd.env("OLLAMA_MODELS", models_dir.to_string_lossy().to_string());
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn ollama serve: {e}"))?;

    let pid = child.id();
    {
        let mut inner = state.inner.lock().await;
        inner.pid = pid;
        inner.last_error = None;
    }

    if let Some(stdout) = child.stdout.take() {
        let app_handle = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_log(&app_handle, "stdout", &line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        let app_handle = app.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                emit_log(&app_handle, "stderr", &line);
            }
        });
    }

    {
        let mut inner = state.inner.lock().await;
        inner.child = Some(child);
    }

    let server_version = wait_ready(&endpoint, Duration::from_secs(15)).await?;
    if server_version.is_none() {
        let mut inner = state.inner.lock().await;
        inner.last_error = Some("Ollama did not become ready within timeout.".to_string());
    }

    ollama_status(app, state, Some(endpoint)).await
}

#[tauri::command]
pub async fn ollama_stop(
    app: AppHandle,
    state: State<'_, OllamaManagerState>,
) -> Result<OllamaStatus, String> {
    let mut child = {
        let mut inner = state.inner.lock().await;
        inner.pid = None;
        inner.child.take()
    };

    if child.is_none() {
        let mut inner = state.inner.lock().await;
        inner.last_error = Some("No Ollama process started by Blinko to stop.".to_string());
    }

    if let Some(c) = child.as_mut() {
        let _ = c.kill().await;
        let _ = c.wait().await;
    }

    ollama_status(app, state, None).await
}

#[tauri::command]
pub async fn ollama_list_models(endpoint: Option<String>) -> Result<Vec<OllamaModelInfo>, String> {
    let endpoint = endpoint
        .map(|e| normalize_endpoint(&e))
        .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let resp = client
        .get(format!("{endpoint}/api/tags"))
        .send()
        .await
        .map_err(|e| format!("Failed to query tags: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!(
            "Ollama /api/tags returned status {}",
            resp.status()
        ));
    }
    let v = resp
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse tags json: {e}"))?;
    let models = v
        .get("models")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for m in models {
        let name = m
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        out.push(OllamaModelInfo {
            name,
            size: m.get("size").and_then(|s| s.as_u64()),
            modified_at: m
                .get("modified_at")
                .and_then(|s| s.as_str())
                .map(|s| s.to_string()),
        });
    }
    Ok(out)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PullProgressPayload {
    model: String,
    status: Option<String>,
    completed: Option<u64>,
    total: Option<u64>,
    digest: Option<String>,
    done: bool,
    raw: serde_json::Value,
}

fn emit_pull_progress(app: &AppHandle, payload: PullProgressPayload) {
    let _ = app.emit("ollama:pull-progress", payload);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_endpoint_strips_spaces_and_invisibles() {
        assert_eq!(normalize_endpoint(""), "http://127.0.0.1:11434");
        assert_eq!(
            normalize_endpoint("  http://localhost:11434  "),
            "http://localhost:11434"
        );
        assert_eq!(
            normalize_endpoint("http:// localhost:11434"),
            "http://localhost:11434"
        );
        assert_eq!(
            normalize_endpoint("http://\u{200B}localhost:11434"),
            "http://localhost:11434"
        );
        assert_eq!(
            normalize_endpoint("localhost:11434"),
            "http://localhost:11434"
        );
        assert_eq!(
            normalize_endpoint("127.0.0.1:11434/"),
            "http://127.0.0.1:11434"
        );
        assert_eq!(
            normalize_endpoint("https://localhost:11434/"),
            "https://localhost:11434"
        );
    }
}

#[tauri::command]
pub async fn ollama_pull_model(
    app: AppHandle,
    endpoint: Option<String>,
    model: String,
) -> Result<bool, String> {
    let endpoint = endpoint
        .map(|e| normalize_endpoint(&e))
        .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err("Model name is required.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60 * 60))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;

    let resp = client
        .post(format!("{endpoint}/api/pull"))
        .json(&serde_json::json!({ "name": model, "stream": true }))
        .send()
        .await
        .map_err(|e| format!("Failed to start pull: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("Pull returned status {}", resp.status()));
    }

    let mut resp = resp;
    let mut buf: Vec<u8> = Vec::new();

    while let Some(chunk) = resp
        .chunk()
        .await
        .map_err(|e| format!("Pull stream error: {e}"))?
    {
        buf.extend_from_slice(&chunk);

        while let Some(pos) = buf.iter().position(|b| *b == b'\n') {
            let line = buf.drain(..=pos).collect::<Vec<u8>>();
            let line = String::from_utf8_lossy(&line).trim().to_string();
            if line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                let status = v
                    .get("status")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                let completed = v.get("completed").and_then(|n| n.as_u64());
                let total = v.get("total").and_then(|n| n.as_u64());
                let digest = v
                    .get("digest")
                    .and_then(|s| s.as_str())
                    .map(|s| s.to_string());
                let done = v.get("done").and_then(|b| b.as_bool()).unwrap_or(false);
                emit_pull_progress(
                    &app,
                    PullProgressPayload {
                        model: model.clone(),
                        status,
                        completed,
                        total,
                        digest,
                        done,
                        raw: v,
                    },
                );
            }
        }
    }

    Ok(true)
}

#[tauri::command]
pub async fn ollama_delete_model(endpoint: Option<String>, model: String) -> Result<bool, String> {
    let endpoint = endpoint
        .map(|e| normalize_endpoint(&e))
        .unwrap_or_else(|| "http://127.0.0.1:11434".to_string());
    let model = model.trim().to_string();
    if model.is_empty() {
        return Err("Model name is required.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {e}"))?;
    let resp = client
        .post(format!("{endpoint}/api/delete"))
        .json(&serde_json::json!({ "name": model }))
        .send()
        .await
        .map_err(|e| format!("Failed to delete model: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("Delete returned status {}", resp.status()));
    }
    Ok(true)
}

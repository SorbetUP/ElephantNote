use flate2::read::GzDecoder;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  fs,
  io::{Cursor, Read, Write},
  path::{Path, PathBuf},
  process::Command,
  time::{SystemTime, UNIX_EPOCH},
};
use tar::Archive;
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

const MAX_RELEASE_BYTES: u64 = 256 * 1024 * 1024;
const GITHUB_API_VERSION: &str = "2022-11-28";
const REPOSITORY: &str = "openai/codex";

type R<T> = Result<T, String>;

#[derive(Clone, Debug)]
pub struct ManagedCodexRuntime {
  pub path: PathBuf,
  pub version: String,
  pub release: String,
  pub asset: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallManifest {
  repository: String,
  release: String,
  asset: String,
  sha256: String,
  installed_at_unix_ms: u128,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
  tag_name: String,
  assets: Vec<GithubAsset>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
  name: String,
  browser_download_url: String,
  size: u64,
  digest: Option<String>,
}

fn log(stage: &str, message: impl AsRef<str>) {
  eprintln!("[Codex][installer][{stage}] {}", message.as_ref());
}

fn executable_name() -> &'static str {
  if cfg!(windows) { "codex.exe" } else { "codex" }
}

fn runtime_root(app: &AppHandle) -> R<PathBuf> {
  app
    .path()
    .app_data_dir()
    .map_err(|error| format!("Unable to resolve ElephantNote app data directory: {error}"))
    .map(|root| root.join("runtimes").join("codex"))
}

fn managed_executable(app: &AppHandle) -> R<PathBuf> {
  Ok(runtime_root(app)?.join("bin").join(executable_name()))
}

fn manifest_path(app: &AppHandle) -> R<PathBuf> {
  Ok(runtime_root(app)?.join("install.json"))
}

fn executable_version(path: &Path) -> Option<String> {
  let output = Command::new(path).arg("--version").output().ok()?;
  if !output.status.success() {
    return None;
  }
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  let value = if stdout.is_empty() { stderr } else { stdout };
  (!value.is_empty()).then_some(value)
}

pub fn existing(app: &AppHandle) -> Option<ManagedCodexRuntime> {
  let path = managed_executable(app).ok()?;
  let version = executable_version(&path)?;
  let manifest = fs::read(manifest_path(app).ok()?)
    .ok()
    .and_then(|bytes| serde_json::from_slice::<InstallManifest>(&bytes).ok());
  Some(ManagedCodexRuntime {
    path,
    version,
    release: manifest.as_ref().map(|item| item.release.clone()).unwrap_or_default(),
    asset: manifest.as_ref().map(|item| item.asset.clone()).unwrap_or_default(),
  })
}

pub fn ensure_installed(app: AppHandle) -> R<ManagedCodexRuntime> {
  if let Some(runtime) = existing(&app) {
    log(
      "reuse",
      format!(
        "path={} version={} release={} asset={}",
        runtime.path.display(),
        runtime.version,
        runtime.release,
        runtime.asset
      ),
    );
    return Ok(runtime);
  }

  let root = runtime_root(&app)?;
  fs::create_dir_all(&root).map_err(|error| format!("Unable to create {}: {error}", root.display()))?;
  let client = Client::builder()
    .user_agent(format!("ElephantNote/{} codex-runtime-installer", env!("CARGO_PKG_VERSION")))
    .build()
    .map_err(|error| error.to_string())?;

  let release_url = format!("https://api.github.com/repos/{REPOSITORY}/releases/latest");
  log("release", format!("fetch url={release_url}"));
  let release = client
    .get(&release_url)
    .header("Accept", "application/vnd.github+json")
    .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
    .send()
    .map_err(|error| format!("Unable to fetch Codex release metadata: {error}"))?
    .error_for_status()
    .map_err(|error| format!("Codex release metadata request failed: {error}"))?
    .json::<GithubRelease>()
    .map_err(|error| format!("Invalid Codex release metadata: {error}"))?;
  let asset = select_asset(&release.assets)?;
  if asset.size == 0 || asset.size > MAX_RELEASE_BYTES {
    return Err(format!("Refusing Codex asset with unexpected size: {} bytes", asset.size));
  }
  let expected_digest = asset
    .digest
    .as_deref()
    .and_then(|value| value.strip_prefix("sha256:"))
    .filter(|value| value.len() == 64)
    .ok_or_else(|| format!("GitHub did not provide a SHA-256 digest for Codex asset {}.", asset.name))?
    .to_ascii_lowercase();

  log(
    "download",
    format!("release={} asset={} bytes={}", release.tag_name, asset.name, asset.size),
  );
  let bytes = client
    .get(&asset.browser_download_url)
    .header("Accept", "application/octet-stream")
    .send()
    .map_err(|error| format!("Unable to download Codex asset {}: {error}", asset.name))?
    .error_for_status()
    .map_err(|error| format!("Codex runtime download failed: {error}"))?
    .bytes()
    .map_err(|error| format!("Unable to read Codex runtime bytes: {error}"))?;
  if bytes.len() as u64 != asset.size {
    return Err(format!(
      "Downloaded Codex asset size mismatch: expected {}, got {}.",
      asset.size,
      bytes.len()
    ));
  }
  let actual_digest = format!("{:x}", Sha256::digest(&bytes));
  if actual_digest != expected_digest {
    return Err(format!(
      "SHA-256 mismatch for Codex asset {}: expected {}, got {}.",
      asset.name, expected_digest, actual_digest
    ));
  }
  log("verify", format!("sha256={} status=ok", actual_digest));

  let binary = extract_runtime_binary(&asset.name, &bytes)?;
  let executable = managed_executable(&app)?;
  let bin_dir = executable.parent().ok_or_else(|| "Managed Codex path has no parent.".to_string())?;
  fs::create_dir_all(bin_dir).map_err(|error| format!("Unable to create {}: {error}", bin_dir.display()))?;
  let temp = executable.with_extension(format!("download-{}", std::process::id()));
  {
    let mut file = fs::File::create(&temp).map_err(|error| format!("Unable to create {}: {error}", temp.display()))?;
    file.write_all(&binary).map_err(|error| format!("Unable to write {}: {error}", temp.display()))?;
    file.sync_all().map_err(|error| format!("Unable to sync {}: {error}", temp.display()))?;
  }
  set_executable(&temp)?;
  let version = executable_version(&temp).ok_or_else(|| {
    let _ = fs::remove_file(&temp);
    "Downloaded Codex binary failed its --version validation.".to_string()
  })?;
  if executable.exists() {
    fs::remove_file(&executable).map_err(|error| format!("Unable to replace {}: {error}", executable.display()))?;
  }
  fs::rename(&temp, &executable).map_err(|error| format!("Unable to activate {}: {error}", executable.display()))?;

  let manifest = InstallManifest {
    repository: REPOSITORY.to_string(),
    release: release.tag_name.clone(),
    asset: asset.name.clone(),
    sha256: actual_digest,
    installed_at_unix_ms: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
  };
  let manifest_file = manifest_path(&app)?;
  fs::write(
    &manifest_file,
    serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
  )
  .map_err(|error| format!("Unable to write {}: {error}", manifest_file.display()))?;

  log(
    "complete",
    format!(
      "release={} asset={} path={} version={}",
      release.tag_name,
      asset.name,
      executable.display(),
      version
    ),
  );
  Ok(ManagedCodexRuntime {
    path: executable,
    version,
    release: release.tag_name,
    asset: asset.name.clone(),
  })
}

fn select_asset(assets: &[GithubAsset]) -> R<&GithubAsset> {
  let mut candidates = assets
    .iter()
    .filter(|asset| asset.size > 0 && asset.size <= MAX_RELEASE_BYTES)
    .filter(|asset| asset_score(&asset.name) > 0)
    .collect::<Vec<_>>();
  candidates.sort_by_key(|asset| std::cmp::Reverse(asset_score(&asset.name)));
  candidates.into_iter().next().ok_or_else(|| {
    format!(
      "No official Codex runtime asset matches platform {} / architecture {}.",
      std::env::consts::OS,
      std::env::consts::ARCH
    )
  })
}

fn asset_score(name: &str) -> i32 {
  let lower = name.to_ascii_lowercase();
  if lower.contains("desktop") || lower.contains("source") || lower.ends_with(".sigstore") || lower.ends_with(".zst") {
    return 0;
  }
  let archive_score = if lower.ends_with(".zip") {
    30
  } else if lower.ends_with(".tar.gz") {
    25
  } else {
    0
  };
  if archive_score == 0 || !lower.starts_with("codex-") {
    return 0;
  }
  let os_score = match std::env::consts::OS {
    "macos" if lower.contains("apple-darwin") || lower.contains("darwin-") => 100,
    "linux" if lower.contains("linux") => 100,
    "windows" if lower.contains("windows") || lower.contains("pc-windows-msvc") => 100,
    _ => 0,
  };
  let arch_score = match std::env::consts::ARCH {
    "x86_64" if lower.contains("x86_64") || lower.contains("x64") => 80,
    "aarch64" if lower.contains("aarch64") || lower.contains("arm64") => 80,
    _ => 0,
  };
  if os_score == 0 || arch_score == 0 {
    return 0;
  }
  let libc_score = if cfg!(target_os = "linux") && lower.contains("musl") { 20 } else { 0 };
  let baseline_penalty = if lower.contains("baseline") { -5 } else { 0 };
  os_score + arch_score + archive_score + libc_score + baseline_penalty
}

fn binary_candidate_score(path: &Path) -> i32 {
  let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
    return 0;
  };
  let lower = name.to_ascii_lowercase();
  if lower == executable_name() {
    return 100;
  }
  let stem = lower.trim_end_matches(".exe");
  if stem == "codex" {
    return 90;
  }
  if stem.starts_with("codex-") && !stem.contains("proxy") && !stem.contains("sandbox") && !stem.contains("lint") {
    return 50;
  }
  0
}

fn extract_runtime_binary(asset_name: &str, bytes: &[u8]) -> R<Vec<u8>> {
  if asset_name.to_ascii_lowercase().ends_with(".zip") {
    extract_zip_binary(bytes)
  } else if asset_name.to_ascii_lowercase().ends_with(".tar.gz") {
    extract_tar_gz_binary(bytes)
  } else {
    Err(format!("Unsupported Codex archive format: {asset_name}"))
  }
}

fn extract_zip_binary(bytes: &[u8]) -> R<Vec<u8>> {
  let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|error| format!("Invalid ZIP runtime archive: {error}"))?;
  let mut best: Option<(i32, Vec<u8>)> = None;
  for index in 0..archive.len() {
    let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
    if entry.is_dir() || entry.size() > MAX_RELEASE_BYTES {
      continue;
    }
    let Some(path) = entry.enclosed_name() else {
      continue;
    };
    let score = binary_candidate_score(&path);
    if score == 0 || best.as_ref().is_some_and(|(current, _)| *current >= score) {
      continue;
    }
    let mut output = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut output).map_err(|error| error.to_string())?;
    best = Some((score, output));
  }
  best.map(|(_, bytes)| bytes).ok_or_else(|| "Codex executable was not found in ZIP archive.".to_string())
}

fn extract_tar_gz_binary(bytes: &[u8]) -> R<Vec<u8>> {
  let decoder = GzDecoder::new(Cursor::new(bytes));
  let mut archive = Archive::new(decoder);
  let mut best: Option<(i32, Vec<u8>)> = None;
  for entry in archive.entries().map_err(|error| format!("Invalid tar.gz runtime archive: {error}"))? {
    let mut entry = entry.map_err(|error| error.to_string())?;
    if !entry.header().entry_type().is_file() || entry.size() > MAX_RELEASE_BYTES {
      continue;
    }
    let path = entry.path().map_err(|error| error.to_string())?.to_path_buf();
    if path.is_absolute() || path.components().any(|component| matches!(component, std::path::Component::ParentDir)) {
      continue;
    }
    let score = binary_candidate_score(&path);
    if score == 0 || best.as_ref().is_some_and(|(current, _)| *current >= score) {
      continue;
    }
    let mut output = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut output).map_err(|error| error.to_string())?;
    best = Some((score, output));
  }
  best.map(|(_, bytes)| bytes).ok_or_else(|| "Codex executable was not found in tar.gz archive.".to_string())
}

#[cfg(unix)]
fn set_executable(path: &Path) -> R<()> {
  use std::os::unix::fs::PermissionsExt;
  let mut permissions = fs::metadata(path).map_err(|error| error.to_string())?.permissions();
  permissions.set_mode(0o755);
  fs::set_permissions(path, permissions).map_err(|error| error.to_string())
}

#[cfg(not(unix))]
fn set_executable(_path: &Path) -> R<()> {
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn asset(name: &str) -> GithubAsset {
    GithubAsset {
      name: name.to_string(),
      browser_download_url: "https://example.invalid/runtime".to_string(),
      size: 1024,
      digest: Some(format!("sha256:{}", "0".repeat(64))),
    }
  }

  #[test]
  fn selects_current_platform_asset() {
    let assets = vec![
      asset("codex-x86_64-pc-windows-msvc.zip"),
      asset("codex-aarch64-apple-darwin.tar.gz"),
      asset("codex-x86_64-unknown-linux-musl.tar.gz"),
      asset("codex-aarch64-unknown-linux-musl.tar.gz"),
    ];
    let selected = select_asset(&assets).unwrap();
    assert!(asset_score(&selected.name) > 0);
  }

  #[test]
  fn rejects_desktop_and_signature_assets() {
    assert_eq!(asset_score("codex-desktop-darwin-arm64.zip"), 0);
    assert_eq!(asset_score("codex-aarch64-apple-darwin.sigstore"), 0);
  }
}

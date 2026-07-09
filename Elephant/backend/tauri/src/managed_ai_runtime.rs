use flate2::read::GzDecoder;
use reqwest::blocking::Client;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
  collections::HashMap,
  fs,
  io::{Cursor, Read, Write},
  path::{Path, PathBuf},
  process::Command,
  sync::{Arc, Mutex, OnceLock, RwLock},
  time::{SystemTime, UNIX_EPOCH},
};
use tar::Archive;
use tauri::{AppHandle, Manager};
use zip::ZipArchive;

pub type R<T> = Result<T, String>;
const MAX_RELEASE_BYTES: u64 = 256 * 1024 * 1024;
const GITHUB_API_VERSION: &str = "2022-11-28";
static RUNTIME_EXECUTABLES: OnceLock<RwLock<HashMap<ManagedProvider, PathBuf>>> = OnceLock::new();

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub enum ManagedProvider {
  Codex,
  OpenCode,
}

impl ManagedProvider {
  pub fn id(self) -> &'static str {
    match self {
      Self::Codex => "codex",
      Self::OpenCode => "opencode",
    }
  }

  fn repository(self) -> &'static str {
    match self {
      Self::Codex => "openai/codex",
      Self::OpenCode => "anomalyco/opencode",
    }
  }

  fn executable_name(self) -> &'static str {
    match (self, cfg!(windows)) {
      (Self::Codex, true) => "codex.exe",
      (Self::Codex, false) => "codex",
      (Self::OpenCode, true) => "opencode.exe",
      (Self::OpenCode, false) => "opencode",
    }
  }

  fn version_argument(self) -> &'static str {
    "--version"
  }
}

fn runtime_registry() -> &'static RwLock<HashMap<ManagedProvider, PathBuf>> {
  RUNTIME_EXECUTABLES.get_or_init(|| RwLock::new(HashMap::new()))
}

pub fn register_runtime_executable(provider: ManagedProvider, path: PathBuf) {
  if let Ok(mut registry) = runtime_registry().write() {
    registry.insert(provider, path);
  }
}

pub fn resolve_runtime_executable(provider: ManagedProvider) -> Option<PathBuf> {
  let registered = runtime_registry()
    .read()
    .ok()
    .and_then(|registry| registry.get(&provider).cloned())
    .filter(|path| path.is_file() && executable_version(path, provider).is_some());
  registered.or_else(|| {
    which::which(provider.executable_name())
      .ok()
      .filter(|path| executable_version(path, provider).is_some())
  })
}

#[derive(Clone)]
pub struct ManagedRuntimeInstaller {
  root: PathBuf,
  install_lock: Arc<Mutex<()>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
  pub provider: String,
  pub installed: bool,
  pub managed_installed: bool,
  pub system_installed: bool,
  pub executable: Option<String>,
  pub version: Option<String>,
  pub manifest: Option<InstallManifest>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
  pub provider: String,
  pub installed: bool,
  pub reused: bool,
  pub executable: String,
  pub version: String,
  pub release: String,
  pub asset: String,
  pub sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallManifest {
  pub provider: String,
  pub repository: String,
  pub release: String,
  pub asset: String,
  pub sha256: String,
  pub installed_at_unix_ms: u128,
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

impl ManagedRuntimeInstaller {
  pub fn new(app: &AppHandle) -> R<Self> {
    let root = app
      .path()
      .app_data_dir()
      .map_err(|error| format!("Unable to resolve ElephantNote app data directory: {error}"))?
      .join("runtimes");
    fs::create_dir_all(&root).map_err(|error| format!("Unable to create runtime directory {}: {error}", root.display()))?;
    let installer = Self { root, install_lock: Arc::new(Mutex::new(())) };
    installer.register_valid_managed_binaries();
    Ok(installer)
  }

  #[cfg(test)]
  pub fn for_test(root: PathBuf) -> R<Self> {
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(Self { root, install_lock: Arc::new(Mutex::new(())) })
  }

  fn register_valid_managed_binaries(&self) {
    for provider in [ManagedProvider::Codex, ManagedProvider::OpenCode] {
      let path = self.managed_executable(provider);
      if path.is_file() && executable_version(&path, provider).is_some() {
        register_runtime_executable(provider, path);
      }
    }
  }

  pub fn managed_executable(&self, provider: ManagedProvider) -> PathBuf {
    self.root.join(provider.id()).join("bin").join(provider.executable_name())
  }

  fn manifest_path(&self, provider: ManagedProvider) -> PathBuf {
    self.root.join(provider.id()).join("install.json")
  }

  pub fn resolve_existing(&self, provider: ManagedProvider) -> Option<PathBuf> {
    let managed = self.managed_executable(provider);
    if managed.is_file() && executable_version(&managed, provider).is_some() {
      register_runtime_executable(provider, managed.clone());
      return Some(managed);
    }
    resolve_runtime_executable(provider)
  }

  pub fn status(&self, provider: ManagedProvider) -> RuntimeStatus {
    let managed = self.managed_executable(provider);
    let managed_installed = managed.is_file() && executable_version(&managed, provider).is_some();
    if managed_installed {
      register_runtime_executable(provider, managed.clone());
    }
    let system = which::which(provider.executable_name())
      .ok()
      .filter(|path| executable_version(path, provider).is_some());
    let executable = if managed_installed {
      Some(managed)
    } else {
      resolve_runtime_executable(provider)
    };
    let manifest = read_manifest(&self.manifest_path(provider));
    RuntimeStatus {
      provider: provider.id().to_string(),
      installed: executable.is_some(),
      managed_installed,
      system_installed: system.is_some(),
      version: executable.as_ref().and_then(|path| executable_version(path, provider)),
      executable: executable.map(|path| path.to_string_lossy().to_string()),
      manifest,
    }
  }

  pub fn ensure_installed(&self, provider: ManagedProvider) -> R<InstallOutcome> {
    let _guard = self.install_lock.lock().map_err(|_| "AI runtime install lock is poisoned.".to_string())?;
    if let Some(path) = self.resolve_existing(provider) {
      let version = executable_version(&path, provider).unwrap_or_default();
      register_runtime_executable(provider, path.clone());
      let manifest = read_manifest(&self.manifest_path(provider));
      return Ok(InstallOutcome {
        provider: provider.id().to_string(),
        installed: true,
        reused: true,
        executable: path.to_string_lossy().to_string(),
        version,
        release: manifest.as_ref().map(|item| item.release.clone()).unwrap_or_default(),
        asset: manifest.as_ref().map(|item| item.asset.clone()).unwrap_or_default(),
        sha256: manifest.as_ref().map(|item| item.sha256.clone()).unwrap_or_default(),
      });
    }

    let client = Client::builder()
      .user_agent(format!("ElephantNote/{} managed-runtime-installer", env!("CARGO_PKG_VERSION")))
      .build()
      .map_err(|error| error.to_string())?;
    let release_url = format!("https://api.github.com/repos/{}/releases/latest", provider.repository());
    eprintln!("[AI][runtime] install:release provider={} repository={}", provider.id(), provider.repository());
    let release = client
      .get(&release_url)
      .header("Accept", "application/vnd.github+json")
      .header("X-GitHub-Api-Version", GITHUB_API_VERSION)
      .send()
      .map_err(|error| format!("Unable to fetch {} release metadata: {error}", provider.id()))?
      .error_for_status()
      .map_err(|error| format!("GitHub release metadata failed for {}: {error}", provider.id()))?
      .json::<GithubRelease>()
      .map_err(|error| format!("Invalid GitHub release metadata for {}: {error}", provider.id()))?;
    let asset = select_asset(provider, &release.assets)?;
    if asset.size == 0 || asset.size > MAX_RELEASE_BYTES {
      return Err(format!("Refusing {} release asset with unexpected size: {} bytes", provider.id(), asset.size));
    }
    let expected_digest = asset
      .digest
      .as_deref()
      .and_then(|value| value.strip_prefix("sha256:"))
      .filter(|value| value.len() == 64)
      .ok_or_else(|| format!("GitHub did not provide a SHA-256 digest for {} asset {}.", provider.id(), asset.name))?
      .to_ascii_lowercase();

    eprintln!(
      "[AI][runtime] install:download provider={} release={} asset={} bytes={}",
      provider.id(), release.tag_name, asset.name, asset.size
    );
    let bytes = client
      .get(&asset.browser_download_url)
      .header("Accept", "application/octet-stream")
      .send()
      .map_err(|error| format!("Unable to download {} asset {}: {error}", provider.id(), asset.name))?
      .error_for_status()
      .map_err(|error| format!("Runtime download failed for {}: {error}", provider.id()))?
      .bytes()
      .map_err(|error| format!("Unable to read {} runtime bytes: {error}", provider.id()))?;
    if bytes.len() as u64 != asset.size {
      return Err(format!(
        "Downloaded {} asset size mismatch: expected {}, got {}.",
        provider.id(), asset.size, bytes.len()
      ));
    }
    let actual_digest = format!("{:x}", Sha256::digest(&bytes));
    if actual_digest != expected_digest {
      return Err(format!(
        "SHA-256 mismatch for {} asset {}: expected {}, got {}.",
        provider.id(), asset.name, expected_digest, actual_digest
      ));
    }

    let asset_name = asset.name.clone();
    let binary = extract_runtime_binary(provider, &asset_name, &bytes)?;
    let executable = self.managed_executable(provider);
    let bin_dir = executable.parent().ok_or_else(|| "Managed runtime binary path has no parent.".to_string())?;
    fs::create_dir_all(bin_dir).map_err(|error| format!("Unable to create {}: {error}", bin_dir.display()))?;
    let temp = executable.with_extension(format!("download-{}", std::process::id()));
    {
      let mut file = fs::File::create(&temp).map_err(|error| format!("Unable to create {}: {error}", temp.display()))?;
      file.write_all(&binary).map_err(|error| format!("Unable to write {}: {error}", temp.display()))?;
      file.sync_all().map_err(|error| format!("Unable to sync {}: {error}", temp.display()))?;
    }
    set_executable(&temp)?;
    let version = executable_version(&temp, provider).ok_or_else(|| {
      let _ = fs::remove_file(&temp);
      format!("Downloaded {} binary failed its --version validation.", provider.id())
    })?;
    if executable.exists() {
      fs::remove_file(&executable).map_err(|error| format!("Unable to replace {}: {error}", executable.display()))?;
    }
    fs::rename(&temp, &executable).map_err(|error| format!("Unable to activate {}: {error}", executable.display()))?;
    register_runtime_executable(provider, executable.clone());

    let release_tag = release.tag_name.clone();
    let manifest = InstallManifest {
      provider: provider.id().to_string(),
      repository: provider.repository().to_string(),
      release: release_tag.clone(),
      asset: asset_name.clone(),
      sha256: actual_digest.clone(),
      installed_at_unix_ms: SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis(),
    };
    let manifest_path = self.manifest_path(provider);
    if let Some(parent) = manifest_path.parent() {
      fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(
      &manifest_path,
      serde_json::to_vec_pretty(&manifest).map_err(|error| error.to_string())?,
    )
    .map_err(|error| format!("Unable to write {}: {error}", manifest_path.display()))?;
    eprintln!(
      "[AI][runtime] install:complete provider={} release={} executable={} version={}",
      provider.id(), release_tag, executable.display(), version
    );
    Ok(InstallOutcome {
      provider: provider.id().to_string(),
      installed: true,
      reused: false,
      executable: executable.to_string_lossy().to_string(),
      version,
      release: release_tag,
      asset: asset_name,
      sha256: actual_digest,
    })
  }
}

fn read_manifest(path: &Path) -> Option<InstallManifest> {
  let bytes = fs::read(path).ok()?;
  serde_json::from_slice(&bytes).ok()
}

fn executable_version(path: &Path, provider: ManagedProvider) -> Option<String> {
  let output = Command::new(path).arg(provider.version_argument()).output().ok()?;
  if !output.status.success() {
    return None;
  }
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  let value = if stdout.is_empty() { stderr } else { stdout };
  (!value.is_empty()).then_some(value)
}

fn select_asset<'a>(provider: ManagedProvider, assets: &'a [GithubAsset]) -> R<&'a GithubAsset> {
  let mut candidates = assets
    .iter()
    .filter(|asset| asset.size > 0 && asset.size <= MAX_RELEASE_BYTES)
    .filter(|asset| asset_score(provider, &asset.name) > 0)
    .collect::<Vec<_>>();
  candidates.sort_by_key(|asset| std::cmp::Reverse(asset_score(provider, &asset.name)));
  candidates.into_iter().next().ok_or_else(|| {
    format!(
      "No official {} runtime asset matches platform {} / architecture {}.",
      provider.id(),
      std::env::consts::OS,
      std::env::consts::ARCH
    )
  })
}

fn asset_score(provider: ManagedProvider, name: &str) -> i32 {
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
  if archive_score == 0 {
    return 0;
  }
  let prefix = match provider {
    ManagedProvider::Codex => "codex-",
    ManagedProvider::OpenCode => "opencode-",
  };
  if !lower.starts_with(prefix) {
    return 0;
  }
  let os_score = match std::env::consts::OS {
    "macos" if lower.contains("apple-darwin") || lower.contains("darwin-") => 100,
    "linux" if lower.contains("linux") => 100,
    "windows" if lower.contains("windows") || lower.contains("pc-windows-msvc") => 100,
    _ => 0,
  };
  if os_score == 0 {
    return 0;
  }
  let arch_score = match std::env::consts::ARCH {
    "x86_64" if lower.contains("x86_64") || lower.contains("x64") => 80,
    "aarch64" if lower.contains("aarch64") || lower.contains("arm64") => 80,
    _ => 0,
  };
  if arch_score == 0 {
    return 0;
  }
  let libc_score = if provider == ManagedProvider::Codex && cfg!(target_os = "linux") && lower.contains("musl") {
    20
  } else {
    0
  };
  let baseline_penalty = if lower.contains("baseline") { -5 } else { 0 };
  os_score + arch_score + archive_score + libc_score + baseline_penalty
}

fn extract_runtime_binary(provider: ManagedProvider, asset_name: &str, bytes: &[u8]) -> R<Vec<u8>> {
  if asset_name.to_ascii_lowercase().ends_with(".zip") {
    extract_zip_binary(provider, bytes)
  } else if asset_name.to_ascii_lowercase().ends_with(".tar.gz") {
    extract_tar_gz_binary(provider, bytes)
  } else {
    Err(format!("Unsupported runtime archive format: {asset_name}"))
  }
}

fn binary_candidate_score(provider: ManagedProvider, path: &Path) -> i32 {
  let Some(name) = path.file_name().and_then(|value| value.to_str()) else { return 0; };
  let lower = name.to_ascii_lowercase();
  let exact = provider.executable_name().to_ascii_lowercase();
  if lower == exact {
    return 100;
  }
  let stem = lower.trim_end_matches(".exe");
  if stem == provider.id() {
    return 90;
  }
  if stem.starts_with(&format!("{}-", provider.id()))
    && !stem.contains("proxy")
    && !stem.contains("sandbox")
    && !stem.contains("lint")
  {
    return 50;
  }
  0
}

fn extract_zip_binary(provider: ManagedProvider, bytes: &[u8]) -> R<Vec<u8>> {
  let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|error| format!("Invalid ZIP runtime archive: {error}"))?;
  let mut best: Option<(i32, Vec<u8>)> = None;
  for index in 0..archive.len() {
    let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
    if entry.is_dir() || entry.size() > MAX_RELEASE_BYTES {
      continue;
    }
    let Some(path) = entry.enclosed_name() else { continue; };
    let score = binary_candidate_score(provider, &path);
    if score == 0 || best.as_ref().is_some_and(|(current, _)| *current >= score) {
      continue;
    }
    let mut output = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut output).map_err(|error| error.to_string())?;
    best = Some((score, output));
  }
  best.map(|(_, bytes)| bytes).ok_or_else(|| format!("{} executable was not found in ZIP archive.", provider.id()))
}

fn extract_tar_gz_binary(provider: ManagedProvider, bytes: &[u8]) -> R<Vec<u8>> {
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
    let score = binary_candidate_score(provider, &path);
    if score == 0 || best.as_ref().is_some_and(|(current, _)| *current >= score) {
      continue;
    }
    let mut output = Vec::with_capacity(entry.size() as usize);
    entry.read_to_end(&mut output).map_err(|error| error.to_string())?;
    best = Some((score, output));
  }
  best.map(|(_, bytes)| bytes).ok_or_else(|| format!("{} executable was not found in tar.gz archive.", provider.id()))
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
  fn selects_only_current_platform_assets() {
    let assets = vec![
      asset("codex-x86_64-pc-windows-msvc.zip"),
      asset("codex-aarch64-apple-darwin.tar.gz"),
      asset("codex-x86_64-unknown-linux-musl.tar.gz"),
      asset("codex-aarch64-unknown-linux-musl.tar.gz"),
    ];
    let selected = select_asset(ManagedProvider::Codex, &assets).unwrap();
    assert!(asset_score(ManagedProvider::Codex, &selected.name) > 0);
  }

  #[test]
  fn rejects_desktop_and_signature_assets() {
    assert_eq!(asset_score(ManagedProvider::OpenCode, "opencode-desktop-linux-amd64.deb"), 0);
    assert_eq!(asset_score(ManagedProvider::Codex, "codex-x86_64-unknown-linux-musl.sigstore"), 0);
  }

  #[test]
  fn runtime_paths_are_isolated_by_provider() {
    let root = std::env::temp_dir().join(format!("elephantnote-runtime-test-{}", std::process::id()));
    let installer = ManagedRuntimeInstaller::for_test(root.clone()).unwrap();
    assert!(installer.managed_executable(ManagedProvider::Codex).ends_with(Path::new("codex/bin/codex")) || cfg!(windows));
    assert_ne!(installer.managed_executable(ManagedProvider::Codex), installer.managed_executable(ManagedProvider::OpenCode));
    let _ = fs::remove_dir_all(root);
  }
}

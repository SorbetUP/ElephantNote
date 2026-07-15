use serde::Deserialize;
use serde_json::Value;
use std::{
  collections::{BTreeMap, BTreeSet},
  fs,
  io::{Read, Write},
  path::{Component, Path, PathBuf},
  time::Duration,
};
use tauri::{AppHandle, State};
use url::Url;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{
  addon_catalog::CatalogAddon,
  addons::{self, AddonState, InstalledAddon},
};

type R<T> = Result<T, String>;
const INTEGRATED_CATALOG: &str = include_str!("../../../../addons/catalog.json");
// The repair branch is intentionally used while PR #84 validates installation on
// Android and desktop. Change this to develop_next when the branch is merged.
const OFFICIAL_ROOT: &str = "https://raw.githubusercontent.com/SorbetUP/ElephantNote/develop_next-integration-repair/addons/";
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_ENTRY_BYTES: u64 = 8 * 1024 * 1024;
const MAX_PACKAGE_FILE_BYTES: u64 = 128 * 1024 * 1024;

#[derive(Deserialize)]
struct IntegratedCatalog {
  addons: Vec<CatalogAddon>,
}

fn catalog() -> R<Vec<CatalogAddon>> {
  let parsed: IntegratedCatalog = serde_json::from_str(INTEGRATED_CATALOG)
    .map_err(|error| format!("Invalid integrated official addon catalogue: {error}"))?;
  for item in &parsed.addons {
    if !item.official || !item.id.starts_with("elephant.") {
      return Err(format!("Integrated catalogue contains a non-official addon: {}", item.id));
    }
    safe_official_path(&item.manifest_path)?;
    safe_official_path(&item.entry_path)?;
  }
  Ok(parsed.addons)
}

fn safe_official_path(value: &str) -> R<String> {
  let path = Path::new(value);
  if value.trim().is_empty() || path.is_absolute() {
    return Err("Official addon paths must be safe relative paths.".to_string());
  }
  let mut parts = Vec::new();
  for component in path.components() {
    match component {
      Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
      Component::CurDir => {}
      Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
        return Err(format!("Unsafe official addon path: {value}"));
      }
    }
  }
  let normalized = parts.join("/");
  if !normalized.starts_with("official/") {
    return Err(format!("Official addon path escaped the official package root: {value}"));
  }
  Ok(normalized)
}

fn fetch_official_bytes(relative_path: &str, max_bytes: u64) -> R<Vec<u8>> {
  let relative_path = safe_official_path(relative_path)?;
  let root = Url::parse(OFFICIAL_ROOT).map_err(|error| error.to_string())?;
  let url = root.join(&relative_path).map_err(|error| error.to_string())?;
  if url.scheme() != "https"
    || url.host_str() != Some("raw.githubusercontent.com")
    || !url.path().starts_with("/SorbetUP/ElephantNote/develop_next-integration-repair/addons/official/")
  {
    return Err("Official addon URL escaped the trusted repository branch.".to_string());
  }
  let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(90))
    .redirect(reqwest::redirect::Policy::none())
    .build()
    .map_err(|error| error.to_string())?;
  let mut response = client
    .get(url)
    .send()
    .map_err(|error| format!("Failed to reach the official addon catalogue: {error}"))?;
  if !response.status().is_success() {
    return Err(format!("Official addon source returned HTTP {} for {relative_path}", response.status()));
  }
  let mut bytes = Vec::new();
  response
    .by_ref()
    .take(max_bytes + 1)
    .read_to_end(&mut bytes)
    .map_err(|error| error.to_string())?;
  if bytes.len() as u64 > max_bytes {
    return Err(format!("Official addon source exceeds the allowed size: {relative_path}"));
  }
  Ok(bytes)
}

fn assert_mobile_compatibility(manifest_bytes: &[u8]) -> R<()> {
  let manifest: Value = serde_json::from_slice(manifest_bytes)
    .map_err(|error| format!("Invalid official addon manifest: {error}"))?;
  let native = manifest.pointer("/permissions/native").and_then(Value::as_bool).unwrap_or(false);
  if !native {
    return Ok(());
  }
  let platform = if cfg!(target_os = "android") {
    "android"
  } else if cfg!(target_os = "ios") {
    "ios"
  } else {
    return Ok(());
  };
  if manifest
    .pointer(&format!("/native/mobile/{platform}/supported"))
    .and_then(Value::as_bool)
    != Some(true)
  {
    let reason = manifest
      .pointer(&format!("/native/mobile/{platform}/reason"))
      .and_then(Value::as_str)
      .unwrap_or("This addon has no native implementation for this mobile platform.");
    return Err(reason.to_string());
  }
  Ok(())
}

fn package_prefix(item: &CatalogAddon) -> R<String> {
  let manifest = safe_official_path(&item.manifest_path)?;
  Path::new(&manifest)
    .parent()
    .map(|path| path.to_string_lossy().replace('\\', "/"))
    .ok_or_else(|| format!("Official addon has no package directory: {}", item.id))
}

fn local_package_directory(item: &CatalogAddon) -> R<PathBuf> {
  let prefix = package_prefix(item)?;
  Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
    .join("../../../addons")
    .join(prefix))
}

fn collect_local_files(root: &Path, current: &Path, files: &mut BTreeMap<String, Vec<u8>>) -> R<()> {
  for entry in fs::read_dir(current).map_err(|error| error.to_string())? {
    let entry = entry.map_err(|error| error.to_string())?;
    let path = entry.path();
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
      continue;
    }
    if metadata.is_dir() {
      if entry.file_name() == "target" || entry.file_name() == "node_modules" {
        continue;
      }
      collect_local_files(root, &path, files)?;
      continue;
    }
    if !metadata.is_file() {
      continue;
    }
    if metadata.len() > MAX_PACKAGE_FILE_BYTES {
      return Err(format!("Official addon package file is too large: {}", path.display()));
    }
    let relative = path
      .strip_prefix(root)
      .map_err(|error| error.to_string())?
      .to_string_lossy()
      .replace('\\', "/");
    files.insert(relative, fs::read(&path).map_err(|error| error.to_string())?);
  }
  Ok(())
}

fn static_relative_imports(source: &str) -> Vec<String> {
  let mut imports = Vec::new();
  for line in source.lines() {
    let trimmed = line.trim();
    if !trimmed.starts_with("import ") {
      continue;
    }
    for quote in ['\'', '"'] {
      let Some(start) = trimmed.find(quote) else { continue };
      let rest = &trimmed[start + 1..];
      let Some(end) = rest.find(quote) else { continue };
      let candidate = &rest[..end];
      if candidate.starts_with('.') {
        imports.push(candidate.to_string());
      }
    }
  }
  imports
}

fn resolve_remote_module(package_prefix: &str, current: &str, specifier: &str) -> R<String> {
  let current_parent = Path::new(current).parent().unwrap_or_else(|| Path::new(""));
  let mut relative = current_parent.join(specifier).to_string_lossy().replace('\\', "/");
  if Path::new(&relative).extension().is_none() {
    relative.push_str(".js");
  }
  let full = format!("{package_prefix}/{relative}");
  let normalized = safe_official_path(&full)?;
  if !normalized.starts_with(&format!("{package_prefix}/")) {
    return Err(format!("Official addon module escaped its package: {specifier}"));
  }
  Ok(normalized)
}

fn current_sidecar_path(manifest: &Value) -> Option<String> {
  let platform = if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
    "macos-aarch64"
  } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
    "macos-x86_64"
  } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
    "linux-x86_64"
  } else if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
    "windows-x86_64"
  } else {
    return None;
  };
  manifest
    .pointer(&format!("/native/sidecars/{platform}"))
    .and_then(Value::as_str)
    .map(str::to_string)
}

fn collect_remote_files(item: &CatalogAddon) -> R<BTreeMap<String, Vec<u8>>> {
  let prefix = package_prefix(item)?;
  let manifest_bytes = fetch_official_bytes(&item.manifest_path, MAX_MANIFEST_BYTES)?;
  assert_mobile_compatibility(&manifest_bytes)?;
  let manifest: Value = serde_json::from_slice(&manifest_bytes).map_err(|error| error.to_string())?;
  let entry_name = manifest
    .pointer("/runtime/entry")
    .and_then(Value::as_str)
    .ok_or_else(|| "Official addon manifest is missing runtime.entry.".to_string())?;

  let mut files = BTreeMap::new();
  files.insert("manifest.json".to_string(), manifest_bytes);
  let mut pending = vec![format!("{prefix}/{entry_name}")];
  let mut visited = BTreeSet::new();
  while let Some(remote_path) = pending.pop() {
    if !visited.insert(remote_path.clone()) {
      continue;
    }
    let bytes = fetch_official_bytes(&remote_path, MAX_ENTRY_BYTES)?;
    let archive_path = remote_path
      .strip_prefix(&format!("{prefix}/"))
      .ok_or_else(|| format!("Official addon path escaped package: {remote_path}"))?
      .to_string();
    if archive_path.ends_with(".js") {
      let source = String::from_utf8_lossy(&bytes);
      for specifier in static_relative_imports(&source) {
        pending.push(resolve_remote_module(&prefix, &archive_path, &specifier)?);
      }
    }
    files.insert(archive_path, bytes);
  }

  if let Some(sidecar) = current_sidecar_path(&manifest) {
    let remote_path = safe_official_path(&format!("{prefix}/{sidecar}"))?;
    files.insert(sidecar, fetch_official_bytes(&remote_path, MAX_PACKAGE_FILE_BYTES)?);
  }
  Ok(files)
}

fn package_files(item: &CatalogAddon) -> R<BTreeMap<String, Vec<u8>>> {
  let local = local_package_directory(item)?;
  if local.is_dir() {
    let manifest_bytes = fs::read(local.join("manifest.json")).map_err(|error| error.to_string())?;
    assert_mobile_compatibility(&manifest_bytes)?;
    let mut files = BTreeMap::new();
    collect_local_files(&local, &local, &mut files)?;
    if files.contains_key("manifest.json") {
      return Ok(files);
    }
  }
  collect_remote_files(item)
}

fn temporary_package(item: &CatalogAddon) -> R<PathBuf> {
  let files = package_files(item)?;
  let path = std::env::temp_dir().join(format!(
    "elephant-official-{}-{}.enaddon",
    item.slug,
    chrono::Utc::now().timestamp_millis()
  ));
  let file = fs::File::create(&path).map_err(|error| error.to_string())?;
  let mut archive = ZipWriter::new(file);
  let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
  for (archive_path, bytes) in files {
    archive.start_file(archive_path, options).map_err(|error| error.to_string())?;
    archive.write_all(&bytes).map_err(|error| error.to_string())?;
  }
  archive.finish().map_err(|error| error.to_string())?;
  Ok(path)
}

#[tauri::command]
pub fn tauri_official_addons_catalog_list() -> R<Vec<CatalogAddon>> {
  catalog()
}

#[tauri::command]
pub fn tauri_official_addons_catalog_install(
  app: AppHandle,
  state: State<'_, AddonState>,
  addon_id: String,
) -> R<InstalledAddon> {
  let item = catalog()?
    .into_iter()
    .find(|item| item.id == addon_id)
    .ok_or_else(|| format!("Unknown official addon: {addon_id}"))?;
  let package_path = temporary_package(&item)?;
  let result = addons::tauri_addons_install(app, state, package_path.to_string_lossy().to_string());
  let _ = fs::remove_file(package_path);
  let mut record = result?;
  record.source = "official".to_string();
  Ok(record)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn integrated_catalog_contains_dashboard_and_mobile_code_execution() {
    let addons = catalog().unwrap();
    assert!(addons.iter().any(|item| item.id == "elephant.dashboard"));
    assert!(addons.iter().any(|item| item.id == "elephant.code-execution"));
    assert!(addons.iter().all(|item| item.official));
  }

  #[test]
  fn local_official_packages_include_manifest_and_entry() {
    for item in catalog().unwrap() {
      let local = local_package_directory(&item).unwrap();
      assert!(local.join("manifest.json").is_file(), "missing manifest for {}", item.id);
      let manifest: Value = serde_json::from_slice(&fs::read(local.join("manifest.json")).unwrap()).unwrap();
      let entry = manifest.pointer("/runtime/entry").and_then(Value::as_str).unwrap();
      assert!(local.join(entry).is_file(), "missing entry for {}", item.id);
    }
  }
}

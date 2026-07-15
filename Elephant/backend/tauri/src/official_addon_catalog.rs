use serde::Deserialize;
use serde_json::Value;
use std::{fs, io::{Read, Write}, path::{Component, Path, PathBuf}, time::Duration};
use tauri::{AppHandle, State};
use url::Url;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::{
  addon_catalog::CatalogAddon,
  addons::{self, AddonState, InstalledAddon},
};

type R<T> = Result<T, String>;
const INTEGRATED_CATALOG: &str = include_str!("../../../../addons/catalog.json");
const OFFICIAL_ROOT: &str = "https://raw.githubusercontent.com/SorbetUP/ElephantNote/develop_next/addons/";
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_ENTRY_BYTES: u64 = 8 * 1024 * 1024;

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
    || !url.path().starts_with("/SorbetUP/ElephantNote/develop_next/addons/official/")
  {
    return Err("Official addon URL escaped the trusted repository branch.".to_string());
  }
  let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(60))
    .redirect(reqwest::redirect::Policy::none())
    .build()
    .map_err(|error| error.to_string())?;
  let mut response = client.get(url).send().map_err(|error| format!("Failed to reach the official addon catalogue: {error}"))?;
  if !response.status().is_success() {
    return Err(format!("Official addon source returned HTTP {}", response.status()));
  }
  let mut bytes = Vec::new();
  response
    .by_ref()
    .take(max_bytes + 1)
    .read_to_end(&mut bytes)
    .map_err(|error| error.to_string())?;
  if bytes.len() as u64 > max_bytes {
    return Err("Official addon source exceeds the allowed size.".to_string());
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
    return Err("This official native addon requires a prebuilt desktop package.".to_string());
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

fn temporary_package(item: &CatalogAddon) -> R<PathBuf> {
  let manifest_bytes = fetch_official_bytes(&item.manifest_path, MAX_MANIFEST_BYTES)?;
  assert_mobile_compatibility(&manifest_bytes)?;
  let entry_bytes = fetch_official_bytes(&item.entry_path, MAX_ENTRY_BYTES)?;
  let manifest: Value = serde_json::from_slice(&manifest_bytes).map_err(|error| error.to_string())?;
  let entry_name = manifest
    .pointer("/runtime/entry")
    .and_then(Value::as_str)
    .ok_or_else(|| "Official addon manifest is missing runtime.entry.".to_string())?;
  let path = std::env::temp_dir().join(format!(
    "elephant-official-{}-{}.enaddon",
    item.slug,
    chrono::Utc::now().timestamp_millis()
  ));
  let file = fs::File::create(&path).map_err(|error| error.to_string())?;
  let mut archive = ZipWriter::new(file);
  let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
  archive.start_file("manifest.json", options).map_err(|error| error.to_string())?;
  archive.write_all(&manifest_bytes).map_err(|error| error.to_string())?;
  archive.start_file(entry_name, options).map_err(|error| error.to_string())?;
  archive.write_all(&entry_bytes).map_err(|error| error.to_string())?;
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
  fn integrated_catalog_contains_mobile_code_execution() {
    let addons = catalog().unwrap();
    assert!(addons.iter().any(|item| item.id == "elephant.code-execution"));
    assert!(addons.iter().all(|item| item.official));
  }
}

use serde::{Deserialize, Serialize};
use std::{
  collections::BTreeSet,
  fs,
  io::{Read, Write},
  path::{Component, Path},
  time::Duration,
};
use tauri::{AppHandle, State};
use url::Url;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

use crate::addons::{self, AddonManifest, AddonState, InstalledAddon};

type R<T> = Result<T, String>;

const CATALOG_VERSION: u32 = 1;
const CATALOG_ROOT: &str = "https://raw.githubusercontent.com/SorbetUP/ElephantNote/addon-catalog/";
const MAX_CATALOG_BYTES: u64 = 1024 * 1024;
const MAX_MANIFEST_BYTES: u64 = 256 * 1024;
const MAX_ENTRY_BYTES: u64 = 5 * 1024 * 1024;
const MAX_PACKAGE_BYTES: u64 = 250 * 1024 * 1024;
const BUNDLED_TRUSTED_LAB_ID: &str = "com.elephantnote.examples.trusted-workspace-lab";
const BUNDLED_TRUSTED_LAB_MANIFEST: &str = include_str!("../../../../examples/addons/trusted-workspace-lab/manifest.json");
const BUNDLED_TRUSTED_LAB_ENTRY: &str = include_str!("../../../../examples/addons/trusted-workspace-lab/main.js");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogAddon {
  pub id: String,
  pub slug: String,
  pub name: String,
  pub version: String,
  #[serde(default)]
  pub description: String,
  #[serde(default)]
  pub author: String,
  #[serde(default)]
  pub manifest_path: String,
  #[serde(default)]
  pub entry_path: String,
  #[serde(default)]
  pub package_path: String,
  #[serde(default)]
  pub package_hash: String,
  #[serde(default)]
  pub readme_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddonCatalog {
  version: u32,
  branch: String,
  #[serde(default)]
  updated_at: String,
  addons: Vec<CatalogAddon>,
}

fn bundled_trusted_lab_item() -> CatalogAddon {
  CatalogAddon {
    id: BUNDLED_TRUSTED_LAB_ID.to_string(),
    slug: "trusted-workspace-lab".to_string(),
    name: "Trusted Workspace Lab".to_string(),
    version: "1.0.0".to_string(),
    description: "Full app access reference addon that visibly modifies Settings, workspace UI and application behavior.".to_string(),
    author: "ElephantNote".to_string(),
    manifest_path: "bundled/trusted-workspace-lab/manifest.json".to_string(),
    entry_path: "bundled/trusted-workspace-lab/main.js".to_string(),
    package_path: String::new(),
    package_hash: String::new(),
    readme_path: String::new(),
  }
}

fn safe_catalog_path(value: &str) -> R<String> {
  let path = Path::new(value);
  if value.trim().is_empty() || path.is_absolute() {
    return Err("Catalogue paths must be safe relative paths".to_string());
  }
  let mut parts = Vec::new();
  for component in path.components() {
    match component {
      Component::Normal(part) => parts.push(part.to_string_lossy().to_string()),
      Component::CurDir => {}
      Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
        return Err(format!("Unsafe catalogue path: {value}"));
      }
    }
  }
  if parts.is_empty() {
    return Err("Catalogue paths must not be empty".to_string());
  }
  Ok(parts.join("/"))
}

fn validate_catalog_item(item: &CatalogAddon) -> R<()> {
  if item.id.trim().is_empty() || item.slug.trim().is_empty() || item.name.trim().is_empty() || item.version.trim().is_empty() {
    return Err("Catalogue addons require id, slug, name and version".to_string());
  }
  if !item.slug.chars().all(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-') {
    return Err(format!("Invalid addon catalogue slug: {}", item.slug));
  }
  if item.id == BUNDLED_TRUSTED_LAB_ID {
    return Ok(());
  }

  let expected_prefix = format!("addons/{}/", item.slug);
  if !item.package_path.trim().is_empty() {
    let package_path = safe_catalog_path(&item.package_path)?;
    if !package_path.starts_with(&expected_prefix) || !package_path.ends_with(".enaddon") {
      return Err(format!("Catalogue package for {} must be an .enaddon file under {}", item.id, expected_prefix));
    }
    if item.package_hash.trim().is_empty() {
      return Err(format!("Catalogue package for {} requires a blake3 packageHash", item.id));
    }
  } else {
    let manifest_path = safe_catalog_path(&item.manifest_path)?;
    let entry_path = safe_catalog_path(&item.entry_path)?;
    if !manifest_path.starts_with(&expected_prefix) || !entry_path.starts_with(&expected_prefix) {
      return Err(format!("Catalogue files for {} must stay under {}", item.id, expected_prefix));
    }
  }

  if !item.readme_path.trim().is_empty() {
    let readme_path = safe_catalog_path(&item.readme_path)?;
    if !readme_path.starts_with(&expected_prefix) {
      return Err(format!("Catalogue README for {} must stay under {}", item.id, expected_prefix));
    }
  }
  Ok(())
}

fn catalog_url(relative_path: &str) -> R<Url> {
  let relative_path = safe_catalog_path(relative_path)?;
  let root = Url::parse(CATALOG_ROOT).map_err(|error| error.to_string())?;
  let url = root.join(&relative_path).map_err(|error| error.to_string())?;
  if url.scheme() != "https" || url.host_str() != Some("raw.githubusercontent.com") {
    return Err("Addon catalogue URLs must use the trusted GitHub raw host".to_string());
  }
  if !url.path().starts_with("/SorbetUP/ElephantNote/addon-catalog/") {
    return Err("Addon catalogue URL escaped the trusted branch".to_string());
  }
  Ok(url)
}

fn fetch_bytes(relative_path: &str, max_bytes: u64) -> R<Vec<u8>> {
  let url = catalog_url(relative_path)?;
  let client = reqwest::blocking::Client::builder()
    .timeout(Duration::from_secs(60))
    .redirect(reqwest::redirect::Policy::none())
    .build()
    .map_err(|error| error.to_string())?;
  let mut response = client.get(url).send().map_err(|error| format!("Failed to reach addon catalogue: {error}"))?;
  if !response.status().is_success() {
    return Err(format!("Addon catalogue returned HTTP {}", response.status()));
  }
  if response.content_length().is_some_and(|length| length > max_bytes) {
    return Err("Addon catalogue response exceeds the allowed size".to_string());
  }
  let mut bytes = Vec::new();
  response
    .by_ref()
    .take(max_bytes + 1)
    .read_to_end(&mut bytes)
    .map_err(|error| error.to_string())?;
  if bytes.len() as u64 > max_bytes {
    return Err("Addon catalogue response exceeds the allowed size".to_string());
  }
  Ok(bytes)
}

fn fetch_catalog() -> R<AddonCatalog> {
  let raw = fetch_bytes("catalog.json", MAX_CATALOG_BYTES)?;
  let catalog: AddonCatalog = serde_json::from_slice(&raw).map_err(|error| format!("Invalid addon catalogue: {error}"))?;
  if catalog.version != CATALOG_VERSION {
    return Err(format!("Unsupported addon catalogue version {}", catalog.version));
  }
  if catalog.branch != "addon-catalog" {
    return Err("Addon catalogue branch marker is invalid".to_string());
  }
  let mut ids = BTreeSet::new();
  for item in &catalog.addons {
    validate_catalog_item(item)?;
    if !ids.insert(item.id.clone()) {
      return Err(format!("Duplicate addon id in catalogue: {}", item.id));
    }
  }
  Ok(catalog)
}

fn temporary_package_path(item: &CatalogAddon) -> std::path::PathBuf {
  std::env::temp_dir().join(format!(
    "elephantnote-catalog-{}-{}.enaddon",
    item.slug,
    chrono::Utc::now().timestamp_millis()
  ))
}

fn write_temporary_package(item: &CatalogAddon, manifest_bytes: &[u8], entry_bytes: &[u8]) -> R<std::path::PathBuf> {
  let manifest: AddonManifest = serde_json::from_slice(manifest_bytes)
    .map_err(|error| format!("Invalid manifest for {}: {error}", item.id))?;
  if manifest.id != item.id || manifest.version != item.version || manifest.name != item.name {
    return Err(format!("Catalogue metadata does not match manifest for {}", item.id));
  }
  if entry_bytes.len() as u64 > MAX_ENTRY_BYTES {
    return Err(format!("Addon entry exceeds the allowed size for {}", item.id));
  }

  let temp_path = temporary_package_path(item);
  let file = fs::File::create(&temp_path).map_err(|error| error.to_string())?;
  let mut archive = ZipWriter::new(file);
  let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
  archive.start_file("manifest.json", options).map_err(|error| error.to_string())?;
  archive.write_all(manifest_bytes).map_err(|error| error.to_string())?;
  archive
    .start_file(manifest.runtime.entry.clone(), options)
    .map_err(|error| error.to_string())?;
  archive.write_all(entry_bytes).map_err(|error| error.to_string())?;
  archive.finish().map_err(|error| error.to_string())?;
  Ok(temp_path)
}

fn download_prebuilt_package(item: &CatalogAddon) -> R<std::path::PathBuf> {
  let bytes = fetch_bytes(&item.package_path, MAX_PACKAGE_BYTES)?;
  let actual_hash = blake3::hash(&bytes).to_hex().to_string();
  if actual_hash != item.package_hash.trim().to_ascii_lowercase() {
    return Err(format!("Addon package hash mismatch for {}", item.id));
  }
  let temp_path = temporary_package_path(item);
  fs::write(&temp_path, bytes).map_err(|error| error.to_string())?;
  Ok(temp_path)
}

fn create_temporary_package(item: &CatalogAddon) -> R<std::path::PathBuf> {
  if item.id == BUNDLED_TRUSTED_LAB_ID {
    return write_temporary_package(
      item,
      BUNDLED_TRUSTED_LAB_MANIFEST.as_bytes(),
      BUNDLED_TRUSTED_LAB_ENTRY.as_bytes(),
    );
  }
  if !item.package_path.trim().is_empty() {
    return download_prebuilt_package(item);
  }
  let manifest_bytes = fetch_bytes(&item.manifest_path, MAX_MANIFEST_BYTES)?;
  let entry_bytes = fetch_bytes(&item.entry_path, MAX_ENTRY_BYTES)?;
  write_temporary_package(item, &manifest_bytes, &entry_bytes)
}

#[tauri::command]
pub fn tauri_addons_catalog_list() -> R<Vec<CatalogAddon>> {
  let mut addons = fetch_catalog()?.addons;
  if !addons.iter().any(|item| item.id == BUNDLED_TRUSTED_LAB_ID) {
    addons.push(bundled_trusted_lab_item());
  }
  Ok(addons)
}

#[tauri::command]
pub fn tauri_addons_catalog_install(
  app: AppHandle,
  state: State<'_, AddonState>,
  addon_id: String,
) -> R<InstalledAddon> {
  let item = if addon_id == BUNDLED_TRUSTED_LAB_ID {
    bundled_trusted_lab_item()
  } else {
    fetch_catalog()?
      .addons
      .into_iter()
      .find(|item| item.id == addon_id)
      .ok_or_else(|| format!("Addon is not listed in the official catalogue: {addon_id}"))?
  };
  let package_path = create_temporary_package(&item)?;
  let package_string = package_path.to_string_lossy().to_string();
  let result = addons::tauri_addons_install(app, state, package_string);
  let _ = fs::remove_file(package_path);
  result
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_catalog_path_traversal() {
    assert!(safe_catalog_path("../manifest.json").is_err());
    assert!(safe_catalog_path("addons/example/main.js").is_ok());
  }

  #[test]
  fn requires_source_files_to_stay_inside_the_addon_slug() {
    let item = CatalogAddon {
      id: "com.example.test".to_string(),
      slug: "test".to_string(),
      name: "Test".to_string(),
      version: "1.0.0".to_string(),
      description: String::new(),
      author: String::new(),
      manifest_path: "addons/test/manifest.json".to_string(),
      entry_path: "addons/test/main.js".to_string(),
      package_path: String::new(),
      package_hash: String::new(),
      readme_path: "addons/test/README.md".to_string(),
    };
    assert!(validate_catalog_item(&item).is_ok());
  }

  #[test]
  fn accepts_hashed_prebuilt_packages() {
    let item = CatalogAddon {
      id: "com.example.native".to_string(),
      slug: "native".to_string(),
      name: "Native".to_string(),
      version: "1.0.0".to_string(),
      description: String::new(),
      author: String::new(),
      manifest_path: String::new(),
      entry_path: String::new(),
      package_path: "addons/native/native-1.0.0-linux-x86_64.enaddon".to_string(),
      package_hash: "a".repeat(64),
      readme_path: "addons/native/README.md".to_string(),
    };
    assert!(validate_catalog_item(&item).is_ok());
  }

  #[test]
  fn bundles_the_full_access_lab_without_network_paths() {
    let item = bundled_trusted_lab_item();
    assert_eq!(item.id, BUNDLED_TRUSTED_LAB_ID);
    assert!(validate_catalog_item(&item).is_ok());
    let manifest: AddonManifest = serde_json::from_str(BUNDLED_TRUSTED_LAB_MANIFEST).unwrap();
    assert_eq!(manifest.id, BUNDLED_TRUSTED_LAB_ID);
    assert_eq!(manifest.runtime.entry, "main.js");
    assert!(BUNDLED_TRUSTED_LAB_ENTRY.contains("export default class TrustedWorkspaceLab"));
  }
}

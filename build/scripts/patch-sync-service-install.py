from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "Elephant/backend/tauri/src/official_addon_catalog.rs"
SERVICES = ROOT / "Elephant/backend/tauri/src/addon_services.rs"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected one match, found {count}")
    return source.replace(old, new, 1)


source = CATALOG.read_text()
source = replace_once(
    source,
    "const MAX_ENTRY_BYTES: u64 = 8 * 1024 * 1024;\nconst MAX_PACKAGE_FILE_BYTES: u64 = 128 * 1024 * 1024;",
    "const MAX_ENTRY_BYTES: u64 = 8 * 1024 * 1024;\nconst MAX_PACKAGE_BYTES: u64 = 25 * 1024 * 1024;\nconst MAX_PACKAGE_FILE_BYTES: u64 = 128 * 1024 * 1024;",
    "package byte limit",
)

platform_helpers = '''fn platform_key() -> String {
  let os = match std::env::consts::OS {
    "macos" => "macos",
    "windows" => "windows",
    "linux" => "linux",
    "android" => "android",
    "ios" => "ios",
    other => other,
  };
  let arch = match std::env::consts::ARCH {
    "aarch64" => "aarch64",
    "x86_64" => "x86_64",
    "arm" => "armv7",
    "x86" => "i686",
    other => other,
  };
  format!("{os}-{arch}")
}

fn available_for_platform(item: &CatalogAddon, platform: &str) -> bool {
  if item.packages.is_empty() {
    !item.requires_platform_package
  } else {
    item.packages.contains_key(platform)
  }
}

'''
source = replace_once(source, "fn parse_catalog(bytes: &[u8])", platform_helpers + "fn parse_catalog(bytes: &[u8])", "platform helpers")

sidecar_function = '''fn current_sidecar_path(manifest: &Value) -> Option<String> {
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
'''
sidecar_guard = sidecar_function + '''
fn require_declared_sidecar(
  item: &CatalogAddon,
  manifest: &Value,
  files: &BTreeMap<String, Vec<u8>>,
) -> R<()> {
  let Some(sidecar) = current_sidecar_path(manifest) else {
    return Ok(());
  };
  if !files.contains_key(&sidecar) {
    return Err(format!(
      "Official addon package is incomplete for {} on {}: missing native executable {sidecar}",
      item.id,
      platform_key()
    ));
  }
  Ok(())
}
'''
source = replace_once(source, sidecar_function, sidecar_guard, "native executable guard")

old_package_files = '''fn package_files(item: &CatalogAddon) -> R<BTreeMap<String, Vec<u8>>> {
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
'''
new_package_files = '''fn package_files(item: &CatalogAddon) -> R<BTreeMap<String, Vec<u8>>> {
  let local = local_package_directory(item)?;
  if local.is_dir() {
    let manifest_bytes = fs::read(local.join("manifest.json")).map_err(|error| error.to_string())?;
    assert_mobile_compatibility(&manifest_bytes)?;
    let manifest: Value = serde_json::from_slice(&manifest_bytes).map_err(|error| error.to_string())?;
    let mut files = BTreeMap::new();
    collect_local_files(&local, &local, &mut files)?;
    if files.contains_key("manifest.json") {
      require_declared_sidecar(item, &manifest, &files)?;
      return Ok(files);
    }
  }
  collect_remote_files(item)
}
'''
source = replace_once(source, old_package_files, new_package_files, "local package validation")

old_temporary = '''fn temporary_package(item: &CatalogAddon) -> R<PathBuf> {
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
'''
new_temporary = '''fn temporary_package_path(item: &CatalogAddon) -> PathBuf {
  std::env::temp_dir().join(format!(
    "elephant-official-{}-{}.enaddon",
    item.slug,
    chrono::Utc::now().timestamp_millis()
  ))
}

fn download_prebuilt_package(item: &CatalogAddon, package_path: &str, package_hash: &str) -> R<PathBuf> {
  let bytes = fetch_official_bytes(package_path, MAX_PACKAGE_BYTES)?;
  let actual_hash = blake3::hash(&bytes).to_hex().to_string();
  if actual_hash != package_hash.trim().to_ascii_lowercase() {
    return Err(format!("Official addon package hash mismatch for {}", item.id));
  }
  let path = temporary_package_path(item);
  fs::write(&path, bytes).map_err(|error| error.to_string())?;
  Ok(path)
}

fn prebuilt_package(item: &CatalogAddon) -> R<Option<PathBuf>> {
  let platform = platform_key();
  if let Some(package) = item.packages.get(&platform) {
    return download_prebuilt_package(item, &package.path, &package.hash).map(Some);
  }
  if item.requires_platform_package || !item.packages.is_empty() {
    return Err(format!("Official addon {} is not available for platform {platform}", item.id));
  }
  Ok(None)
}

fn temporary_package(item: &CatalogAddon) -> R<PathBuf> {
  if let Some(package) = prebuilt_package(item)? {
    return Ok(package);
  }
  let files = package_files(item)?;
  let path = temporary_package_path(item);
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
'''
source = replace_once(source, old_temporary, new_temporary, "prebuilt package download")

source = replace_once(
    source,
    '''pub fn tauri_official_addons_catalog_list() -> R<Vec<CatalogAddon>> {
  catalog()
}''',
    '''pub fn tauri_official_addons_catalog_list() -> R<Vec<CatalogAddon>> {
  let platform = platform_key();
  let mut addons = catalog()?;
  addons.retain(|item| available_for_platform(item, &platform));
  Ok(addons)
}''',
    "platform catalogue filtering",
)
source = replace_once(
    source,
    '''  let item = catalog()?
    .into_iter()
    .find(|item| item.id == addon_id)
    .ok_or_else(|| format!("Unknown official addon: {addon_id}"))?;''',
    '''  let platform = platform_key();
  let item = catalog()?
    .into_iter()
    .find(|item| item.id == addon_id && available_for_platform(item, &platform))
    .ok_or_else(|| format!("Official addon is not available for {platform}: {addon_id}"))?;''',
    "platform install selection",
)

test_marker = '''  #[test]
  fn local_official_packages_include_manifest_and_entry() {
    for item in catalog().unwrap() {
      let local = local_package_directory(&item).unwrap();
      assert!(local.join("manifest.json").is_file(), "missing manifest for {}", item.id);
      let manifest: Value = serde_json::from_slice(&fs::read(local.join("manifest.json")).unwrap()).unwrap();
      let entry = manifest.pointer("/runtime/entry").and_then(Value::as_str).unwrap();
      assert!(local.join(entry).is_file(), "missing entry for {}", item.id);
    }
  }
}'''
test_replacement = test_marker[:-2] + '''

  #[test]
  fn source_packages_cannot_omit_the_declared_service_executable() {
    let platform = platform_key();
    let sidecar = format!("native/{platform}/elephant-sync-service");
    let mut sidecars = serde_json::Map::new();
    sidecars.insert(platform, Value::String(sidecar.clone()));
    let manifest = serde_json::json!({ "native": { "sidecars": Value::Object(sidecars) } });
    let item: CatalogAddon = serde_json::from_value(serde_json::json!({
      "id": "elephant.sync",
      "slug": "sync",
      "name": "Sync",
      "version": "1.2.1",
      "official": true,
      "manifestPath": "official/sync/manifest.json",
      "entryPath": "official/sync/main.service.js"
    }))
    .unwrap();
    let files = BTreeMap::from([("manifest.json".to_string(), Vec::new())]);
    let error = require_declared_sidecar(&item, &manifest, &files)
      .expect_err("missing native executables must fail while constructing the package");
    assert!(error.contains(&sidecar));
  }
}'''
source = replace_once(source, test_marker, test_replacement, "regression test")
CATALOG.write_text(source)

services = SERVICES.read_text()
services = replace_once(
    services,
    '''    let executable = fs::canonicalize(package_dir.join(&relative_path)).map_err(|error| {
        format!("Addon service executable is unavailable for {addon_id}: {error}")
    })?;''',
    '''    let requested_executable = package_dir.join(&relative_path);
    let executable = fs::canonicalize(&requested_executable).map_err(|error| {
        format!(
            "Addon service package is incomplete for {addon_id}: missing {} ({error}). Reinstall or update the addon.",
            relative_path.to_string_lossy()
        )
    })?;''',
    "service launch diagnostic",
)
SERVICES.write_text(services)

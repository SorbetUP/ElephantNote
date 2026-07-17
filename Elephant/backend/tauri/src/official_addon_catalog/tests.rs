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

  #[test]
  fn native_catalog_entries_require_platform_packages() {
    let raw = br#"{
      "addons": [{
        "id": "elephant.sync",
        "slug": "sync",
        "name": "Sync",
        "version": "1.2.0",
        "official": true,
        "manifestPath": "official/sync/manifest.json",
        "entryPath": "official/sync/main.service.js",
        "requiresPlatformPackage": true,
        "packages": {}
      }]
    }"#;
    let error = parse_catalog(raw).expect_err("native source-only catalogue entries must be rejected");
    assert!(error.contains("requires a published package"));
  }

  #[test]
  fn package_hashes_are_validated_before_download() {
    let platform = platform_key();
    let raw = format!(
      r#"{{
        "addons": [{{
          "id": "elephant.sync",
          "slug": "sync",
          "name": "Sync",
          "version": "1.2.0",
          "official": true,
          "manifestPath": "official/sync/manifest.json",
          "entryPath": "official/sync/main.service.js",
          "requiresPlatformPackage": true,
          "packages": {{
            "{platform}": {{
              "path": "official/sync/releases/elephant.sync-1.2.0-{platform}.enaddon",
              "hash": "invalid"
            }}
          }}
        }}]
      }}"#
    );
    let error = parse_catalog(raw.as_bytes()).expect_err("invalid hashes must be rejected");
    assert!(error.contains("BLAKE3 hash"));
  }

  #[test]
  fn immutable_sync_packages_cover_all_supported_desktop_targets() {
    for platform in ["linux-x86_64", "macos-aarch64", "macos-x86_64", "windows-x86_64"] {
      let (path, hash) = legacy_sync_package(platform).expect("supported Sync package");
      assert!(path.starts_with("addons/sync/releases/elephant.sync-1.2.0-"));
      assert!(path.ends_with(".enaddon"));
      assert_eq!(hash.len(), 64);
      assert!(hash.bytes().all(|byte| byte.is_ascii_hexdigit()));
    }
    assert!(legacy_sync_package("android-aarch64").is_none());
  }

  #[test]
  fn current_sync_package_downloads_with_its_declared_service() {
    if std::env::var_os("CI").is_none() {
      return;
    }
    let platform = platform_key();
    let Some((path, expected_hash)) = legacy_sync_package(&platform) else {
      return;
    };
    let bytes = fetch_legacy_sync_bytes(path).expect("download immutable Sync package");
    assert_eq!(blake3::hash(&bytes).to_hex().to_string(), expected_hash);

    let mut archive = zip::ZipArchive::new(std::io::Cursor::new(bytes)).expect("valid Sync .enaddon archive");
    let manifest: Value = {
      let mut entry = archive.by_name("manifest.json").expect("Sync manifest");
      serde_json::from_reader(&mut entry).expect("valid Sync manifest")
    };
    let sidecar = manifest
      .pointer(&format!("/native/sidecars/{platform}"))
      .and_then(Value::as_str)
      .expect("Sync sidecar for the current platform")
      .to_string();
    let metadata = archive.by_name(&sidecar).expect("declared Sync executable in archive");
    assert!(metadata.size() > 0);
  }

  #[test]
  fn source_packages_cannot_omit_the_declared_service_executable() {
    let platform = platform_key();
    let sidecar = format!("native/{platform}/elephant-sync-service");
    let manifest = serde_json::json!({
      "native": {
        "sidecars": {
          (platform.clone()): sidecar.clone()
        }
      }
    });
    let item: CatalogAddon = serde_json::from_value(serde_json::json!({
      "id": "elephant.sync",
      "slug": "sync",
      "name": "Sync",
      "version": "1.2.0",
      "official": true,
      "manifestPath": "official/sync/manifest.json",
      "entryPath": "official/sync/main.service.js"
    }))
    .unwrap();
    let files = BTreeMap::from([("manifest.json".to_string(), Vec::new())]);
    let error = require_declared_sidecar(&item, &manifest, &files)
      .expect_err("missing native executables must fail during package construction");
    assert!(error.contains(&sidecar));
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn sync_item(version: &str) -> CatalogAddon {
    serde_json::from_value(serde_json::json!({
      "id": "elephant.sync",
      "slug": "sync",
      "name": "Sync",
      "version": version,
      "official": true,
      "manifestPath": "official/sync/manifest.json",
      "entryPath": "official/sync/main.service.js"
    }))
    .unwrap()
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
    let raw = serde_json::json!({
      "addons": [{
        "id": "elephant.sync",
        "slug": "sync",
        "name": "Sync",
        "version": "1.2.0",
        "official": true,
        "manifestPath": "official/sync/manifest.json",
        "entryPath": "official/sync/main.service.js",
        "requiresPlatformPackage": true,
        "packages": {
          platform.clone(): {
            "path": format!("official/sync/releases/elephant.sync-1.2.0-{platform}.enaddon"),
            "hash": "invalid"
          }
        }
      }]
    });
    let raw = serde_json::to_vec(&raw).unwrap();
    let error = parse_catalog(&raw).expect_err("invalid hashes must be rejected");
    assert!(error.contains("BLAKE3 hash"));
  }

  #[test]
  fn source_packages_cannot_omit_the_declared_service_executable() {
    let platform = platform_key();
    let sidecar = format!("native/{platform}/elephant-sync-service");
    let manifest = serde_json::json!({
      "permissions": { "native": true },
      "native": {
        "runner": "service",
        "sidecars": { (platform): sidecar.clone() }
      }
    });
    let files = BTreeMap::from([("manifest.json".to_string(), Vec::new())]);
    let error = require_declared_sidecar(&sync_item("1.2.0"), &manifest, &files)
      .expect_err("missing native executables must fail during package construction");
    assert!(error.contains(&sidecar));
  }

  #[test]
  fn prebuilt_package_manifest_must_match_catalog_identity() {
    let item = sync_item("1.2.0");
    let mut writer = ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    writer.start_file("manifest.json", options).unwrap();
    writer
      .write_all(
        serde_json::to_string(&serde_json::json!({
          "id": item.id,
          "version": "0.0.0",
          "runtime": { "entry": "main.service.js" }
        }))
        .unwrap()
        .as_bytes(),
      )
      .unwrap();
    let bytes = writer.finish().unwrap().into_inner();
    let error = validate_prebuilt_package(&item, &bytes).expect_err("catalog identity must be enforced");
    assert!(error.contains("version mismatch"));
  }

  #[test]
  fn source_transport_finds_multiline_relative_imports() {
    let source = "import {\n  helper\n} from './agent.js'\n";
    assert_eq!(static_relative_imports(source), vec!["./agent.js"]);
  }
}

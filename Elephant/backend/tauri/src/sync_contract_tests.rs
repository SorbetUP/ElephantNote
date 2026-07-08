use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::sync::manifest::{scan_vault, FileRecord, VaultManifest};
use crate::sync::plan::build_plan;
use crate::vault::sync::{
  create_sync_plan_value, sync_enqueue_iroh, sync_status_iroh, SYNC_CONFIG_FILE,
  SYNC_MANIFEST_FILE,
};
use crate::vault::types::VaultDescriptor;

fn unique_temp_dir(label: &str) -> PathBuf {
  let nonce = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_nanos())
    .unwrap_or_default();
  std::env::temp_dir().join(format!(
    "elephantnote-iroh-contract-{label}-{}-{nonce}",
    std::process::id()
  ))
}

fn vault(root: &Path) -> VaultDescriptor {
  VaultDescriptor {
    id: "test-vault".to_string(),
    name: "Test Vault".to_string(),
    path: root.to_string_lossy().replace('\\', "/"),
    icon: String::new(),
    last_opened_at: "0".to_string(),
  }
}

fn manifest(path: &str, hash: &str) -> VaultManifest {
  let mut manifest = VaultManifest::default();
  manifest.files.insert(
    path.to_string(),
    FileRecord {
      path: path.to_string(),
      size: 1,
      modified_ms: 0,
      hash: hash.to_string(),
    },
  );
  manifest
}

#[test]
fn status_without_active_vault_is_safe_and_descriptive() {
  let status = sync_status_iroh(None, "endpoint-id").unwrap();
  assert_eq!(status["runtime"], "tauri-rust-iroh");
  assert_eq!(status["backend"], "iroh");
  assert_eq!(status["activeVault"], Value::Null);
  assert_eq!(status["lastError"], "No active ElephantNote vault.");
}

#[test]
fn status_initializes_real_iroh_sync_metadata_without_git() {
  let root = unique_temp_dir("metadata");
  fs::create_dir_all(&root).unwrap();
  fs::write(root.join("First.md"), "# First").unwrap();

  let status = sync_status_iroh(Some(vault(&root)), "endpoint-id").unwrap();

  assert_eq!(status["backend"], "iroh");
  assert_eq!(status["capabilities"]["peerToPeer"], true);
  assert_eq!(status["capabilities"]["wholeVault"], true);
  assert_eq!(status["capabilities"]["configurationSync"], false);
  assert_eq!(status["capabilities"]["deviceLocalConfiguration"], true);
  assert!(root
    .join(".elephantnote/sync")
    .join(SYNC_CONFIG_FILE)
    .exists());
  assert!(!root.join(".git").exists());
  fs::remove_dir_all(root).ok();
}

#[test]
fn whole_vault_manifest_includes_content_but_excludes_device_configuration() {
  let root = unique_temp_dir("whole-vault");
  fs::create_dir_all(root.join(".assets")).unwrap();
  fs::create_dir_all(root.join(".config/provider")).unwrap();
  fs::create_dir_all(root.join(".elephantnote/config")).unwrap();
  fs::create_dir_all(root.join(".elephantnote/models")).unwrap();
  fs::create_dir_all(root.join(".elephantnote/state")).unwrap();
  fs::create_dir_all(root.join(".elephantnote/sync")).unwrap();
  fs::write(root.join("Note.md"), "note").unwrap();
  fs::write(root.join(".assets/image.png"), b"image").unwrap();
  fs::write(root.join(".config/provider/provider.json"), "{}").unwrap();
  fs::write(root.join(".elephantnote/config/workspace.json"), "{}").unwrap();
  fs::write(root.join(".elephantnote/models/models.json"), "{}").unwrap();
  fs::write(root.join(".elephantnote/state/ui.json"), "{}").unwrap();
  fs::write(root.join(".elephantnote/sync/private.json"), "{}").unwrap();

  let manifest = scan_vault(&root).unwrap();
  assert!(manifest.files.contains_key("Note.md"));
  assert!(manifest.files.contains_key(".assets/image.png"));
  assert!(!manifest
    .files
    .contains_key(".config/provider/provider.json"));
  assert!(!manifest
    .files
    .contains_key(".elephantnote/config/workspace.json"));
  assert!(!manifest
    .files
    .contains_key(".elephantnote/models/models.json"));
  assert!(!manifest
    .files
    .contains_key(".elephantnote/state/ui.json"));
  assert!(!manifest
    .files
    .contains_key(".elephantnote/sync/private.json"));
  fs::remove_dir_all(root).ok();
}

#[test]
fn excluded_configuration_cannot_be_uploaded_deleted_or_conflicted() {
  let root = unique_temp_dir("config-plan");
  fs::create_dir_all(root.join(".config/provider")).unwrap();
  fs::create_dir_all(root.join(".elephantnote/config")).unwrap();
  fs::write(root.join(".config/provider/provider.json"), "desktop-provider").unwrap();
  fs::write(root.join(".elephantnote/config/workspace.json"), "desktop-layout").unwrap();

  let local = scan_vault(&root).unwrap();
  let remote = VaultManifest::default();
  let old_baseline = manifest(".config/provider/provider.json", "old-config-hash");
  let plan = build_plan(&local, &remote, &old_baseline, "desktop", "phone");

  assert!(local.files.is_empty());
  assert!(plan.uploads.is_empty());
  assert!(plan.downloads.is_empty());
  assert!(plan.delete_files_local.is_empty());
  assert!(plan.delete_files_remote.is_empty());
  assert!(plan.conflicts.is_empty());
  fs::remove_dir_all(root).ok();
}

#[test]
fn enqueue_persists_operation_for_async_iroh_runner() {
  let root = unique_temp_dir("queue");
  fs::create_dir_all(&root).unwrap();
  let status = sync_enqueue_iroh(
    vault(&root),
    "endpoint-id",
    "sync".to_string(),
    Some(json!({ "reason": "manual" })),
  )
  .unwrap();
  assert_eq!(status["queued"], 1);
  assert_eq!(status["operations"][0]["operation"], "sync");
  fs::remove_dir_all(root).ok();
}

#[test]
fn three_way_plan_propagates_deletion_and_preserves_concurrent_edits() {
  let base = manifest("Conflict.md", "base");
  let local = manifest("Conflict.md", "local");
  let remote = manifest("Conflict.md", "remote");
  let conflict = build_plan(&local, &remote, &base, "aaa", "bbb");
  assert_eq!(conflict.conflicts, vec!["Conflict.md"]);
  assert_eq!(conflict.uploads.len(), 1);
  assert_eq!(conflict.downloads.len(), 1);

  let deletion = build_plan(&base, &VaultManifest::default(), &base, "aaa", "bbb");
  assert_eq!(deletion.delete_files_local, vec!["Conflict.md"]);
}

#[test]
fn public_sync_plan_declares_iroh_without_external_binary() {
  let plan = create_sync_plan_value(json!({}));
  assert_eq!(plan["backend"], "iroh");
  assert_eq!(plan["requiresExternalBinary"], false);
  assert_eq!(plan["externalDependencyFree"], true);
  assert_eq!(plan["operations"], json!(["init", "snapshot"]));
}

#[test]
fn sync_runtime_manifest_filename_is_stable() {
  assert_eq!(SYNC_MANIFEST_FILE, "sync-manifest.json");
}

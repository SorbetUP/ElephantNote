use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::vault::sync::{sync_accept_invite, sync_create_invite, sync_enqueue, sync_run, sync_status};
use crate::vault::types::VaultDescriptor;

fn unique_temp_dir(label: &str) -> PathBuf {
  let nonce = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_nanos())
    .unwrap_or_default();
  std::env::temp_dir().join(format!("elephantnote-tauri-sync-{label}-{}-{nonce}", std::process::id()))
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

fn write_note(root: &Path, name: &str, body: &str) {
  fs::create_dir_all(root).unwrap();
  fs::write(root.join(name), body).unwrap();
}

fn forbidden_terms() -> (String, String) {
  (["pass", "word"].join(""), ["pair", "Secret"].join(""))
}

fn history_has(status: &Value, operation: &str) -> bool {
  status
    .get("history")
    .and_then(Value::as_array)
    .expect("history array")
    .iter()
    .any(|entry| {
      entry.get("operation").and_then(Value::as_str) == Some(operation)
        && entry.get("status").and_then(Value::as_str) == Some("done")
    })
}

fn assert_history(status: &Value, operation: &str) {
  let history = status.get("history").and_then(Value::as_array).expect("history array");
  assert!(history_has(status, operation), "missing completed {operation} entry in {history:?}");
}

fn assert_no_history(status: &Value, operation: &str) {
  let history = status.get("history").and_then(Value::as_array).expect("history array");
  assert!(!history_has(status, operation), "unexpected completed {operation} entry in {history:?}");
}

#[test]
fn status_without_active_vault_is_safe_and_descriptive() {
  let status = sync_status(None).unwrap();
  assert_eq!(status["runtime"], "tauri-rust");
  assert_eq!(status["queued"], 0);
  assert_eq!(status["activeVault"], Value::Null);
  assert_eq!(status["lastError"], "No active ElephantNote vault.");
}

#[test]
fn tauri_sync_runtime_is_embedded_local_and_external_free() {
  let root = unique_temp_dir("external-free");
  write_note(&root, "First.md", "# First\n\nBody");

  let status = sync_run(vault(&root), Some(json!({ "snapshot": { "message": "contract snapshot" } }))).unwrap();

  assert_eq!(status["runtime"], "tauri-rust");
  assert_eq!(status["backend"], "elephant-local");
  assert_eq!(status["queued"], 0);
  assert_eq!(status["dirty"], false);
  assert_eq!(status["capabilities"]["embeddedBackend"], true);
  assert_eq!(status["capabilities"]["requiresExternalBinary"], false);
  assert_eq!(status["capabilities"]["mobileRcloneBinary"], false);
  assert_eq!(status["capabilities"]["mobileSyncRequiresBackend"], false);
  assert!(root.join(".elephantnote/sync/sync-config.json").exists());
  assert!(root.join(".elephantnote/sync/sync-log.json").exists());
  assert!(root.join(".elephantnote/sync/sync-manifest.json").exists());
  assert!(!root.join(".git").exists(), "embedded local sync must not create a git repository");
  assert_history(&status, "init");
  assert_history(&status, "snapshot");

  fs::remove_dir_all(root).ok();
}

#[test]
fn user_friendly_pairing_invite_can_be_accepted_by_second_device_and_syncs_without_cloud() {
  let pc_root = unique_temp_dir("pair-pc");
  let phone_root = unique_temp_dir("pair-phone");
  let shared_target = unique_temp_dir("pair-hub");
  write_note(&pc_root, "PC.md", "created on pc");

  let invite_result = sync_create_invite(vault(&pc_root), Some(json!({
    "remotePath": shared_target.to_string_lossy().replace('\\', "/"),
    "deviceName": "MacBook"
  }))).unwrap();
  let qr_payload = invite_result["qrPayload"].as_str().unwrap();
  let (forbidden_one, forbidden_two) = forbidden_terms();

  assert_eq!(invite_result["ok"], true);
  assert_eq!(invite_result["backend"], "elephant-local");
  assert!(qr_payload.contains("elephantnote-sync-v1"));
  assert!(!qr_payload.to_lowercase().contains(&forbidden_one));
  assert!(!qr_payload.contains(&forbidden_two));
  assert_eq!(invite_result["security"]["cloudRequired"], false);
  assert_eq!(invite_result["security"]["requiresExternalBinary"], false);

  let accept_result = sync_accept_invite(vault(&phone_root), json!({ "qrPayload": qr_payload })).unwrap();
  assert_eq!(accept_result["ok"], true);
  assert_eq!(accept_result["pairing"]["state"], "paired");
  assert_eq!(accept_result["status"]["interaction"]["pairingState"], "paired");
  assert_eq!(accept_result["status"]["peers"].as_array().unwrap().len(), 1);

  let pc_status = sync_run(vault(&pc_root), Some(json!({
    "sync": { "remotePath": shared_target.to_string_lossy().replace('\\', "/") }
  }))).unwrap();
  assert_history(&pc_status, "sync");

  let phone_status = sync_run(vault(&phone_root), Some(json!({ "sync": {} }))).unwrap();
  assert_history(&phone_status, "sync");
  assert_eq!(fs::read_to_string(phone_root.join("PC.md")).unwrap(), "created on pc");

  fs::remove_dir_all(pc_root).ok();
  fs::remove_dir_all(phone_root).ok();
  fs::remove_dir_all(shared_target).ok();
}

#[test]
fn enqueue_persists_visible_queue_status() {
  let root = unique_temp_dir("enqueue");
  let vault = vault(&root);
  let status = sync_enqueue(vault, "snapshot".to_string(), Some(json!({ "message": "queued snapshot" }))).unwrap();

  assert_eq!(status["queued"], 1);
  assert_eq!(status["operations"][0]["operation"], "snapshot");
  assert_eq!(status["operations"][0]["payload"]["message"], "queued snapshot");

  let queue_path = root.join(".elephantnote/sync/sync-queue.json");
  let queue = fs::read_to_string(queue_path).unwrap();
  assert!(queue.contains("queued snapshot"));

  fs::remove_dir_all(root).ok();
}

#[test]
fn sync_operation_runs_embedded_local_pair_flow() {
  let root = unique_temp_dir("sync-operation");
  let remote = unique_temp_dir("sync-remote");
  write_note(&root, "Sync.md", "# Sync\n\nBody");

  let status = sync_run(vault(&root), Some(json!({
    "sync": { "remotePath": remote.to_string_lossy().replace('\\', "/") }
  }))).unwrap();

  assert_eq!(status["queued"], 0);
  assert_eq!(status["backend"], "elephant-local");
  assert_history(&status, "init");
  assert_history(&status, "sync");
  assert_no_history(&status, "pull");
  assert_no_history(&status, "push");
  assert_eq!(fs::read_to_string(remote.join("Sync.md")).unwrap(), "# Sync\n\nBody");

  fs::remove_dir_all(root).ok();
  fs::remove_dir_all(remote).ok();
}

#[test]
fn push_uses_configured_local_folder_target() {
  let root = unique_temp_dir("push-vault");
  let remote = unique_temp_dir("push-remote");
  write_note(&root, "Remote.md", "# Remote\n\nBody");
  let remote_path = remote.to_string_lossy().replace('\\', "/");

  let status = sync_run(vault(&root), Some(json!({
    "init": { "remotePath": remote_path },
    "push": {}
  }))).unwrap();

  assert_eq!(status["queued"], 0);
  assert_eq!(status["remotePath"], remote.to_string_lossy().replace('\\', "/"));
  assert_history(&status, "push");
  assert_eq!(fs::read_to_string(remote.join("Remote.md")).unwrap(), "# Remote\n\nBody");

  fs::remove_dir_all(root).ok();
  fs::remove_dir_all(remote).ok();
}

#[test]
fn second_device_can_pull_without_creating_local_snapshot() {
  let root_a = unique_temp_dir("pull-device-a");
  let root_b = unique_temp_dir("pull-device-b");
  let remote = unique_temp_dir("pull-remote");

  write_note(&root_a, "FromA.md", "# From A\n\nPulled by B");
  let remote_path = remote.to_string_lossy().replace('\\', "/");
  let status_a = sync_run(vault(&root_a), Some(json!({
    "init": { "remotePath": remote_path },
    "push": {}
  }))).unwrap();
  assert_history(&status_a, "push");

  let status_b = sync_run(vault(&root_b), Some(json!({
    "init": { "remotePath": remote.to_string_lossy().replace('\\', "/") },
    "pull": {}
  }))).unwrap();

  assert_history(&status_b, "init");
  assert_history(&status_b, "pull");
  assert_no_history(&status_b, "snapshot");
  assert_eq!(fs::read_to_string(root_b.join("FromA.md")).unwrap(), "# From A\n\nPulled by B");

  fs::remove_dir_all(root_a).ok();
  fs::remove_dir_all(root_b).ok();
  fs::remove_dir_all(remote).ok();
}

#[test]
fn sync_preserves_both_versions_when_two_devices_changed_same_note() {
  let root = unique_temp_dir("conflict-root");
  let remote = unique_temp_dir("conflict-remote");
  write_note(&root, "Conflict.md", "local edit");
  write_note(&remote, "Conflict.md", "remote edit");

  let status = sync_run(vault(&root), Some(json!({
    "init": { "remotePath": remote.to_string_lossy().replace('\\', "/") },
    "sync": {}
  }))).unwrap();

  assert!(status["lastError"].as_str().unwrap_or("").contains("kept both versions"));
  assert!(!status["conflicts"].as_array().unwrap().is_empty());
  assert!(fs::read_dir(&root).unwrap().filter_map(Result::ok).any(|entry| entry.file_name().to_string_lossy().contains("remote-conflict")));
  assert!(fs::read_dir(&remote).unwrap().filter_map(Result::ok).any(|entry| entry.file_name().to_string_lossy().contains("local-conflict")));

  fs::remove_dir_all(root).ok();
  fs::remove_dir_all(remote).ok();
}

#[test]
fn status_stays_clean_after_unpushed_note_change_because_backend_is_not_git() {
  let root = unique_temp_dir("dirty");
  write_note(&root, "Clean.md", "# Clean\n");
  let vault = vault(&root);

  sync_run(vault.clone(), Some(json!({ "snapshot": { "message": "baseline" } }))).unwrap();
  write_note(&root, "Dirty.md", "# Dirty\n");

  let status = sync_status(Some(vault)).unwrap();
  assert_eq!(status["dirty"], false);
  assert_eq!(status["queued"], 0);

  fs::remove_dir_all(root).ok();
}

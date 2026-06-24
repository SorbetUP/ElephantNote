use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::vault::sync::{sync_enqueue, sync_run, sync_status};
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

fn git(cwd: &Path, args: &[&str]) -> String {
  let output = Command::new("git").args(args).current_dir(cwd).output().unwrap();
  assert!(
    output.status.success(),
    "git {} failed: {}",
    args.join(" "),
    String::from_utf8_lossy(&output.stderr)
  );
  String::from_utf8_lossy(&output.stdout).to_string()
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
fn run_init_and_snapshot_creates_clean_git_repository() {
  let root = unique_temp_dir("snapshot");
  write_note(&root, "First.md", "# First\n\nBody");
  let vault = vault(&root);

  let status = sync_run(vault.clone(), Some(json!({
    "snapshot": { "message": "contract snapshot" }
  }))).unwrap();

  assert_eq!(status["runtime"], "tauri-rust");
  assert_eq!(status["queued"], 0);
  assert_eq!(status["dirty"], false);
  assert!(status["deviceId"].as_str().unwrap().starts_with("en-"));
  assert!(status["folderId"].as_str().unwrap().starts_with("vault-"));
  assert!(root.join(".git").exists());
  assert!(root.join(".elephantnote/sync/sync-config.json").exists());
  assert!(root.join(".elephantnote/sync/sync-log.json").exists());
  assert_history(&status, "init");
  assert_history(&status, "snapshot");

  let log = git(&root, &["log", "--oneline", "-1"]);
  assert!(log.contains("contract snapshot"));

  let second = sync_run(vault, Some(json!({
    "snapshot": { "message": "noop snapshot" }
  }))).unwrap();
  assert_eq!(second["queued"], 0);
  assert_eq!(second["dirty"], false);

  fs::remove_dir_all(root).ok();
}

#[test]
fn sync_operation_expands_to_git_remote_sequence_and_skips_missing_remote() {
  let root = unique_temp_dir("sync-operation");
  write_note(&root, "Sync.md", "# Sync\n\nBody");
  let vault = vault(&root);

  let status = sync_run(vault, Some(json!({
    "sync": { "message": "single sync operation" }
  }))).unwrap();

  assert_eq!(status["queued"], 0);
  assert_eq!(status["dirty"], false);
  assert_history(&status, "init");
  assert_history(&status, "snapshot");
  assert_history(&status, "pull");
  assert_history(&status, "push");
  assert_no_history(&status, "sync");
  assert!(root.join(".git").exists());

  fs::remove_dir_all(root).ok();
}

#[test]
fn push_uses_configured_local_git_remote() {
  let root = unique_temp_dir("push-vault");
  let remote = unique_temp_dir("push-remote.git");
  fs::create_dir_all(remote.parent().unwrap()).unwrap();
  let output = Command::new("git").args(["init", "--bare", remote.to_str().unwrap()]).output().unwrap();
  assert!(output.status.success(), "git init --bare failed: {}", String::from_utf8_lossy(&output.stderr));

  write_note(&root, "Remote.md", "# Remote\n\nBody");
  let vault = vault(&root);
  let remote_path = remote.to_string_lossy().replace('\\', "/");

  let status = sync_run(vault, Some(json!({
    "init": { "remote": remote_path },
    "snapshot": { "message": "push snapshot" },
    "push": {}
  }))).unwrap();

  assert_eq!(status["queued"], 0);
  assert_eq!(status["dirty"], false);
  assert_eq!(status["remote"], remote.to_string_lossy().replace('\\', "/"));
  assert_history(&status, "push");

  let refs = Command::new("git").args(["--git-dir", remote.to_str().unwrap(), "show-ref"]).output().unwrap();
  assert!(refs.status.success(), "remote should contain pushed refs");

  fs::remove_dir_all(root).ok();
  fs::remove_dir_all(remote).ok();
}

#[test]
fn second_device_can_pull_without_creating_local_snapshot() {
  let root_a = unique_temp_dir("pull-device-a");
  let root_b = unique_temp_dir("pull-device-b");
  let remote = unique_temp_dir("pull-remote.git");
  fs::create_dir_all(remote.parent().unwrap()).unwrap();
  let output = Command::new("git").args(["init", "--bare", remote.to_str().unwrap()]).output().unwrap();
  assert!(output.status.success(), "git init --bare failed: {}", String::from_utf8_lossy(&output.stderr));

  write_note(&root_a, "FromA.md", "# From A\n\nPulled by B");
  let remote_path = remote.to_string_lossy().replace('\\', "/");
  let status_a = sync_run(vault(&root_a), Some(json!({
    "init": { "remote": remote_path },
    "snapshot": { "message": "device A snapshot" },
    "push": {}
  }))).unwrap();
  assert_history(&status_a, "push");

  let status_b = sync_run(vault(&root_b), Some(json!({
    "init": { "remote": remote_path },
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
fn sync_metadata_stays_local_and_is_not_tracked_by_git() {
  let root = unique_temp_dir("metadata-exclude");
  write_note(&root, "Tracked.md", "# Tracked\n");

  let status = sync_run(vault(&root), Some(json!({
    "snapshot": { "message": "metadata exclusion baseline" }
  }))).unwrap();
  assert_history(&status, "snapshot");

  let exclude = fs::read_to_string(root.join(".git/info/exclude")).unwrap();
  assert!(exclude.contains("/.elephantnote/sync/sync-config.json"));
  assert!(exclude.contains("/.elephantnote/sync/sync-log.json"));
  assert!(exclude.contains("/.elephantnote/sync/sync-queue.json"));
  assert!(exclude.contains("/.elephantnote/sync/sync-state.json"));

  let tracked_sync_files = git(&root, &["ls-files", ".elephantnote/sync"]);
  assert!(tracked_sync_files.trim().is_empty(), "sync metadata must not be tracked: {tracked_sync_files}");

  fs::remove_dir_all(root).ok();
}

#[test]
fn status_reports_dirty_repository_after_uncommitted_note_change() {
  let root = unique_temp_dir("dirty");
  write_note(&root, "Clean.md", "# Clean\n");
  let vault = vault(&root);

  sync_run(vault.clone(), Some(json!({
    "snapshot": { "message": "clean baseline" }
  }))).unwrap();
  write_note(&root, "Dirty.md", "# Dirty\n");

  let status = sync_status(Some(vault)).unwrap();
  assert_eq!(status["dirty"], true);
  assert_eq!(status["queued"], 0);

  fs::remove_dir_all(root).ok();
}

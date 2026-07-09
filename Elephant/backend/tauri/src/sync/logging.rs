use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use super::manifest::VaultManifest;
use super::plan::SyncPlan;

static SESSION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

fn timestamp_ms() -> u128 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_millis())
    .unwrap_or_default()
}

fn quoted(value: &str) -> String {
  serde_json::to_string(value).unwrap_or_else(|_| "\"<invalid>\"".to_string())
}

pub fn short_peer_id(peer_id: &str) -> String {
  if peer_id.len() <= 20 {
    peer_id.to_string()
  } else {
    format!("{}…{}", &peer_id[..10], &peer_id[peer_id.len() - 8..])
  }
}

pub fn log_global(event: &str, details: impl AsRef<str>) {
  let details = details.as_ref();
  if details.is_empty() {
    println!("[Sync] {event}");
  } else {
    println!("[Sync] {event} {details}");
  }
}

pub fn log_global_error(event: &str, details: impl AsRef<str>) {
  let details = details.as_ref();
  if details.is_empty() {
    eprintln!("[Sync] {event}");
  } else {
    eprintln!("[Sync] {event} {details}");
  }
}

#[derive(Debug)]
pub struct SyncLogger {
  session_id: String,
  role: &'static str,
  peer_name: String,
  peer_id: String,
  vault_name: String,
  started: Instant,
}

impl SyncLogger {
  pub fn start(role: &'static str, peer_name: &str, peer_id: &str, vault_name: &str) -> Self {
    let sequence = SESSION_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    let logger = Self {
      session_id: format!("{}-{sequence}", timestamp_ms()),
      role,
      peer_name: peer_name.to_string(),
      peer_id: short_peer_id(peer_id),
      vault_name: vault_name.to_string(),
      started: Instant::now(),
    };
    logger.event(
      "session:start",
      format!(
        "peer={} peer_id={} vault={}",
        quoted(&logger.peer_name),
        quoted(&logger.peer_id),
        quoted(&logger.vault_name)
      ),
    );
    logger
  }

  pub fn session_id(&self) -> &str {
    &self.session_id
  }

  pub fn elapsed_ms(&self) -> u128 {
    self.started.elapsed().as_millis()
  }

  pub fn event(&self, event: &str, details: impl AsRef<str>) {
    let details = details.as_ref();
    if details.is_empty() {
      println!(
        "[Sync] {event} session={} role={}",
        self.session_id, self.role
      );
    } else {
      println!(
        "[Sync] {event} session={} role={} {details}",
        self.session_id, self.role
      );
    }
  }

  pub fn error(&self, event: &str, error: &str, details: impl AsRef<str>) {
    let details = details.as_ref();
    if details.is_empty() {
      eprintln!(
        "[Sync] {event} session={} role={} error={}",
        self.session_id,
        self.role,
        quoted(error)
      );
    } else {
      eprintln!(
        "[Sync] {event} session={} role={} error={} {details}",
        self.session_id,
        self.role,
        quoted(error)
      );
    }
  }

  pub fn manifest(&self, side: &str, manifest: &VaultManifest) {
    let bytes = manifest.files.values().map(|record| record.size).sum::<u64>();
    self.event(
      "manifest",
      format!(
        "side={side} files={} directories={} bytes={bytes}",
        manifest.files.len(),
        manifest.directories.len()
      ),
    );
  }

  pub fn baseline(&self, manifest: &VaultManifest) {
    let bytes = manifest.files.values().map(|record| record.size).sum::<u64>();
    self.event(
      "baseline",
      format!(
        "files={} directories={} bytes={bytes}",
        manifest.files.len(),
        manifest.directories.len()
      ),
    );
  }

  pub fn plan(&self, plan: &SyncPlan) {
    let upload_bytes = plan.uploads.iter().map(|item| item.size).sum::<u64>();
    let download_bytes = plan.downloads.iter().map(|item| item.size).sum::<u64>();
    self.event(
      "plan",
      format!(
        "uploads={} upload_bytes={} downloads={} download_bytes={} preserves_local={} preserves_remote={} create_dirs_local={} create_dirs_remote={} delete_files_local={} delete_files_remote={} delete_dirs_local={} delete_dirs_remote={} conflicts={}",
        plan.uploads.len(),
        upload_bytes,
        plan.downloads.len(),
        download_bytes,
        plan.preserve_local.len(),
        plan.preserve_remote.len(),
        plan.create_dirs_local.len(),
        plan.create_dirs_remote.len(),
        plan.delete_files_local.len(),
        plan.delete_files_remote.len(),
        plan.delete_dirs_local.len(),
        plan.delete_dirs_remote.len(),
        plan.conflicts.len()
      ),
    );
  }

  pub fn conflict(&self, path: &str, archive_path: Option<&str>) {
    let archive = archive_path
      .map(quoted)
      .unwrap_or_else(|| "null".to_string());
    self.event(
      "conflict:preserved",
      format!("path={} archive_path={archive}", quoted(path)),
    );
  }

  pub fn complete(&self, transferred_files: u64, transferred_bytes: u64, conflicts: usize) {
    self.event(
      "complete",
      format!(
        "files={transferred_files} bytes={transferred_bytes} conflicts={conflicts} duration_ms={}",
        self.elapsed_ms()
      ),
    );
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::sync::manifest::{FileRecord, VaultManifest};
  use std::collections::{BTreeMap, BTreeSet};

  #[test]
  fn short_peer_id_preserves_small_values_and_compacts_large_values() {
    assert_eq!(short_peer_id("peer"), "peer");
    let compact = short_peer_id("abcdefghijklmnopqrstuvwxyz0123456789");
    assert!(compact.starts_with("abcdefghij"));
    assert!(compact.ends_with("23456789"));
  }

  #[test]
  fn manifest_totals_can_be_logged_without_reading_file_contents() {
    let manifest = VaultManifest {
      files: BTreeMap::from([(
        "Notes/A.md".to_string(),
        FileRecord {
          path: "Notes/A.md".to_string(),
          size: 42,
          modified_ms: 1,
          hash: "abcd".to_string(),
        },
      )]),
      directories: BTreeSet::from(["Notes".to_string()]),
    };
    let logger = SyncLogger::start("test", "Peer", "peer-id", "Vault");
    logger.manifest("local", &manifest);
    logger.complete(1, 42, 0);
  }
}

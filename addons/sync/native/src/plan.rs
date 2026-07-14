use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::path::Path;

use crate::manifest::{same_content, FileRecord, VaultManifest};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferSpec {
  pub transfer_id: String,
  pub source_path: String,
  pub target_path: String,
  pub size: u64,
  pub hash: String,
}

impl TransferSpec {
  fn from_record(source_path: String, target_path: String, record: &FileRecord) -> Self {
    let transfer_id = blake3::hash(format!("{}:{}:{}", source_path, target_path, record.hash).as_bytes())
      .to_hex()[..16]
      .to_string();
    Self {
      transfer_id,
      source_path,
      target_path,
      size: record.size,
      hash: record.hash.clone(),
    }
  }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreserveSpec {
  pub source_path: String,
  pub target_path: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncPlan {
  pub uploads: Vec<TransferSpec>,
  pub downloads: Vec<TransferSpec>,
  pub preserve_local: Vec<PreserveSpec>,
  pub preserve_remote: Vec<PreserveSpec>,
  pub create_dirs_local: Vec<String>,
  pub create_dirs_remote: Vec<String>,
  pub delete_files_local: Vec<String>,
  pub delete_files_remote: Vec<String>,
  pub delete_dirs_local: Vec<String>,
  pub delete_dirs_remote: Vec<String>,
  pub conflicts: Vec<String>,
}

fn sanitized_peer(peer: &str) -> String {
  let value = peer
    .chars()
    .filter(|character| character.is_ascii_alphanumeric())
    .take(12)
    .collect::<String>();
  if value.is_empty() { "device".to_string() } else { value }
}

fn conflict_path(path: &str, loser_peer: &str, record: &FileRecord) -> String {
  let input = Path::new(path);
  let parent = input.parent().and_then(|value| value.to_str()).unwrap_or("");
  let stem = input.file_stem().and_then(|value| value.to_str()).unwrap_or("file");
  let extension = input
    .extension()
    .and_then(|value| value.to_str())
    .map(|value| format!(".{value}"))
    .unwrap_or_default();
  let hash = &record.hash[..record.hash.len().min(10)];
  let filename = format!(
    "{stem}.{}-conflict-{hash}-{}{}",
    sanitized_peer(loser_peer),
    record.modified_ms,
    extension
  );
  if parent.is_empty() {
    format!(".conflit/{filename}")
  } else {
    format!(".conflit/{}/{}", parent.replace('\\', "/"), filename)
  }
}

fn local_wins_conflict(local: &FileRecord, remote: &FileRecord, local_id: &str, remote_id: &str) -> bool {
  match local.modified_ms.cmp(&remote.modified_ms) {
    std::cmp::Ordering::Greater => true,
    std::cmp::Ordering::Less => false,
    std::cmp::Ordering::Equal => local_id <= remote_id,
  }
}

fn plan_conflict(
  plan: &mut SyncPlan,
  path: &str,
  local: &FileRecord,
  remote: &FileRecord,
  local_id: &str,
  remote_id: &str,
) {
  plan.conflicts.push(path.to_string());
  if local_wins_conflict(local, remote, local_id, remote_id) {
    let remote_conflict = conflict_path(path, remote_id, remote);
    plan.preserve_remote.push(PreserveSpec {
      source_path: path.to_string(),
      target_path: remote_conflict.clone(),
    });
    plan.downloads.push(TransferSpec::from_record(
      remote_conflict.clone(),
      remote_conflict,
      remote,
    ));
    plan.uploads.push(TransferSpec::from_record(
      path.to_string(),
      path.to_string(),
      local,
    ));
  } else {
    let local_conflict = conflict_path(path, local_id, local);
    plan.preserve_local.push(PreserveSpec {
      source_path: path.to_string(),
      target_path: local_conflict.clone(),
    });
    plan.uploads.push(TransferSpec::from_record(
      local_conflict.clone(),
      local_conflict,
      local,
    ));
    plan.downloads.push(TransferSpec::from_record(
      path.to_string(),
      path.to_string(),
      remote,
    ));
  }
}

pub fn build_plan(
  local: &VaultManifest,
  remote: &VaultManifest,
  baseline: &VaultManifest,
  local_id: &str,
  remote_id: &str,
) -> SyncPlan {
  let mut plan = SyncPlan::default();
  let paths: BTreeSet<String> = local
    .files
    .keys()
    .chain(remote.files.keys())
    .chain(baseline.files.keys())
    .cloned()
    .collect();

  for path in paths {
    let local_record = local.files.get(&path);
    let remote_record = remote.files.get(&path);
    let base_record = baseline.files.get(&path);
    if same_content(local_record, remote_record) {
      continue;
    }
    let local_changed = !same_content(local_record, base_record);
    let remote_changed = !same_content(remote_record, base_record);
    match (local_record, remote_record) {
      (Some(local_record), Some(remote_record)) => {
        if local_changed && !remote_changed {
          plan.uploads.push(TransferSpec::from_record(path.clone(), path.clone(), local_record));
        } else if !local_changed && remote_changed {
          plan.downloads.push(TransferSpec::from_record(path.clone(), path.clone(), remote_record));
        } else {
          plan_conflict(&mut plan, &path, local_record, remote_record, local_id, remote_id);
        }
      }
      (Some(local_record), None) => {
        if base_record.is_some() && !local_changed {
          plan.delete_files_local.push(path);
        } else {
          if base_record.is_some() && local_changed && remote_changed {
            plan.conflicts.push(path.clone());
          }
          plan.uploads.push(TransferSpec::from_record(path.clone(), path, local_record));
        }
      }
      (None, Some(remote_record)) => {
        if base_record.is_some() && !remote_changed {
          plan.delete_files_remote.push(path);
        } else {
          if base_record.is_some() && local_changed && remote_changed {
            plan.conflicts.push(path.clone());
          }
          plan.downloads.push(TransferSpec::from_record(path.clone(), path, remote_record));
        }
      }
      (None, None) => {}
    }
  }

  let directories: BTreeSet<String> = local
    .directories
    .iter()
    .chain(remote.directories.iter())
    .chain(baseline.directories.iter())
    .cloned()
    .collect();
  for path in directories {
    let local_has = local.directories.contains(&path);
    let remote_has = remote.directories.contains(&path);
    let base_has = baseline.directories.contains(&path);
    match (local_has, remote_has, base_has) {
      (true, false, false) => plan.create_dirs_remote.push(path),
      (false, true, false) => plan.create_dirs_local.push(path),
      (false, true, true) => plan.delete_dirs_remote.push(path),
      (true, false, true) => plan.delete_dirs_local.push(path),
      _ => {}
    }
  }

  plan
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::collections::{BTreeMap, BTreeSet};

  fn manifest_at(path: &str, hash: &str, modified_ms: u64) -> VaultManifest {
    VaultManifest {
      files: BTreeMap::from([(
        path.to_string(),
        FileRecord {
          path: path.to_string(),
          size: 1,
          modified_ms,
          hash: hash.to_string(),
        },
      )]),
      directories: BTreeSet::new(),
    }
  }

  #[test]
  fn uploads_a_local_only_file() {
    let plan = build_plan(
      &manifest_at("A.md", "aaaa", 1),
      &VaultManifest::default(),
      &VaultManifest::default(),
      "a",
      "b",
    );
    assert_eq!(plan.uploads.len(), 1);
    assert!(plan.downloads.is_empty());
  }

  #[test]
  fn propagates_a_remote_deletion_when_local_is_unchanged() {
    let baseline = manifest_at("A.md", "aaaa", 1);
    let plan = build_plan(&baseline, &VaultManifest::default(), &baseline, "a", "b");
    assert_eq!(plan.delete_files_local, vec!["A.md"]);
  }

  #[test]
  fn newer_local_version_preserves_the_remote_conflict() {
    let baseline = manifest_at("Notes/A.md", "base", 10);
    let local = manifest_at("Notes/A.md", "local", 300);
    let remote = manifest_at("Notes/A.md", "remote", 200);
    let plan = build_plan(&local, &remote, &baseline, "local", "remote");
    assert_eq!(plan.conflicts, vec!["Notes/A.md"]);
    assert_eq!(plan.preserve_remote.len(), 1);
    assert!(plan.downloads[0].target_path.starts_with(".conflit/Notes/"));
  }

  #[test]
  fn endpoint_id_breaks_equal_timestamp_ties_deterministically() {
    let baseline = manifest_at("A.md", "base", 10);
    let local = manifest_at("A.md", "local", 200);
    let remote = manifest_at("A.md", "remote", 200);
    let plan = build_plan(&local, &remote, &baseline, "aaa", "bbb");
    assert_eq!(plan.preserve_remote.len(), 1);
    assert_eq!(plan.uploads[0].target_path, "A.md");
  }
}

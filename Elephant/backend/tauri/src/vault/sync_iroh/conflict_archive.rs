pub const CONFLICT_ARCHIVE_DIR: &str = ".conflit";
const CONFLICT_SETTINGS_FILE: &str = "conflict-settings.json";
const DEFAULT_CONFLICT_RETENTION_DAYS: u32 = 3;
const MIN_CONFLICT_RETENTION_DAYS: u32 = 1;
const MAX_CONFLICT_RETENTION_DAYS: u32 = 365;

#[derive(Clone, Debug, serde::Deserialize, serde::Serialize)]
#[serde(default, rename_all = "camelCase")]
struct ConflictArchiveSettings {
  retention_days: u32,
}

impl Default for ConflictArchiveSettings {
  fn default() -> Self {
    Self {
      retention_days: DEFAULT_CONFLICT_RETENTION_DAYS,
    }
  }
}

#[derive(Clone, Debug, Default)]
struct ConflictCleanupReport {
  deleted_files: u64,
  remaining_files: u64,
}

fn conflict_settings_path(cwd: &std::path::Path) -> std::path::PathBuf {
  crate::vault_layout::sync_file(cwd, CONFLICT_SETTINGS_FILE)
}

fn conflict_archive_root(cwd: &std::path::Path) -> std::path::PathBuf {
  cwd.join(CONFLICT_ARCHIVE_DIR)
}

fn normalized_retention_days(days: u32) -> Result<u32, String> {
  if !(MIN_CONFLICT_RETENTION_DAYS..=MAX_CONFLICT_RETENTION_DAYS).contains(&days) {
    return Err(format!(
      "Conflict retention must be between {MIN_CONFLICT_RETENTION_DAYS} and {MAX_CONFLICT_RETENTION_DAYS} days."
    ));
  }
  Ok(days)
}

fn read_conflict_settings(cwd: &std::path::Path) -> ConflictArchiveSettings {
  let path = conflict_settings_path(cwd);
  if !path.exists() {
    return ConflictArchiveSettings::default();
  }
  std::fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str::<ConflictArchiveSettings>(&raw).ok())
    .map(|mut settings| {
      settings.retention_days = settings
        .retention_days
        .clamp(MIN_CONFLICT_RETENTION_DAYS, MAX_CONFLICT_RETENTION_DAYS);
      settings
    })
    .unwrap_or_default()
}

fn write_conflict_settings(
  cwd: &std::path::Path,
  settings: &ConflictArchiveSettings,
) -> Result<(), String> {
  let path = conflict_settings_path(cwd);
  if let Some(parent) = path.parent() {
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let temporary = path.with_extension("json.tmp");
  let raw = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
  std::fs::write(&temporary, raw).map_err(|error| error.to_string())?;
  match std::fs::remove_file(&path) {
    Ok(()) => {}
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
    Err(error) => return Err(error.to_string()),
  }
  std::fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn collect_conflict_files(
  directory: &std::path::Path,
  files: &mut Vec<std::path::PathBuf>,
) -> Result<(), String> {
  let entries = match std::fs::read_dir(directory) {
    Ok(entries) => entries,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.to_string()),
  };
  for entry in entries {
    let entry = match entry {
      Ok(entry) => entry,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    let path = entry.path();
    let metadata = match std::fs::symlink_metadata(&path) {
      Ok(metadata) => metadata,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    if metadata.file_type().is_symlink() {
      continue;
    }
    if metadata.is_dir() {
      collect_conflict_files(&path, files)?;
    } else if metadata.is_file() {
      files.push(path);
    }
  }
  Ok(())
}

fn remove_empty_conflict_directories(
  directory: &std::path::Path,
  root: &std::path::Path,
) -> Result<(), String> {
  let metadata = match std::fs::symlink_metadata(directory) {
    Ok(metadata) => metadata,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.to_string()),
  };
  if metadata.file_type().is_symlink() || !metadata.is_dir() {
    return Ok(());
  }

  let children = match std::fs::read_dir(directory) {
    Ok(entries) => entries
      .collect::<Result<Vec<_>, _>>()
      .map_err(|error| error.to_string())?,
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.to_string()),
  };
  for child in children {
    let path = child.path();
    if std::fs::symlink_metadata(&path)
      .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
      .unwrap_or(false)
    {
      remove_empty_conflict_directories(&path, root)?;
    }
  }

  let is_empty = match std::fs::read_dir(directory) {
    Ok(mut entries) => entries.next().is_none(),
    Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.to_string()),
  };
  if directory != root && is_empty {
    match std::fs::remove_dir(directory) {
      Ok(()) => {}
      Err(error)
        if matches!(
          error.kind(),
          std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty
        ) => {}
      Err(error) => return Err(error.to_string()),
    }
  }
  Ok(())
}

fn cleanup_conflict_archive(
  cwd: &std::path::Path,
  retention_days: u32,
) -> Result<ConflictCleanupReport, String> {
  let retention_days = normalized_retention_days(retention_days)?;
  let root = conflict_archive_root(cwd);
  let cutoff = std::time::SystemTime::now()
    .checked_sub(std::time::Duration::from_secs(
      u64::from(retention_days) * 24 * 60 * 60,
    ))
    .unwrap_or(std::time::UNIX_EPOCH);
  let mut files = Vec::new();
  collect_conflict_files(&root, &mut files)?;
  let mut report = ConflictCleanupReport::default();

  for path in files {
    let metadata = match std::fs::metadata(&path) {
      Ok(metadata) => metadata,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    let expired = metadata.modified().map(|modified| modified <= cutoff).unwrap_or(false);
    if expired {
      match std::fs::remove_file(&path) {
        Ok(()) => report.deleted_files += 1,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
      }
    } else {
      report.remaining_files += 1;
    }
  }
  remove_empty_conflict_directories(&root, &root)?;
  Ok(report)
}

fn conflict_archive_entries(cwd: &std::path::Path) -> Result<Vec<serde_json::Value>, String> {
  let mut files = Vec::new();
  collect_conflict_files(&conflict_archive_root(cwd), &mut files)?;
  files.sort();
  let mut entries = Vec::new();
  for path in files {
    let metadata = match std::fs::metadata(&path) {
      Ok(metadata) => metadata,
      Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    let modified_ms = metadata
      .modified()
      .ok()
      .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
      .map(|value| value.as_millis() as u64)
      .unwrap_or_default();
    let relative = path
      .strip_prefix(cwd)
      .unwrap_or(&path)
      .to_string_lossy()
      .replace('\\', "/");
    entries.push(serde_json::json!({
      "path": relative,
      "size": metadata.len(),
      "modifiedMs": modified_ms
    }));
  }
  Ok(entries)
}

fn conflict_settings_value(
  vault: &super::types::VaultDescriptor,
  settings: &ConflictArchiveSettings,
  cleanup: &ConflictCleanupReport,
) -> Result<serde_json::Value, String> {
  let cwd = std::path::PathBuf::from(&vault.path);
  let entries = conflict_archive_entries(&cwd)?;
  Ok(serde_json::json!({
    "retentionDays": settings.retention_days,
    "defaultRetentionDays": DEFAULT_CONFLICT_RETENTION_DAYS,
    "minimumRetentionDays": MIN_CONFLICT_RETENTION_DAYS,
    "maximumRetentionDays": MAX_CONFLICT_RETENTION_DAYS,
    "archivePath": CONFLICT_ARCHIVE_DIR,
    "deletedFiles": cleanup.deleted_files,
    "storedFiles": entries.len(),
    "entries": entries
  }))
}

pub fn sync_conflict_settings_peek(
  vault: super::types::VaultDescriptor,
) -> Result<serde_json::Value, String> {
  let cwd = std::path::PathBuf::from(&vault.path);
  let settings = read_conflict_settings(&cwd);
  conflict_settings_value(&vault, &settings, &ConflictCleanupReport::default())
}

pub fn sync_conflict_settings_get(
  vault: super::types::VaultDescriptor,
) -> Result<serde_json::Value, String> {
  let cwd = std::path::PathBuf::from(&vault.path);
  let settings = read_conflict_settings(&cwd);
  let cleanup = cleanup_conflict_archive(&cwd, settings.retention_days)?;
  conflict_settings_value(&vault, &settings, &cleanup)
}

pub fn sync_conflict_settings_set(
  vault: super::types::VaultDescriptor,
  retention_days: u32,
) -> Result<serde_json::Value, String> {
  let cwd = std::path::PathBuf::from(&vault.path);
  let settings = ConflictArchiveSettings {
    retention_days: normalized_retention_days(retention_days)?,
  };
  write_conflict_settings(&cwd, &settings)?;
  let cleanup = cleanup_conflict_archive(&cwd, settings.retention_days)?;
  conflict_settings_value(&vault, &settings, &cleanup)
}

pub(crate) fn cleanup_conflicts_for_root(cwd: &std::path::Path) -> Result<(), String> {
  let settings = read_conflict_settings(cwd);
  cleanup_conflict_archive(cwd, settings.retention_days).map(|_| ())
}

pub(crate) fn cleanup_conflicts_for_vault(
  vault: &super::types::VaultDescriptor,
) -> Result<(), String> {
  cleanup_conflicts_for_root(std::path::Path::new(&vault.path))
}

#[cfg(test)]
mod conflict_archive_tests {
  use super::*;

  fn temp_root() -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-conflict-archive-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  fn test_vault(root: &std::path::Path) -> crate::vault::types::VaultDescriptor {
    crate::vault::types::VaultDescriptor {
      id: "conflict-archive-test".to_string(),
      name: "Conflict Archive Test".to_string(),
      path: root.to_string_lossy().to_string(),
      icon: String::new(),
      last_opened_at: "0".to_string(),
    }
  }

  #[test]
  fn retention_defaults_to_three_days_and_is_device_local() {
    let root = temp_root();
    std::fs::create_dir_all(&root).unwrap();
    let settings = read_conflict_settings(&root);
    assert_eq!(settings.retention_days, 3);
    write_conflict_settings(
      &root,
      &ConflictArchiveSettings {
        retention_days: 12,
      },
    )
    .unwrap();
    assert_eq!(read_conflict_settings(&root).retention_days, 12);
    assert!(conflict_settings_path(&root).starts_with(root.join(".elephantnote/sync")));
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn cleanup_keeps_recent_conflicts() {
    let root = temp_root();
    let archive = conflict_archive_root(&root).join("Notes");
    std::fs::create_dir_all(&archive).unwrap();
    let recent = archive.join("Note.device-conflict.md");
    std::fs::write(&recent, "recent").unwrap();
    let report = cleanup_conflict_archive(&root, 3).unwrap();
    assert_eq!(report.deleted_files, 0);
    assert_eq!(report.remaining_files, 1);
    assert!(recent.exists());
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn cleanup_is_idempotent_when_archive_is_missing() {
    let root = temp_root();
    std::fs::create_dir_all(&root).unwrap();
    cleanup_conflict_archive(&root, 3).unwrap();
    cleanup_conflict_archive(&root, 3).unwrap();
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn read_only_peek_lists_archive_without_removing_files() {
    let root = temp_root();
    let archive = conflict_archive_root(&root);
    std::fs::create_dir_all(&archive).unwrap();
    let file = archive.join("Note.device-conflict.md");
    std::fs::write(&file, "conflict").unwrap();
    let value = sync_conflict_settings_peek(test_vault(&root)).unwrap();
    assert_eq!(value["storedFiles"].as_u64(), Some(1));
    assert_eq!(value["deletedFiles"].as_u64(), Some(0));
    assert!(file.exists());
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn rejects_unbounded_or_zero_retention() {
    assert!(normalized_retention_days(0).is_err());
    assert!(normalized_retention_days(366).is_err());
    assert_eq!(normalized_retention_days(3).unwrap(), 3);
  }
}

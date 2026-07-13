use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
  fs,
  io::ErrorKind,
  path::{Path, PathBuf},
  time::{Duration, SystemTime, UNIX_EPOCH},
};

use crate::manifest::safe_join;

pub const CONFLICT_ARCHIVE_DIR: &str = ".conflit";
const CONFLICT_SETTINGS_FILE: &str = ".elephantnote/sync/conflict-settings.json";
const DEFAULT_RETENTION_DAYS: u32 = 3;
const MIN_RETENTION_DAYS: u32 = 1;
const MAX_RETENTION_DAYS: u32 = 365;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct ConflictSettings {
  retention_days: u32,
}

impl Default for ConflictSettings {
  fn default() -> Self {
    Self {
      retention_days: DEFAULT_RETENTION_DAYS,
    }
  }
}

#[derive(Clone, Debug, Default)]
struct CleanupReport {
  deleted_files: u64,
  remaining_files: u64,
}

fn normalized_retention_days(days: u32) -> Result<u32, String> {
  if !(MIN_RETENTION_DAYS..=MAX_RETENTION_DAYS).contains(&days) {
    return Err(format!(
      "Conflict retention must be between {MIN_RETENTION_DAYS} and {MAX_RETENTION_DAYS} days"
    ));
  }
  Ok(days)
}

fn settings_path(vault_root: &Path) -> Result<PathBuf, String> {
  safe_join(vault_root, CONFLICT_SETTINGS_FILE)
}

fn archive_root(vault_root: &Path) -> Result<PathBuf, String> {
  safe_join(vault_root, CONFLICT_ARCHIVE_DIR)
}

fn read_settings(vault_root: &Path) -> ConflictSettings {
  let Ok(path) = settings_path(vault_root) else {
    return ConflictSettings::default();
  };
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str::<ConflictSettings>(&raw).ok())
    .map(|mut settings| {
      settings.retention_days = settings.retention_days.clamp(MIN_RETENTION_DAYS, MAX_RETENTION_DAYS);
      settings
    })
    .unwrap_or_default()
}

fn write_settings(vault_root: &Path, settings: &ConflictSettings) -> Result<(), String> {
  let path = settings_path(vault_root)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  }
  let temporary = path.with_extension("json.tmp");
  let raw = serde_json::to_vec_pretty(settings).map_err(|error| error.to_string())?;
  fs::write(&temporary, raw).map_err(|error| error.to_string())?;
  match fs::remove_file(&path) {
    Ok(()) => {}
    Err(error) if error.kind() == ErrorKind::NotFound => {}
    Err(error) => return Err(error.to_string()),
  }
  fs::rename(temporary, path).map_err(|error| error.to_string())
}

fn collect_files(directory: &Path, files: &mut Vec<PathBuf>) -> Result<(), String> {
  let entries = match fs::read_dir(directory) {
    Ok(entries) => entries,
    Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.to_string()),
  };
  for entry in entries {
    let entry = match entry {
      Ok(entry) => entry,
      Err(error) if error.kind() == ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    let path = entry.path();
    let metadata = match fs::symlink_metadata(&path) {
      Ok(metadata) => metadata,
      Err(error) if error.kind() == ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    if metadata.file_type().is_symlink() {
      continue;
    }
    if metadata.is_dir() {
      collect_files(&path, files)?;
    } else if metadata.is_file() {
      files.push(path);
    }
  }
  Ok(())
}

fn remove_empty_directories(directory: &Path, root: &Path) -> Result<(), String> {
  let metadata = match fs::symlink_metadata(directory) {
    Ok(metadata) => metadata,
    Err(error) if error.kind() == ErrorKind::NotFound => return Ok(()),
    Err(error) => return Err(error.to_string()),
  };
  if metadata.file_type().is_symlink() || !metadata.is_dir() {
    return Ok(());
  }
  let children = fs::read_dir(directory)
    .map_err(|error| error.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| error.to_string())?;
  for child in children {
    let path = child.path();
    if fs::symlink_metadata(&path)
      .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
      .unwrap_or(false)
    {
      remove_empty_directories(&path, root)?;
    }
  }
  if directory != root
    && fs::read_dir(directory)
      .map_err(|error| error.to_string())?
      .next()
      .is_none()
  {
    match fs::remove_dir(directory) {
      Ok(()) => {}
      Err(error) if matches!(error.kind(), ErrorKind::NotFound | ErrorKind::DirectoryNotEmpty) => {}
      Err(error) => return Err(error.to_string()),
    }
  }
  Ok(())
}

fn cleanup(vault_root: &Path, retention_days: u32) -> Result<CleanupReport, String> {
  let retention_days = normalized_retention_days(retention_days)?;
  let root = archive_root(vault_root)?;
  let cutoff = SystemTime::now()
    .checked_sub(Duration::from_secs(u64::from(retention_days) * 24 * 60 * 60))
    .unwrap_or(UNIX_EPOCH);
  let mut files = Vec::new();
  collect_files(&root, &mut files)?;
  let mut report = CleanupReport::default();
  for path in files {
    let metadata = match fs::metadata(&path) {
      Ok(metadata) => metadata,
      Err(error) if error.kind() == ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    let expired = metadata.modified().map(|modified| modified <= cutoff).unwrap_or(false);
    if expired {
      match fs::remove_file(&path) {
        Ok(()) => report.deleted_files += 1,
        Err(error) if error.kind() == ErrorKind::NotFound => {}
        Err(error) => return Err(error.to_string()),
      }
    } else {
      report.remaining_files += 1;
    }
  }
  remove_empty_directories(&root, &root)?;
  Ok(report)
}

fn entries(vault_root: &Path) -> Result<Vec<Value>, String> {
  let mut files = Vec::new();
  collect_files(&archive_root(vault_root)?, &mut files)?;
  files.sort();
  let mut output = Vec::new();
  for path in files {
    let metadata = match fs::metadata(&path) {
      Ok(metadata) => metadata,
      Err(error) if error.kind() == ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    let relative = path
      .strip_prefix(vault_root)
      .unwrap_or(&path)
      .to_string_lossy()
      .replace('\\', "/");
    let modified_ms = metadata
      .modified()
      .ok()
      .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
      .map(|value| value.as_millis() as u64)
      .unwrap_or_default();
    output.push(json!({
      "path": relative,
      "size": metadata.len(),
      "modifiedMs": modified_ms
    }));
  }
  Ok(output)
}

fn status_value(
  vault_root: &Path,
  settings: &ConflictSettings,
  report: &CleanupReport,
) -> Result<Value, String> {
  let entries = entries(vault_root)?;
  Ok(json!({
    "retentionDays": settings.retention_days,
    "defaultRetentionDays": DEFAULT_RETENTION_DAYS,
    "minimumRetentionDays": MIN_RETENTION_DAYS,
    "maximumRetentionDays": MAX_RETENTION_DAYS,
    "archivePath": CONFLICT_ARCHIVE_DIR,
    "deletedFiles": report.deleted_files,
    "storedFiles": entries.len(),
    "entries": entries
  }))
}

pub fn conflict_status(vault_root: &Path, perform_cleanup: bool) -> Result<Value, String> {
  let settings = read_settings(vault_root);
  let report = if perform_cleanup {
    cleanup(vault_root, settings.retention_days)?
  } else {
    CleanupReport::default()
  };
  status_value(vault_root, &settings, &report)
}

pub fn conflict_settings_set(vault_root: &Path, retention_days: u32) -> Result<Value, String> {
  let settings = ConflictSettings {
    retention_days: normalized_retention_days(retention_days)?,
  };
  write_settings(vault_root, &settings)?;
  let report = cleanup(vault_root, settings.retention_days)?;
  status_value(vault_root, &settings, &report)
}

fn validated_conflict_file(vault_root: &Path, relative_path: &str) -> Result<PathBuf, String> {
  let normalized = relative_path.replace('\\', "/");
  if normalized == CONFLICT_ARCHIVE_DIR
    || !normalized.starts_with(&format!("{CONFLICT_ARCHIVE_DIR}/"))
  {
    return Err("Only files inside the local .conflit archive can be managed".to_string());
  }
  let path = safe_join(vault_root, &normalized)?;
  let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
  if metadata.file_type().is_symlink() || !metadata.is_file() {
    return Err(format!("Conflict copy is not a regular file: {normalized}"));
  }
  let canonical_root = fs::canonicalize(vault_root).map_err(|error| error.to_string())?;
  let canonical_archive = fs::canonicalize(archive_root(vault_root)?)
    .map_err(|error| error.to_string())?;
  let canonical_path = fs::canonicalize(&path).map_err(|error| error.to_string())?;
  if !canonical_archive.starts_with(&canonical_root) || !canonical_path.starts_with(&canonical_archive) {
    return Err("Conflict copy resolves outside the active vault archive".to_string());
  }
  Ok(canonical_path)
}

fn restored_name(archive_path: &Path) -> Result<(String, String), String> {
  let file_name = archive_path
    .file_name()
    .and_then(|value| value.to_str())
    .ok_or_else(|| "Conflict copy has no valid file name".to_string())?;
  let extension = archive_path
    .extension()
    .and_then(|value| value.to_str())
    .unwrap_or_default()
    .to_string();
  let stem = archive_path.file_stem().and_then(|value| value.to_str()).unwrap_or("conflict");
  let before_conflict = stem.rsplit_once("-conflict-").map(|(value, _)| value).unwrap_or(stem);
  let original_stem = before_conflict
    .rsplit_once('.')
    .map(|(value, _)| value)
    .filter(|value| !value.is_empty())
    .unwrap_or(before_conflict)
    .to_string();
  if original_stem.is_empty() {
    return Err(format!("Cannot derive a restore name from {file_name}"));
  }
  Ok((original_stem, extension))
}

fn unique_restore_path(vault_root: &Path, archive_path: &Path) -> Result<PathBuf, String> {
  let canonical_root = fs::canonicalize(vault_root).map_err(|error| error.to_string())?;
  let canonical_archive = fs::canonicalize(archive_root(vault_root)?)
    .map_err(|error| error.to_string())?;
  let archive_relative = archive_path
    .strip_prefix(&canonical_archive)
    .map_err(|_| "Conflict copy is outside the local archive".to_string())?;
  let parent = archive_relative.parent().unwrap_or_else(|| Path::new(""));
  let destination_directory = safe_join(vault_root, &parent.to_string_lossy())?;
  fs::create_dir_all(&destination_directory).map_err(|error| error.to_string())?;
  let destination_directory = fs::canonicalize(destination_directory).map_err(|error| error.to_string())?;
  if !destination_directory.starts_with(&canonical_root) {
    return Err("Conflict restore directory resolves outside the active vault".to_string());
  }
  let (stem, extension) = restored_name(archive_path)?;
  let original_name = if extension.is_empty() {
    stem.clone()
  } else {
    format!("{stem}.{extension}")
  };
  let original = destination_directory.join(original_name);
  if !original.exists() {
    return Ok(original);
  }
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs())
    .unwrap_or_default();
  for index in 0..1000_u32 {
    let suffix = if index == 0 {
      format!("restored-{timestamp}")
    } else {
      format!("restored-{timestamp}-{index}")
    };
    let name = if extension.is_empty() {
      format!("{stem}.{suffix}")
    } else {
      format!("{stem}.{suffix}.{extension}")
    };
    let candidate = destination_directory.join(name);
    if !candidate.exists() {
      return Ok(candidate);
    }
  }
  Err("Unable to allocate a unique restored conflict path".to_string())
}

pub fn conflict_restore(vault_root: &Path, relative_path: &str) -> Result<Value, String> {
  let source = validated_conflict_file(vault_root, relative_path)?;
  let destination = unique_restore_path(vault_root, &source)?;
  fs::copy(&source, &destination).map_err(|error| error.to_string())?;
  let restored_path = destination
    .strip_prefix(fs::canonicalize(vault_root).map_err(|error| error.to_string())?)
    .unwrap_or(&destination)
    .to_string_lossy()
    .replace('\\', "/");
  let settings = read_settings(vault_root);
  let report = cleanup(vault_root, settings.retention_days)?;
  let mut value = status_value(vault_root, &settings, &report)?;
  value["restoredPath"] = Value::String(restored_path);
  Ok(value)
}

pub fn conflict_delete(vault_root: &Path, relative_path: &str) -> Result<Value, String> {
  let source = validated_conflict_file(vault_root, relative_path)?;
  fs::remove_file(source).map_err(|error| error.to_string())?;
  let root = archive_root(vault_root)?;
  remove_empty_directories(&root, &root)?;
  let settings = read_settings(vault_root);
  status_value(vault_root, &settings, &CleanupReport::default())
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-sync-conflicts-{name}-{}-{}",
      std::process::id(),
      SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
    ))
  }

  #[test]
  fn retention_defaults_to_three_days_and_is_device_local() {
    let root = temp_root("retention");
    fs::create_dir_all(&root).unwrap();
    assert_eq!(conflict_status(&root, false).unwrap()["retentionDays"], 3);
    assert_eq!(conflict_settings_set(&root, 12).unwrap()["retentionDays"], 12);
    assert!(root.join(CONFLICT_SETTINGS_FILE).is_file());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn restore_never_overwrites_the_current_note() {
    let root = temp_root("restore");
    fs::create_dir_all(root.join(".conflit/Notes")).unwrap();
    fs::create_dir_all(root.join("Notes")).unwrap();
    fs::write(root.join("Notes/A.md"), "current").unwrap();
    let archived = ".conflit/Notes/A.device-conflict-abcd-100.md";
    fs::write(root.join(archived), "older").unwrap();
    let result = conflict_restore(&root, archived).unwrap();
    let restored = result["restoredPath"].as_str().unwrap();
    assert_ne!(restored, "Notes/A.md");
    assert_eq!(fs::read_to_string(root.join("Notes/A.md")).unwrap(), "current");
    assert_eq!(fs::read_to_string(root.join(restored)).unwrap(), "older");
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn conflict_actions_reject_paths_outside_the_archive() {
    let root = temp_root("outside");
    fs::create_dir_all(&root).unwrap();
    fs::write(root.join("Note.md"), "note").unwrap();
    assert!(conflict_delete(&root, "Note.md").is_err());
    let _ = fs::remove_dir_all(root);
  }

  #[cfg(unix)]
  #[test]
  fn conflict_actions_reject_symlinked_archive_files() {
    use std::os::unix::fs::symlink;
    let root = temp_root("symlink");
    fs::create_dir_all(root.join(".conflit")).unwrap();
    fs::write(root.join("secret.md"), "secret").unwrap();
    symlink(root.join("secret.md"), root.join(".conflit/link.md")).unwrap();
    assert!(conflict_restore(&root, ".conflit/link.md").is_err());
    let _ = fs::remove_dir_all(root);
  }
}

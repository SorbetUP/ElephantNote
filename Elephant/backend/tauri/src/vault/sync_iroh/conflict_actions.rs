fn validated_conflict_path(
  cwd: &std::path::Path,
  relative_path: &str,
) -> Result<std::path::PathBuf, String> {
  let normalized = relative_path.replace('\\', "/");
  if normalized == CONFLICT_ARCHIVE_DIR
    || !normalized.starts_with(&format!("{CONFLICT_ARCHIVE_DIR}/"))
  {
    return Err("Only files inside the local .conflit archive can be managed.".to_string());
  }
  let path = crate::sync::manifest::safe_join(cwd, &normalized)?;
  if !path.is_file() {
    return Err(format!("Conflict copy does not exist: {normalized}"));
  }
  Ok(path)
}

fn restored_file_name(archive_path: &std::path::Path) -> Result<(String, String), String> {
  let file_name = archive_path
    .file_name()
    .and_then(|value| value.to_str())
    .ok_or_else(|| "Conflict copy has no valid file name.".to_string())?;
  let extension = archive_path
    .extension()
    .and_then(|value| value.to_str())
    .map(str::to_string)
    .unwrap_or_default();
  let stem = archive_path
    .file_stem()
    .and_then(|value| value.to_str())
    .unwrap_or("conflict");
  let before_conflict = stem
    .split_once("-conflict-")
    .map(|(value, _)| value)
    .unwrap_or(stem);
  let original_stem = before_conflict
    .rsplit_once('.')
    .map(|(value, _device)| value)
    .filter(|value| !value.is_empty())
    .unwrap_or(before_conflict)
    .to_string();
  if original_stem.is_empty() {
    return Err(format!("Cannot derive a restore name from {file_name}."));
  }
  Ok((original_stem, extension))
}

fn unique_restore_path(
  cwd: &std::path::Path,
  archive_path: &std::path::Path,
) -> Result<std::path::PathBuf, String> {
  let archive_root = conflict_archive_root(cwd);
  let archive_relative = archive_path
    .strip_prefix(&archive_root)
    .map_err(|_| "Conflict copy is outside the local archive.".to_string())?;
  let parent = archive_relative.parent().unwrap_or_else(|| std::path::Path::new(""));
  let destination_directory = cwd.join(parent);
  std::fs::create_dir_all(&destination_directory).map_err(|error| error.to_string())?;
  let (stem, extension) = restored_file_name(archive_path)?;
  let original_name = if extension.is_empty() {
    stem.clone()
  } else {
    format!("{stem}.{extension}")
  };
  let original = destination_directory.join(original_name);
  if !original.exists() {
    return Ok(original);
  }

  let timestamp = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
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
  Err("Unable to allocate a unique restored conflict path.".to_string())
}

pub fn sync_conflict_restore(
  vault: super::types::VaultDescriptor,
  relative_path: String,
) -> Result<serde_json::Value, String> {
  let cwd = std::path::PathBuf::from(&vault.path);
  let source = validated_conflict_path(&cwd, &relative_path)?;
  let destination = unique_restore_path(&cwd, &source)?;
  std::fs::copy(&source, &destination).map_err(|error| error.to_string())?;
  let restored_path = destination
    .strip_prefix(&cwd)
    .unwrap_or(&destination)
    .to_string_lossy()
    .replace('\\', "/");
  let settings = read_conflict_settings(&cwd);
  let cleanup = cleanup_conflict_archive(&cwd, settings.retention_days)?;
  let mut value = conflict_settings_value(&vault, &settings, &cleanup)?;
  value["restoredPath"] = serde_json::Value::String(restored_path);
  Ok(value)
}

pub fn sync_conflict_delete(
  vault: super::types::VaultDescriptor,
  relative_path: String,
) -> Result<serde_json::Value, String> {
  let cwd = std::path::PathBuf::from(&vault.path);
  let source = validated_conflict_path(&cwd, &relative_path)?;
  std::fs::remove_file(source).map_err(|error| error.to_string())?;
  let root = conflict_archive_root(&cwd);
  remove_empty_conflict_directories(&root, &root)?;
  let settings = read_conflict_settings(&cwd);
  conflict_settings_value(&vault, &settings, &ConflictCleanupReport::default())
}

#[cfg(test)]
mod conflict_action_tests {
  use super::*;

  fn test_vault(root: &std::path::Path) -> super::types::VaultDescriptor {
    super::types::VaultDescriptor {
      id: "conflict-test".to_string(),
      name: "Conflict Test".to_string(),
      path: root.to_string_lossy().to_string(),
      icon: String::new(),
      last_opened_at: "0".to_string(),
    }
  }

  fn temp_root() -> std::path::PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-conflict-actions-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  #[test]
  fn restore_never_overwrites_the_current_note() {
    let root = temp_root();
    std::fs::create_dir_all(root.join(".conflit/Notes")).unwrap();
    std::fs::create_dir_all(root.join("Notes")).unwrap();
    std::fs::write(root.join("Notes/A.md"), "current").unwrap();
    let archived = ".conflit/Notes/A.device-conflict-abcd-100.md";
    std::fs::write(root.join(archived), "older").unwrap();

    let result = sync_conflict_restore(test_vault(&root), archived.to_string()).unwrap();
    let restored = result["restoredPath"].as_str().unwrap();
    assert_ne!(restored, "Notes/A.md");
    assert_eq!(std::fs::read_to_string(root.join("Notes/A.md")).unwrap(), "current");
    assert_eq!(std::fs::read_to_string(root.join(restored)).unwrap(), "older");
    let _ = std::fs::remove_dir_all(root);
  }

  #[test]
  fn conflict_actions_reject_paths_outside_the_archive() {
    let root = temp_root();
    std::fs::create_dir_all(&root).unwrap();
    std::fs::write(root.join("Note.md"), "note").unwrap();
    assert!(sync_conflict_delete(test_vault(&root), "Note.md".to_string()).is_err());
    let _ = std::fs::remove_dir_all(root);
  }
}

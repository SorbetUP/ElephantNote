use serde::Serialize;
use std::{
  fs,
  io::ErrorKind,
  path::{Path, PathBuf},
};

use crate::manifest::safe_join;
use crate::plan::{PreserveSpec, SyncPlan};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalApplySummary {
  pub preserved: usize,
  pub directories_created: usize,
  pub files_deleted: usize,
  pub directories_deleted: usize,
}

fn ensure_no_symlink_components(root: &Path, path: &Path, include_leaf: bool) -> Result<(), String> {
  let relative = path
    .strip_prefix(root)
    .map_err(|_| "local Sync operation escaped the vault root".to_string())?;
  let mut current = PathBuf::from(root);
  let components = relative.components().collect::<Vec<_>>();
  let limit = if include_leaf {
    components.len()
  } else {
    components.len().saturating_sub(1)
  };

  for component in components.into_iter().take(limit) {
    current.push(component.as_os_str());
    match fs::symlink_metadata(&current) {
      Ok(metadata) if metadata.file_type().is_symlink() => {
        return Err(format!(
          "local Sync operation crosses a symbolic link: {}",
          current.display()
        ));
      }
      Ok(metadata) if !metadata.is_dir() && current != path => {
        return Err(format!(
          "local Sync operation parent is not a directory: {}",
          current.display()
        ));
      }
      Ok(_) => {}
      Err(error) if error.kind() == ErrorKind::NotFound => break,
      Err(error) => return Err(error.to_string()),
    }
  }
  Ok(())
}

fn preserve_paths(root: &Path, items: &[PreserveSpec]) -> Result<usize, String> {
  let mut preserved = 0;
  for item in items {
    let source = safe_join(root, &item.source_path)?;
    ensure_no_symlink_components(root, &source, true)?;
    let source_metadata = match fs::symlink_metadata(&source) {
      Ok(metadata) => metadata,
      Err(error) if error.kind() == ErrorKind::NotFound => continue,
      Err(error) => return Err(error.to_string()),
    };
    if source_metadata.file_type().is_symlink() {
      return Err(format!(
        "local Sync preserve source is a symbolic link: {}",
        item.source_path
      ));
    }

    let target = safe_join(root, &item.target_path)?;
    ensure_no_symlink_components(root, &target, false)?;
    if let Ok(metadata) = fs::symlink_metadata(&target) {
      if metadata.file_type().is_symlink() {
        return Err(format!(
          "local Sync preserve target is a symbolic link: {}",
          item.target_path
        ));
      }
    }
    if let Some(parent) = target.parent() {
      fs::create_dir_all(parent).map_err(|error| error.to_string())?;
      ensure_no_symlink_components(root, &target, false)?;
    }
    if source_metadata.is_dir() {
      fs::create_dir_all(&target).map_err(|error| error.to_string())?;
    } else if source_metadata.is_file() {
      fs::copy(&source, &target).map_err(|error| error.to_string())?;
    } else {
      return Err(format!(
        "local Sync preserve source is not a regular file or directory: {}",
        item.source_path
      ));
    }
    preserved += 1;
  }
  Ok(preserved)
}

fn create_directories(root: &Path, directories: &[String]) -> Result<usize, String> {
  let mut created = 0;
  for relative in directories {
    let path = safe_join(root, relative)?;
    ensure_no_symlink_components(root, &path, true)?;
    match fs::symlink_metadata(&path) {
      Ok(metadata) if metadata.file_type().is_symlink() => {
        return Err(format!("local Sync directory is a symbolic link: {relative}"));
      }
      Ok(metadata) if !metadata.is_dir() => {
        return Err(format!("local Sync directory path is occupied by a file: {relative}"));
      }
      Ok(_) => {}
      Err(error) if error.kind() == ErrorKind::NotFound => {
        ensure_no_symlink_components(root, &path, false)?;
        fs::create_dir_all(&path).map_err(|error| error.to_string())?;
        ensure_no_symlink_components(root, &path, true)?;
        created += 1;
      }
      Err(error) => return Err(error.to_string()),
    }
  }
  Ok(created)
}

fn delete_files(root: &Path, paths: &[String]) -> Result<usize, String> {
  let mut deleted = 0;
  for relative in paths {
    let path = safe_join(root, relative)?;
    ensure_no_symlink_components(root, &path, true)?;
    match fs::symlink_metadata(&path) {
      Ok(metadata) if metadata.file_type().is_symlink() => {
        return Err(format!("local Sync refuses to delete a symbolic link: {relative}"));
      }
      Ok(metadata) if metadata.is_file() => {
        fs::remove_file(path).map_err(|error| error.to_string())?;
        deleted += 1;
      }
      Ok(_) => {}
      Err(error) if error.kind() == ErrorKind::NotFound => {}
      Err(error) => return Err(error.to_string()),
    }
  }
  Ok(deleted)
}

fn delete_empty_directories(root: &Path, paths: &[String]) -> Result<usize, String> {
  let mut paths = paths.to_vec();
  paths.sort_by_key(|path| std::cmp::Reverse(path.matches('/').count()));
  let mut deleted = 0;
  for relative in paths {
    let path = safe_join(root, &relative)?;
    ensure_no_symlink_components(root, &path, true)?;
    match fs::symlink_metadata(&path) {
      Ok(metadata) if metadata.file_type().is_symlink() => {
        return Err(format!("local Sync refuses to delete a symbolic link: {relative}"));
      }
      Ok(metadata) if metadata.is_dir() => {
        if path.read_dir().map_err(|error| error.to_string())?.next().is_none() {
          fs::remove_dir(path).map_err(|error| error.to_string())?;
          deleted += 1;
        }
      }
      Ok(_) => {}
      Err(error) if error.kind() == ErrorKind::NotFound => {}
      Err(error) => return Err(error.to_string()),
    }
  }
  Ok(deleted)
}

pub fn apply_local_plan(root: &Path, plan: &SyncPlan) -> Result<LocalApplySummary, String> {
  Ok(LocalApplySummary {
    preserved: preserve_paths(root, &plan.preserve_local)?,
    directories_created: create_directories(root, &plan.create_dirs_local)?,
    files_deleted: delete_files(root, &plan.delete_files_local)?,
    directories_deleted: delete_empty_directories(root, &plan.delete_dirs_local)?,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::plan::PreserveSpec;

  fn temp_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-sync-local-ops-{name}-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  #[test]
  fn applies_preserve_create_and_delete_operations_inside_the_vault() {
    let root = temp_root("apply");
    fs::create_dir_all(root.join("Notes/empty")).unwrap();
    fs::write(root.join("Notes/A.md"), "local").unwrap();
    fs::write(root.join("Notes/delete.md"), "delete").unwrap();

    let plan = SyncPlan {
      preserve_local: vec![PreserveSpec {
        source_path: "Notes/A.md".to_string(),
        target_path: ".conflit/Notes/A.local-conflict.md".to_string(),
      }],
      create_dirs_local: vec!["Imported/Subfolder".to_string()],
      delete_files_local: vec!["Notes/delete.md".to_string()],
      delete_dirs_local: vec!["Notes/empty".to_string()],
      ..SyncPlan::default()
    };

    let summary = apply_local_plan(&root, &plan).unwrap();
    assert_eq!(summary.preserved, 1);
    assert_eq!(summary.directories_created, 1);
    assert_eq!(summary.files_deleted, 1);
    assert_eq!(summary.directories_deleted, 1);
    assert!(root.join(".conflit/Notes/A.local-conflict.md").is_file());
    assert!(root.join("Imported/Subfolder").is_dir());
    assert!(!root.join("Notes/delete.md").exists());
    assert!(!root.join("Notes/empty").exists());
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn refuses_operations_that_escape_the_vault() {
    let root = temp_root("escape");
    fs::create_dir_all(&root).unwrap();
    let plan = SyncPlan {
      delete_files_local: vec!["../outside.md".to_string()],
      ..SyncPlan::default()
    };
    assert!(apply_local_plan(&root, &plan).is_err());
    let _ = fs::remove_dir_all(root);
  }

  #[cfg(unix)]
  #[test]
  fn refuses_operations_through_a_symlinked_parent() {
    use std::os::unix::fs::symlink;

    let root = temp_root("symlink");
    let outside = temp_root("outside");
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("secret.md"), "outside").unwrap();
    symlink(&outside, root.join("Notes")).unwrap();

    let plan = SyncPlan {
      delete_files_local: vec!["Notes/secret.md".to_string()],
      ..SyncPlan::default()
    };
    assert!(apply_local_plan(&root, &plan).is_err());
    assert!(outside.join("secret.md").is_file());

    let _ = fs::remove_dir_all(root);
    let _ = fs::remove_dir_all(outside);
  }
}

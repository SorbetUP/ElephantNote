use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRecord {
  pub path: String,
  pub size: u64,
  pub modified_ms: u64,
  pub hash: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultManifest {
  pub files: BTreeMap<String, FileRecord>,
  pub directories: BTreeSet<String>,
}

impl VaultManifest {
  pub fn content_equals(&self, other: &Self) -> bool {
    if self.directories != other.directories || self.files.len() != other.files.len() {
      return false;
    }
    self.files.iter().all(|(path, left)| {
      other
        .files
        .get(path)
        .is_some_and(|right| same_content(Some(left), Some(right)))
    })
  }
}

pub fn same_content(left: Option<&FileRecord>, right: Option<&FileRecord>) -> bool {
  match (left, right) {
    (None, None) => true,
    (Some(left), Some(right)) => left.hash == right.hash && left.size == right.size,
    _ => false,
  }
}

pub fn normalize_relative(path: &Path) -> String {
  path.to_string_lossy().replace('\\', "/")
}

pub fn safe_join(root: &Path, relative: &str) -> Result<PathBuf, String> {
  if relative.trim().is_empty() {
    return Err("empty vault-relative path".to_string());
  }
  let path = Path::new(relative);
  if path.is_absolute() {
    return Err("absolute paths are not accepted by vault sync".to_string());
  }
  for component in path.components() {
    if !matches!(component, Component::Normal(_)) {
      return Err(format!("unsafe vault-relative path: {relative}"));
    }
  }
  Ok(root.join(path))
}

fn path_is_or_is_below(normalized: &str, root: &str) -> bool {
  normalized == root || normalized.starts_with(&format!("{root}/"))
}

fn excluded(relative: &Path, name: &str) -> bool {
  if matches!(name, ".git" | "node_modules" | ".DS_Store" | "Thumbs.db") {
    return true;
  }
  if name.ends_with('~')
    || name.ends_with(".tmp")
    || name.ends_with(".swp")
    || name.ends_with(".syncpart")
  {
    return true;
  }

  let normalized = normalize_relative(relative);
  path_is_or_is_below(&normalized, ".config")
    || path_is_or_is_below(&normalized, ".conflit")
    || path_is_or_is_below(&normalized, ".elephantnote/config")
    || path_is_or_is_below(&normalized, ".elephantnote/models")
    || path_is_or_is_below(&normalized, ".elephantnote/state")
    || path_is_or_is_below(&normalized, ".elephantnote/sync")
    || path_is_or_is_below(&normalized, ".elephantnote/cache")
    || path_is_or_is_below(&normalized, ".elephantnote/index")
    || path_is_or_is_below(&normalized, ".elephantnote/addons")
}

pub fn hash_file(path: &Path) -> Result<String, String> {
  let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
  let mut hasher = blake3::Hasher::new();
  let mut buffer = vec![0_u8; 256 * 1024];
  loop {
    let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
    if read == 0 {
      break;
    }
    hasher.update(&buffer[..read]);
  }
  Ok(hasher.finalize().to_hex().to_string())
}

fn walk(root: &Path, current: &Path, manifest: &mut VaultManifest) -> Result<(), String> {
  let mut entries = fs::read_dir(current)
    .map_err(|error| error.to_string())?
    .collect::<Result<Vec<_>, _>>()
    .map_err(|error| error.to_string())?;
  entries.sort_by_key(|entry| entry.file_name());

  for entry in entries {
    let path = entry.path();
    let relative = path.strip_prefix(root).map_err(|error| error.to_string())?;
    let name = entry.file_name().to_string_lossy().to_string();
    if excluded(relative, &name) {
      continue;
    }
    let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
    if metadata.file_type().is_symlink() {
      continue;
    }
    let relative_text = normalize_relative(relative);
    if metadata.is_dir() {
      manifest.directories.insert(relative_text);
      walk(root, &path, manifest)?;
    } else if metadata.is_file() {
      let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default();
      manifest.files.insert(
        relative_text.clone(),
        FileRecord {
          path: relative_text,
          size: metadata.len(),
          modified_ms,
          hash: hash_file(&path)?,
        },
      );
    }
  }
  Ok(())
}

pub fn scan_vault(root: &Path) -> Result<VaultManifest, String> {
  fs::create_dir_all(root).map_err(|error| error.to_string())?;
  let mut manifest = VaultManifest::default();
  walk(root, root, &mut manifest)?;
  Ok(manifest)
}

pub fn common_baseline(left: &VaultManifest, right: &VaultManifest) -> VaultManifest {
  let mut common = VaultManifest::default();
  for (path, record) in &left.files {
    if same_content(Some(record), right.files.get(path)) {
      common.files.insert(path.clone(), record.clone());
    }
  }
  common.directories = left
    .directories
    .intersection(&right.directories)
    .cloned()
    .collect();
  common
}

#[cfg(test)]
mod tests {
  use super::*;

  fn temp_root(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!(
      "elephant-sync-addon-{name}-{}-{}",
      std::process::id(),
      std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos()
    ))
  }

  #[test]
  fn safe_join_rejects_traversal() {
    assert!(safe_join(Path::new("/tmp/vault"), "../secret").is_err());
    assert!(safe_join(Path::new("/tmp/vault"), "/etc/passwd").is_err());
    assert!(safe_join(Path::new("/tmp/vault"), "Notes/a.md").is_ok());
  }

  #[test]
  fn package_scan_keeps_assets_and_excludes_runtime_state() {
    let root = temp_root("manifest");
    let _ = fs::remove_dir_all(&root);
    fs::create_dir_all(root.join(".assets")).unwrap();
    fs::create_dir_all(root.join(".elephantnote/addons/packages/elephant.sync")).unwrap();
    fs::create_dir_all(root.join(".elephantnote/sync")).unwrap();
    fs::write(root.join(".assets/image.png"), b"image").unwrap();
    fs::write(root.join(".elephantnote/addons/packages/elephant.sync/binary"), b"binary").unwrap();
    fs::write(root.join(".elephantnote/sync/state.json"), b"state").unwrap();

    let manifest = scan_vault(&root).unwrap();
    assert!(manifest.files.contains_key(".assets/image.png"));
    assert!(!manifest.files.contains_key(".elephantnote/addons/packages/elephant.sync/binary"));
    assert!(!manifest.files.contains_key(".elephantnote/sync/state.json"));
    let _ = fs::remove_dir_all(root);
  }

  #[test]
  fn content_equality_ignores_mtime() {
    let mut left = VaultManifest::default();
    left.files.insert(
      "a.md".to_string(),
      FileRecord {
        path: "a.md".to_string(),
        size: 4,
        modified_ms: 1,
        hash: "abcd".to_string(),
      },
    );
    let mut right = left.clone();
    right.files.get_mut("a.md").unwrap().modified_ms = 999;
    assert!(left.content_equals(&right));
  }
}

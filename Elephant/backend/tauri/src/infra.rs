use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io::{Error, ErrorKind, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);

fn temporary_path(path: &Path, attempt: u64) -> std::io::Result<PathBuf> {
  let parent = path.parent().unwrap_or_else(|| Path::new("."));
  let file_name = path
    .file_name()
    .ok_or_else(|| Error::new(ErrorKind::InvalidInput, "atomic write requires a file name"))?;
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_nanos();
  let sequence = TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed) + attempt;
  let mut temporary_name = OsString::from(".");
  temporary_name.push(file_name);
  temporary_name.push(format!(
    ".elephant-tmp-{}-{timestamp}-{sequence}",
    std::process::id()
  ));
  Ok(parent.join(temporary_name))
}

pub fn write_atomically(path: impl AsRef<Path>, bytes: &[u8]) -> std::io::Result<()> {
  let path = path.as_ref();
  let parent = path.parent().unwrap_or_else(|| Path::new("."));
  fs::create_dir_all(parent)?;

  let mut opened = None;
  for attempt in 0..32 {
    let candidate = temporary_path(path, attempt)?;
    match OpenOptions::new().write(true).create_new(true).open(&candidate) {
      Ok(file) => {
        opened = Some((candidate, file));
        break;
      }
      Err(error) if error.kind() == ErrorKind::AlreadyExists => continue,
      Err(error) => return Err(error),
    }
  }

  let (temporary, mut file) = opened.ok_or_else(|| {
    Error::new(
      ErrorKind::AlreadyExists,
      "unable to allocate a unique atomic-write temporary file",
    )
  })?;

  let result = (|| -> std::io::Result<()> {
    file.write_all(bytes)?;
    file.sync_all()?;
    drop(file);
    fs::rename(&temporary, path)?;

    // Persist the directory entry replacement on Unix filesystems. This is the
    // final durability boundary after the temporary file contents were synced.
    #[cfg(unix)]
    fs::File::open(parent)?.sync_all()?;

    Ok(())
  })();

  if result.is_err() {
    let _ = fs::remove_file(&temporary);
  }
  result
}

pub fn write_json_atomically<T: serde::Serialize>(path: impl AsRef<Path>, value: &T) -> std::io::Result<()> {
  let bytes = serde_json::to_vec_pretty(value)
    .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err))?;
  write_atomically(path, &bytes)
}

pub fn read_json_or<T: serde::de::DeserializeOwned>(path: impl AsRef<Path>, fallback: T) -> T {
  match fs::read(path.as_ref()) {
    Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or(fallback),
    Err(_) => fallback,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use serde::{Deserialize, Serialize};
  use std::fs;

  #[derive(Serialize, Deserialize, PartialEq, Debug, Clone)]
  struct Sample {
    name: String,
    n: u32,
  }

  #[test]
  fn atomic_write_roundtrips_json() {
    let dir = std::env::temp_dir().join(format!("elephantnote_test_{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("sample.json");
    let value = Sample { name: "elephant".into(), n: 42 };
    write_json_atomically(&path, &value).unwrap();
    let result: Sample = read_json_or(&path, Sample { name: "fallback".into(), n: 0 });
    assert_eq!(result, value);
    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn atomic_write_replaces_existing() {
    let dir = std::env::temp_dir().join(format!("elephantnote_test2_{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("replace.json");
    write_json_atomically(&path, &Sample { name: "old".into(), n: 1 }).unwrap();
    write_json_atomically(&path, &Sample { name: "new".into(), n: 2 }).unwrap();
    let result: Sample = read_json_or(&path, Sample { name: "fallback".into(), n: 0 });
    assert_eq!(result.name, "new");
    assert_eq!(result.n, 2);
    let leftovers = fs::read_dir(&dir)
      .unwrap()
      .filter_map(Result::ok)
      .filter(|entry| entry.file_name().to_string_lossy().contains("elephant-tmp"))
      .count();
    assert_eq!(leftovers, 0);
    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn atomic_write_does_not_overwrite_precreated_legacy_temp_file() {
    let dir = std::env::temp_dir().join(format!("elephantnote_test3_{}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    let path = dir.join("note.md");
    let legacy_temp = path.with_extension("md.tmp");
    fs::write(&legacy_temp, "must remain untouched").unwrap();
    write_atomically(&path, b"safe markdown").unwrap();
    assert_eq!(fs::read_to_string(&path).unwrap(), "safe markdown");
    assert_eq!(fs::read_to_string(&legacy_temp).unwrap(), "must remain untouched");
    fs::remove_dir_all(&dir).ok();
  }

  #[test]
  fn read_json_or_falls_back_when_missing() {
    let path = Path::new("/nonexistent/elephantnote_test/missing.json");
    let v: Sample = read_json_or(path, Sample { name: "fallback".into(), n: 7 });
    assert_eq!(v.n, 7);
  }
}

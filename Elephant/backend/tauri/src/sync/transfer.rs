use iroh::endpoint::Connection;
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::manifest::{hash_file, safe_join};
use super::plan::{PreserveSpec, TransferSpec};
use super::protocol::{read_file_header, write_file_header, FileHeader, FILE_CHUNK_SIZE};

pub fn create_directories(root: &Path, directories: &[String]) -> Result<(), String> {
  for relative in directories {
    let path = safe_join(root, relative)?;
    std::fs::create_dir_all(path).map_err(|error| error.to_string())?;
  }
  Ok(())
}

pub fn preserve_paths(root: &Path, items: &[PreserveSpec]) -> Result<(), String> {
  for item in items {
    let source = safe_join(root, &item.source_path)?;
    if !source.exists() {
      continue;
    }
    let target = safe_join(root, &item.target_path)?;
    if let Some(parent) = target.parent() {
      std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    if source.is_dir() {
      std::fs::create_dir_all(&target).map_err(|error| error.to_string())?;
    } else {
      std::fs::copy(&source, &target).map_err(|error| error.to_string())?;
    }
  }
  Ok(())
}

pub fn delete_files(root: &Path, paths: &[String]) -> Result<(), String> {
  for relative in paths {
    let path = safe_join(root, relative)?;
    if path.is_file() {
      std::fs::remove_file(path).map_err(|error| error.to_string())?;
    }
  }
  Ok(())
}

pub fn delete_directories(root: &Path, paths: &[String]) -> Result<(), String> {
  let mut paths = paths.to_vec();
  paths.sort_by_key(|path| std::cmp::Reverse(path.matches('/').count()));
  for relative in paths {
    let path = safe_join(root, &relative)?;
    if path.is_dir() && path.read_dir().map_err(|error| error.to_string())?.next().is_none() {
      std::fs::remove_dir(path).map_err(|error| error.to_string())?;
    }
  }
  Ok(())
}

pub async fn send_file(connection: &Connection, root: &Path, spec: &TransferSpec) -> Result<u64, String> {
  let source = safe_join(root, &spec.source_path)?;
  let metadata = tokio::fs::metadata(&source).await.map_err(|error| error.to_string())?;
  if !metadata.is_file() {
    return Err(format!("sync source is not a regular file: {}", spec.source_path));
  }
  if metadata.len() != spec.size {
    return Err(format!("file changed before sync transfer: {}", spec.source_path));
  }
  let mut send = connection.open_uni().await.map_err(|error| error.to_string())?;
  let header = FileHeader {
    transfer_id: spec.transfer_id.clone(),
    source_path: spec.source_path.clone(),
    target_path: spec.target_path.clone(),
    size: spec.size,
    hash: spec.hash.clone(),
  };
  write_file_header(&mut send, &header).await?;
  let mut file = tokio::fs::File::open(source).await.map_err(|error| error.to_string())?;
  let mut buffer = vec![0_u8; FILE_CHUNK_SIZE];
  let mut total = 0_u64;
  loop {
    let read = file.read(&mut buffer).await.map_err(|error| error.to_string())?;
    if read == 0 {
      break;
    }
    send.write_all(&buffer[..read]).await.map_err(|error| error.to_string())?;
    total += read as u64;
  }
  send.finish().map_err(|error| error.to_string())?;
  if total != spec.size {
    return Err(format!("file changed during sync: {}", spec.source_path));
  }
  Ok(total)
}

fn validate_header(header: &FileHeader, expected: &TransferSpec) -> Result<(), String> {
  if header.transfer_id != expected.transfer_id
    || header.source_path != expected.source_path
    || header.target_path != expected.target_path
    || header.size != expected.size
    || header.hash != expected.hash
  {
    return Err(format!(
      "incoming file stream does not match negotiated transfer {}",
      expected.transfer_id
    ));
  }
  Ok(())
}

pub async fn receive_file(
  connection: &Connection,
  root: &Path,
  expected: &TransferSpec,
) -> Result<(FileHeader, u64), String> {
  let mut recv = connection.accept_uni().await.map_err(|error| error.to_string())?;
  let header = read_file_header(&mut recv).await?;
  validate_header(&header, expected)?;
  let target = safe_join(root, &header.target_path)?;
  if let Some(parent) = target.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(|error| error.to_string())?;
  }
  if target.is_dir() {
    return Err(format!(
      "cannot replace directory with incoming file without resolving namespace conflict: {}",
      header.target_path
    ));
  }
  let filename = target.file_name().and_then(|value| value.to_str()).unwrap_or("incoming");
  let temporary = target.with_file_name(format!(".{filename}.{}.syncpart", header.transfer_id));
  let mut file = tokio::fs::File::create(&temporary).await.map_err(|error| error.to_string())?;
  let mut buffer = vec![0_u8; FILE_CHUNK_SIZE];
  let mut total = 0_u64;
  loop {
    let read = recv.read(&mut buffer).await.map_err(|error| error.to_string())?;
    if read == 0 {
      break;
    }
    file.write_all(&buffer[..read]).await.map_err(|error| error.to_string())?;
    total += read as u64;
    if total > header.size {
      let _ = tokio::fs::remove_file(&temporary).await;
      return Err(format!("received too much data for {}", header.target_path));
    }
  }
  file.flush().await.map_err(|error| error.to_string())?;
  drop(file);
  if total != header.size {
    let _ = tokio::fs::remove_file(&temporary).await;
    return Err(format!("incomplete file transfer for {}", header.target_path));
  }
  let actual_hash = hash_file(&temporary)?;
  if actual_hash != header.hash {
    let _ = tokio::fs::remove_file(&temporary).await;
    return Err(format!("hash mismatch for {}", header.target_path));
  }
  if target.exists() {
    tokio::fs::remove_file(&target).await.map_err(|error| error.to_string())?;
  }
  tokio::fs::rename(&temporary, &target).await.map_err(|error| error.to_string())?;
  Ok((header, total))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn rejects_a_file_header_outside_the_negotiated_plan() {
    let expected = TransferSpec {
      transfer_id: "one".to_string(),
      source_path: "A.md".to_string(),
      target_path: "A.md".to_string(),
      size: 10,
      hash: "abcd".to_string(),
    };
    let header = FileHeader {
      transfer_id: "one".to_string(),
      source_path: "A.md".to_string(),
      target_path: "Other.md".to_string(),
      size: 10,
      hash: "abcd".to_string(),
    };
    assert!(validate_header(&header, &expected).is_err());
  }
}

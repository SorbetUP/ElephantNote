use iroh::Connection;
use std::path::Path;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use crate::manifest::{hash_file, safe_join};
use crate::plan::TransferSpec;
use crate::protocol::{read_file_header, write_file_header, FileHeader, FILE_CHUNK_SIZE};

pub fn validate_header(header: &FileHeader, expected: &TransferSpec) -> Result<(), String> {
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

pub async fn send_file(
  connection: &Connection,
  root: &Path,
  spec: &TransferSpec,
) -> Result<u64, String> {
  let source = safe_join(root, &spec.source_path)?;
  let metadata = tokio::fs::metadata(&source).await.map_err(|error| error.to_string())?;
  if !metadata.is_file() {
    return Err(format!("sync source is not a regular file: {}", spec.source_path));
  }
  if metadata.len() != spec.size {
    return Err(format!("file changed before sync transfer: {}", spec.source_path));
  }

  let mut send = connection.open_uni().await.map_err(|error| error.to_string())?;
  write_file_header(
    &mut send,
    &FileHeader {
      transfer_id: spec.transfer_id.clone(),
      source_path: spec.source_path.clone(),
      target_path: spec.target_path.clone(),
      size: spec.size,
      hash: spec.hash.clone(),
    },
  )
  .await?;

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

pub async fn receive_file(
  connection: &Connection,
  root: &Path,
  expected: &TransferSpec,
) -> Result<(FileHeader, u64), String> {
  let mut recv = connection.accept_uni().await.map_err(|error| error.to_string())?;
  let header = read_file_header(&mut recv).await?;
  validate_header(&header, expected)?;

  let target = safe_join(root, &header.target_path)?;
  if target.is_dir() {
    return Err(format!(
      "cannot replace directory with incoming file without resolving namespace conflict: {}",
      header.target_path
    ));
  }
  if let Some(parent) = target.parent() {
    tokio::fs::create_dir_all(parent).await.map_err(|error| error.to_string())?;
  }
  let filename = target.file_name().and_then(|value| value.to_str()).unwrap_or("incoming");
  let temporary = target.with_file_name(format!(".{filename}.{}.syncpart", header.transfer_id));
  let mut file = tokio::fs::File::create(&temporary).await.map_err(|error| error.to_string())?;
  let mut buffer = vec![0_u8; FILE_CHUNK_SIZE];
  let mut total = 0_u64;

  loop {
    let read = recv.read(&mut buffer).await.map_err(|error| error.to_string())?;
    let Some(read) = read else {
      break;
    };
    if read == 0 {
      continue;
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

  #[test]
  fn validates_the_exact_negotiated_header() {
    let expected = TransferSpec {
      transfer_id: "one".to_string(),
      source_path: "A.md".to_string(),
      target_path: "B.md".to_string(),
      size: 10,
      hash: "abcd".to_string(),
    };
    let header = FileHeader {
      transfer_id: expected.transfer_id.clone(),
      source_path: expected.source_path.clone(),
      target_path: expected.target_path.clone(),
      size: expected.size,
      hash: expected.hash.clone(),
    };
    assert!(validate_header(&header, &expected).is_ok());
  }
}

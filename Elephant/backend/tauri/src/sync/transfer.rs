use iroh::endpoint::Connection;
use std::path::Path;
use std::time::Instant;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

use super::logging::SyncLogger;
use super::manifest::{hash_file, safe_join};
use super::plan::{PreserveSpec, TransferSpec};
use super::protocol::{read_file_header, write_file_header, FileHeader, FILE_CHUNK_SIZE};

fn quoted(value: &str) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| "\"<invalid>\"".to_string())
}

fn throughput_mib_per_second(bytes: u64, elapsed: std::time::Duration) -> f64 {
    let seconds = elapsed.as_secs_f64();
    if seconds <= 0.0 {
        0.0
    } else {
        bytes as f64 / 1024.0 / 1024.0 / seconds
    }
}

fn log_progress(
    logger: Option<&SyncLogger>,
    event: &str,
    path: &str,
    total: u64,
    size: u64,
    next_percent: &mut u64,
) {
    if size < (FILE_CHUNK_SIZE as u64 * 4) || size == 0 {
        return;
    }
    let percent = total.saturating_mul(100) / size;
    while *next_percent <= 90 && percent >= *next_percent {
        if let Some(logger) = logger {
            logger.event(
                event,
                format!(
                    "path={} bytes={total} total_bytes={size} percent={}",
                    quoted(path),
                    *next_percent
                ),
            );
        }
        *next_percent += 10;
    }
}

pub fn create_directories(root: &Path, directories: &[String]) -> Result<(), String> {
    create_directories_logged(root, directories, None, "local")
}

pub fn create_directories_logged(
    root: &Path,
    directories: &[String],
    logger: Option<&SyncLogger>,
    scope: &str,
) -> Result<(), String> {
    for relative in directories {
        if let Some(logger) = logger {
            logger.event(
                "directory:create",
                format!("scope={scope} path={}", quoted(relative)),
            );
        }
        let path = safe_join(root, relative)?;
        std::fs::create_dir_all(path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub fn preserve_paths(root: &Path, items: &[PreserveSpec]) -> Result<(), String> {
    preserve_paths_logged(root, items, None, "local")
}

pub fn preserve_paths_logged(
    root: &Path,
    items: &[PreserveSpec],
    logger: Option<&SyncLogger>,
    scope: &str,
) -> Result<(), String> {
    for item in items {
        let source = safe_join(root, &item.source_path)?;
        if !source.exists() {
            if let Some(logger) = logger {
                logger.event(
                    "preserve:skip",
                    format!(
                        "scope={scope} source={} reason=missing",
                        quoted(&item.source_path)
                    ),
                );
            }
            continue;
        }
        let target = safe_join(root, &item.target_path)?;
        if let Some(logger) = logger {
            logger.event(
                "preserve:start",
                format!(
                    "scope={scope} source={} target={}",
                    quoted(&item.source_path),
                    quoted(&item.target_path)
                ),
            );
        }
        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        if source.is_dir() {
            std::fs::create_dir_all(&target).map_err(|error| error.to_string())?;
        } else {
            std::fs::copy(&source, &target).map_err(|error| error.to_string())?;
        }
        if let Some(logger) = logger {
            logger.event(
                "preserve:complete",
                format!(
                    "scope={scope} source={} target={}",
                    quoted(&item.source_path),
                    quoted(&item.target_path)
                ),
            );
        }
    }
    Ok(())
}

pub fn delete_files(root: &Path, paths: &[String]) -> Result<(), String> {
    delete_files_logged(root, paths, None, "local")
}

pub fn delete_files_logged(
    root: &Path,
    paths: &[String],
    logger: Option<&SyncLogger>,
    scope: &str,
) -> Result<(), String> {
    for relative in paths {
        let path = safe_join(root, relative)?;
        if path.is_file() {
            if let Some(logger) = logger {
                logger.event(
                    "file:delete",
                    format!("scope={scope} path={}", quoted(relative)),
                );
            }
            std::fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub fn delete_directories(root: &Path, paths: &[String]) -> Result<(), String> {
    delete_directories_logged(root, paths, None, "local")
}

pub fn delete_directories_logged(
    root: &Path,
    paths: &[String],
    logger: Option<&SyncLogger>,
    scope: &str,
) -> Result<(), String> {
    let mut paths = paths.to_vec();
    paths.sort_by_key(|path| std::cmp::Reverse(path.matches('/').count()));
    for relative in paths {
        let path = safe_join(root, &relative)?;
        if path.is_dir()
            && path
                .read_dir()
                .map_err(|error| error.to_string())?
                .next()
                .is_none()
        {
            if let Some(logger) = logger {
                logger.event(
                    "directory:delete",
                    format!("scope={scope} path={}", quoted(&relative)),
                );
            }
            std::fs::remove_dir(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

pub async fn send_file(
    connection: &Connection,
    root: &Path,
    spec: &TransferSpec,
) -> Result<u64, String> {
    send_file_logged(connection, root, spec, None, "upload").await
}

pub async fn send_file_logged(
    connection: &Connection,
    root: &Path,
    spec: &TransferSpec,
    logger: Option<&SyncLogger>,
    direction: &str,
) -> Result<u64, String> {
    let started = Instant::now();
    if let Some(logger) = logger {
        logger.event(
            &format!("{direction}:start"),
            format!(
                "path={} target={} size={} transfer_id={}",
                quoted(&spec.source_path),
                quoted(&spec.target_path),
                spec.size,
                spec.transfer_id
            ),
        );
    }
    let source = safe_join(root, &spec.source_path)?;
    let metadata = tokio::fs::metadata(&source)
        .await
        .map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err(format!(
            "sync source is not a regular file: {}",
            spec.source_path
        ));
    }
    if metadata.len() != spec.size {
        return Err(format!(
            "file changed before sync transfer: {}",
            spec.source_path
        ));
    }
    let mut send = connection
        .open_uni()
        .await
        .map_err(|error| error.to_string())?;
    let header = FileHeader {
        transfer_id: spec.transfer_id.clone(),
        source_path: spec.source_path.clone(),
        target_path: spec.target_path.clone(),
        size: spec.size,
        hash: spec.hash.clone(),
    };
    write_file_header(&mut send, &header).await?;
    let mut file = tokio::fs::File::open(source)
        .await
        .map_err(|error| error.to_string())?;
    let mut buffer = vec![0_u8; FILE_CHUNK_SIZE];
    let mut total = 0_u64;
    let mut next_percent = 10_u64;
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        send.write_all(&buffer[..read])
            .await
            .map_err(|error| error.to_string())?;
        total += read as u64;
        log_progress(
            logger,
            &format!("{direction}:progress"),
            &spec.source_path,
            total,
            spec.size,
            &mut next_percent,
        );
    }
    send.finish().map_err(|error| error.to_string())?;
    if total != spec.size {
        return Err(format!("file changed during sync: {}", spec.source_path));
    }
    if let Some(logger) = logger {
        logger.event(
            &format!("{direction}:complete"),
            format!(
                "path={} target={} bytes={total} hash={} duration_ms={} throughput_mib_s={:.2}",
                quoted(&spec.source_path),
                quoted(&spec.target_path),
                &spec.hash[..spec.hash.len().min(12)],
                started.elapsed().as_millis(),
                throughput_mib_per_second(total, started.elapsed())
            ),
        );
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
    receive_file_logged(connection, root, expected, None, "download").await
}

pub async fn receive_file_logged(
    connection: &Connection,
    root: &Path,
    expected: &TransferSpec,
    logger: Option<&SyncLogger>,
    direction: &str,
) -> Result<(FileHeader, u64), String> {
    let started = Instant::now();
    if let Some(logger) = logger {
        logger.event(
            &format!("{direction}:wait"),
            format!(
                "path={} target={} size={} transfer_id={}",
                quoted(&expected.source_path),
                quoted(&expected.target_path),
                expected.size,
                expected.transfer_id
            ),
        );
    }
    let mut recv = connection
        .accept_uni()
        .await
        .map_err(|error| error.to_string())?;
    let header = read_file_header(&mut recv).await?;
    validate_header(&header, expected)?;
    if let Some(logger) = logger {
        logger.event(
            &format!("{direction}:start"),
            format!(
                "path={} target={} size={} transfer_id={}",
                quoted(&header.source_path),
                quoted(&header.target_path),
                header.size,
                header.transfer_id
            ),
        );
    }
    let target = safe_join(root, &header.target_path)?;
    if let Some(parent) = target.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|error| error.to_string())?;
    }
    if target.is_dir() {
        return Err(format!(
            "cannot replace directory with incoming file without resolving namespace conflict: {}",
            header.target_path
        ));
    }
    let filename = target
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("incoming");
    let temporary = target.with_file_name(format!(".{filename}.{}.syncpart", header.transfer_id));
    let mut file = tokio::fs::File::create(&temporary)
        .await
        .map_err(|error| error.to_string())?;
    let mut buffer = vec![0_u8; FILE_CHUNK_SIZE];
    let mut total = 0_u64;
    let mut next_percent = 10_u64;
    loop {
        let read = recv
            .read(&mut buffer)
            .await
            .map_err(|error| error.to_string())?;
        let Some(read) = read else {
            break;
        };
        if read == 0 {
            continue;
        }
        file.write_all(&buffer[..read])
            .await
            .map_err(|error| error.to_string())?;
        total += read as u64;
        log_progress(
            logger,
            &format!("{direction}:progress"),
            &header.target_path,
            total,
            header.size,
            &mut next_percent,
        );
        if total > header.size {
            let _ = tokio::fs::remove_file(&temporary).await;
            return Err(format!("received too much data for {}", header.target_path));
        }
    }
    file.flush().await.map_err(|error| error.to_string())?;
    drop(file);
    if total != header.size {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(format!(
            "incomplete file transfer for {}",
            header.target_path
        ));
    }
    let actual_hash = hash_file(&temporary)?;
    if actual_hash != header.hash {
        let _ = tokio::fs::remove_file(&temporary).await;
        return Err(format!("hash mismatch for {}", header.target_path));
    }
    if let Some(logger) = logger {
        logger.event(
            "verify:hash",
            format!(
                "path={} algorithm=blake3 hash={} status=ok",
                quoted(&header.target_path),
                &actual_hash[..actual_hash.len().min(12)]
            ),
        );
    }
    if target.exists() {
        tokio::fs::remove_file(&target)
            .await
            .map_err(|error| error.to_string())?;
    }
    tokio::fs::rename(&temporary, &target)
        .await
        .map_err(|error| error.to_string())?;
    if let Some(logger) = logger {
        logger.event(
            &format!("{direction}:complete"),
            format!(
                "path={} bytes={total} hash={} duration_ms={} throughput_mib_s={:.2}",
                quoted(&header.target_path),
                &header.hash[..header.hash.len().min(12)],
                started.elapsed().as_millis(),
                throughput_mib_per_second(total, started.elapsed())
            ),
        );
    }
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
    fn progress_is_suppressed_for_small_files() {
        let mut next = 10;
        log_progress(None, "upload:progress", "A.md", 100, 100, &mut next);
        assert_eq!(next, 10);
    }
}

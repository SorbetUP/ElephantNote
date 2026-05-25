use chrono::Utc;
use serde::Serialize;
use std::fs;
use std::io::{self, Seek, Write};
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use tauri::Emitter;

use crate::local_runtime::LocalDataState;

#[derive(Debug, Serialize)]
pub struct BackupExportResult {
    pub path: String,
    pub filename: String,
    pub size: u64,
}

#[derive(Debug, Serialize)]
pub struct BackupRestoreResult {
    pub ok: bool,
}

fn backup_dir(root: &Path) -> PathBuf {
    root.join("backups")
}

fn default_backup_filename(prefix: &str) -> String {
    let ts = Utc::now().format("%Y%m%d-%H%M%S");
    format!("{prefix}-{ts}.bko")
}

fn add_file_to_zip<W: Write + Seek>(
    zip: &mut zip::ZipWriter<W>,
    zip_name: &str,
    file_path: &Path,
) -> Result<(), String> {
    if !file_path.exists() {
        return Ok(());
    }
    let mut f = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open {:?}: {e}", file_path))?;
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o600);
    zip.start_file(zip_name, options)
        .map_err(|e| format!("Failed to start zip entry {zip_name}: {e}"))?;
    io::copy(&mut f, zip)
        .map_err(|e| format!("Failed to write zip entry {zip_name}: {e}"))?;
    Ok(())
}

fn add_dir_to_zip<W: Write + Seek>(
    zip: &mut zip::ZipWriter<W>,
    dir: &Path,
    zip_prefix: &str,
) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(dir).map_err(|e| format!("Failed to read dir {:?}: {e}", dir))? {
        let entry = entry.map_err(|e| format!("Failed to read dir entry: {e}"))?;
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        let zip_name = if zip_prefix.is_empty() {
            name.to_string()
        } else {
            format!("{zip_prefix}/{name}")
        };

        if path.is_dir() {
            add_dir_to_zip(zip, &path, &zip_name)?;
        } else if path.is_file() {
            add_file_to_zip(zip, &zip_name, &path)?;
        }
    }
    Ok(())
}

fn create_backup_archive(_root: &Path, db_path: &Path, attachments_dir: &Path, config_path: &Path, target: &Path) -> Result<(), String> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create backup dir {:?}: {e}", parent))?;
    }

    let f = fs::File::create(target).map_err(|e| format!("Failed to create {:?}: {e}", target))?;
    let mut zip = zip::ZipWriter::new(f);

    // SQLite WAL mode: include wal/shm when present so a restore can be consistent.
    add_file_to_zip(&mut zip, "blinko.sqlite", db_path)?;
    add_file_to_zip(&mut zip, "blinko.sqlite-wal", &db_path.with_extension("sqlite-wal"))?;
    add_file_to_zip(&mut zip, "blinko.sqlite-shm", &db_path.with_extension("sqlite-shm"))?;

    add_file_to_zip(&mut zip, "local_config.json", config_path)?;
    add_dir_to_zip(&mut zip, attachments_dir, "attachments")?;

    zip.finish()
        .map_err(|e| format!("Failed to finalize backup archive {:?}: {e}", target))?;
    Ok(())
}

#[tauri::command]
pub async fn export_local_backup(
    state: tauri::State<'_, LocalDataState>,
) -> Result<BackupExportResult, String> {
    // Improve backup consistency in WAL mode (best-effort).
    let _ = sqlx::query("PRAGMA wal_checkpoint(TRUNCATE);")
        .execute(&state.db.pool)
        .await;

    let root = state.paths.root.clone();
    let filename = default_backup_filename("blinko-backup");
    let out_dir = backup_dir(&root);
    let out_path = out_dir.join(&filename);
    let out_path_for_task = out_path.clone();

    let db_path = state.paths.db_path.clone();
    let attachments_dir = state.paths.attachments_dir.clone();
    let config_path = state.paths.config_path.clone();

    tokio::task::spawn_blocking(move || create_backup_archive(&root, &db_path, &attachments_dir, &config_path, &out_path_for_task))
        .await
        .map_err(|e| format!("Backup task failed: {e}"))??;

    let size = fs::metadata(&out_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(BackupExportResult {
        path: out_path.to_string_lossy().to_string(),
        filename,
        size,
    })
}

#[tauri::command]
pub async fn restore_local_backup(
    app: AppHandle,
    state: tauri::State<'_, LocalDataState>,
    file_path: String,
) -> Result<BackupRestoreResult, String> {
    let src = PathBuf::from(file_path);
    if !src.exists() || !src.is_file() {
        return Err(format!("Backup file not found: {}", src.display()));
    }

    // Safety net: create a "before restore" backup.
    let before_name = default_backup_filename("before-restore");
    let before_path = backup_dir(&state.paths.root).join(before_name);
    let root = state.paths.root.clone();
    let db_path = state.paths.db_path.clone();
    let attachments_dir = state.paths.attachments_dir.clone();
    let config_path = state.paths.config_path.clone();
    let _ = tokio::task::spawn_blocking(move || {
        let _ = create_backup_archive(&root, &db_path, &attachments_dir, &config_path, &before_path);
    })
    .await;

    // Close the sqlite pool; after this, the app must be restarted.
    state.db.pool.close().await;

    let root = state.paths.root.clone();
    let db_path = state.paths.db_path.clone();
    let attachments_dir = state.paths.attachments_dir.clone();
    let config_path = state.paths.config_path.clone();
    tokio::task::spawn_blocking(move || -> Result<(), String> {
        // Best-effort cleanup so removed files don't linger after restore.
        let _ = fs::remove_file(&db_path);
        let _ = fs::remove_file(db_path.with_extension("sqlite-wal"));
        let _ = fs::remove_file(db_path.with_extension("sqlite-shm"));
        let _ = fs::remove_file(&config_path);
        let _ = fs::remove_dir_all(&attachments_dir);
        let _ = fs::create_dir_all(&attachments_dir);

        let file = fs::File::open(&src).map_err(|e| format!("Failed to open {:?}: {e}", src))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Failed to read zip archive {:?}: {e}", src))?;

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("Failed reading zip entry {i}: {e}"))?;

            let Some(name) = entry.enclosed_name().map(|p| p.to_owned()) else {
                continue;
            };

            let out_path = root.join(&name);
            if entry.is_dir() {
                fs::create_dir_all(&out_path)
                    .map_err(|e| format!("Failed to create dir {:?}: {e}", out_path))?;
                continue;
            }

            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create dir {:?}: {e}", parent))?;
            }

            let mut out = fs::File::create(&out_path)
                .map_err(|e| format!("Failed to create {:?}: {e}", out_path))?;
            io::copy(&mut entry, &mut out)
                .map_err(|e| format!("Failed to extract {:?}: {e}", out_path))?;
        }

        Ok(())
    })
    .await
    .map_err(|e| format!("Restore task failed: {e}"))??;

    // Frontend will call `exit_app` shortly after showing a toast.
    let _ = app.emit("backup:restored", ());
    Ok(BackupRestoreResult { ok: true })
}

#[tauri::command]
pub fn exit_app(app: AppHandle, code: i32) {
    app.exit(code);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_root() -> PathBuf {
        let pid = std::process::id();
        let nonce = uuid::Uuid::new_v4();
        std::env::temp_dir().join(format!("blinko_backup_test_{pid}_{nonce}"))
    }

    #[test]
    fn export_contains_db_and_attachments() {
        let root = temp_root();
        let _ = fs::create_dir_all(&root);

        let db_path = root.join("blinko.sqlite");
        fs::write(&db_path, b"sqlite").unwrap();
        let attachments_dir = root.join("attachments");
        fs::create_dir_all(&attachments_dir).unwrap();
        fs::write(attachments_dir.join("pic.png"), b"png").unwrap();
        let config_path = root.join("local_config.json");
        fs::write(&config_path, b"{}").unwrap();

        let out = root.join("backups").join("test.bko");
        create_backup_archive(&root, &db_path, &attachments_dir, &config_path, &out).unwrap();

        let f = fs::File::open(&out).unwrap();
        let mut archive = zip::ZipArchive::new(f).unwrap();
        let names: Vec<String> = (0..archive.len())
            .filter_map(|i| archive.by_index(i).ok().map(|e| e.name().to_string()))
            .collect();

        assert!(names.iter().any(|n| n == "blinko.sqlite"));
        assert!(names.iter().any(|n| n == "local_config.json"));
        assert!(names.iter().any(|n| n == "attachments/pic.png"));

        let _ = fs::remove_dir_all(root);
    }
}

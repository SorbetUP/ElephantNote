use std::collections::HashSet;
use std::path::Path;

use chrono::Utc;
use sha2::{Digest, Sha256};
use sqlx::{Sqlite, SqlitePool, Transaction};
use tokio::io::AsyncReadExt;
use uuid::Uuid;

use crate::local_db::attachments::{Attachment, AttachmentRepository};
use crate::local_db::oplog::OplogRepository;
use crate::local_db::outbox::OutboxRepository;
use crate::local_db::tags::extract_tag_names;

async fn has_suspicious_tags(pool: &SqlitePool) -> Result<bool, String> {
    // Avoid rebuilding on every startup. Only trigger when we detect tags that are
    // known to come from historical parsing bugs (shebang/path fragments, short numeric tokens).
    let (count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM tags WHERE \
         name LIKE '/%' OR \
         name LIKE '%usr%bin%env%' OR \
         (name NOT GLOB '*[^0-9]*' AND length(name) < 4)",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to check suspicious tags: {e}"))?;
    Ok(count > 0)
}

async fn rebuild_tags_from_notes(pool: &SqlitePool) -> Result<(), String> {
    #[derive(sqlx::FromRow)]
    struct NoteRow {
        id: i64,
        content: String,
    }

    let notes: Vec<NoteRow> =
        sqlx::query_as::<_, NoteRow>("SELECT id, content FROM notes WHERE deleted_at IS NULL")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to list notes for tag rebuild: {e}"))?;

    let mut desired_tags: HashSet<String> = HashSet::new();
    let mut desired_note_tags: Vec<(i64, String)> = Vec::new();
    for note in notes.iter() {
        for name in extract_tag_names(&note.content) {
            desired_tags.insert(name.clone());
            desired_note_tags.push((note.id, name));
        }
    }

    let mut tx: Transaction<'_, Sqlite> = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin tag rebuild tx: {e}"))?;

    // Use temp tables to avoid SQLite variable limits and keep operations set-based.
    sqlx::query("CREATE TEMP TABLE IF NOT EXISTS desired_tags(name TEXT PRIMARY KEY)")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to create temp desired_tags: {e}"))?;
    sqlx::query("DELETE FROM desired_tags")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to clear temp desired_tags: {e}"))?;

    sqlx::query(
        "CREATE TEMP TABLE IF NOT EXISTS desired_note_tags(\
            note_id INTEGER NOT NULL, \
            tag_name TEXT NOT NULL, \
            PRIMARY KEY(note_id, tag_name)\
        )",
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to create temp desired_note_tags: {e}"))?;
    sqlx::query("DELETE FROM desired_note_tags")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to clear temp desired_note_tags: {e}"))?;

    for name in desired_tags.iter() {
        sqlx::query("INSERT OR IGNORE INTO desired_tags(name) VALUES (?)")
            .bind(name)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to insert desired tag: {e}"))?;
    }

    for (note_id, tag_name) in desired_note_tags.iter() {
        sqlx::query("INSERT OR IGNORE INTO desired_note_tags(note_id, tag_name) VALUES (?, ?)")
            .bind(note_id)
            .bind(tag_name)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to insert desired note_tag: {e}"))?;
    }

    let now = Utc::now();
    // Create any missing tags; keep existing metadata (icon/order) untouched.
    sqlx::query(
        "INSERT OR IGNORE INTO tags(name, icon, sort_order, created_at, updated_at) \
         SELECT name, NULL, 0, ?, ? FROM desired_tags",
    )
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to upsert tags: {e}"))?;

    // Rebuild relations.
    sqlx::query("DELETE FROM note_tags")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to clear note_tags: {e}"))?;

    sqlx::query(
        "INSERT OR IGNORE INTO note_tags(note_id, tag_id) \
         SELECT d.note_id, t.id FROM desired_note_tags d \
         JOIN tags t ON t.name = d.tag_name",
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to repopulate note_tags: {e}"))?;

    // Drop tags no longer referenced by notes.
    sqlx::query("DELETE FROM tags WHERE name NOT IN (SELECT name FROM desired_tags)")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to delete unused tags: {e}"))?;

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit tag rebuild tx: {e}"))?;

    Ok(())
}

async fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| format!("Failed to open file for sha256: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = file
            .read(&mut buf)
            .await
            .map_err(|e| format!("Failed to read file for sha256: {e}"))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    let digest = hasher.finalize();
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest.iter() {
        out.push_str(&format!("{:02x}", byte));
    }
    Ok(out)
}

fn guess_mime(filename: &str) -> &'static str {
    let lower = filename.to_ascii_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else if lower.ends_with(".jpg") || lower.ends_with(".jpeg") {
        "image/jpeg"
    } else if lower.ends_with(".gif") {
        "image/gif"
    } else if lower.ends_with(".webp") {
        "image/webp"
    } else if lower.ends_with(".pdf") {
        "application/pdf"
    } else if lower.ends_with(".mp4") {
        "video/mp4"
    } else if lower.ends_with(".mov") {
        "video/quicktime"
    } else if lower.ends_with(".mp3") {
        "audio/mpeg"
    } else if lower.ends_with(".wav") {
        "audio/wav"
    } else if lower.ends_with(".txt") || lower.ends_with(".md") {
        "text/plain"
    } else {
        "application/octet-stream"
    }
}

async fn maybe_reindex_attachments(
    pool: &SqlitePool,
    attachments_dir: &Path,
    device_id: &str,
    enqueue_sync_ops: bool,
) -> Result<bool, String> {
    let (db_active,): (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM attachments WHERE deleted_at IS NULL")
            .fetch_one(pool)
            .await
            .map_err(|e| format!("Failed to count attachments: {e}"))?;

    let mut disk_files: Vec<String> = Vec::new();
    let mut dir = match tokio::fs::read_dir(attachments_dir).await {
        Ok(d) => d,
        Err(_) => return Ok(false),
    };
    while let Ok(Some(entry)) = dir.next_entry().await {
        let ft = entry
            .file_type()
            .await
            .map_err(|e| format!("Failed to stat attachment dir entry: {e}"))?;
        if !ft.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        disk_files.push(name);
    }

    let disk_count = disk_files.len() as i64;
    // Trigger when we have a clear metadata gap. This covers both:
    // - Fresh DB resets (db_active near 0, lots of files on disk)
    // - Partial metadata loss (many files on disk missing from SQLite)

    let rows: Vec<(String, String)> = sqlx::query_as("SELECT sync_id, path FROM attachments")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to list attachment keys: {e}"))?;
    let mut known_sync: HashSet<String> = HashSet::new();
    let mut known_path: HashSet<String> = HashSet::new();
    for (sync_id, path) in rows {
        known_sync.insert(sync_id);
        known_path.insert(path);
    }

    let repo = AttachmentRepository::new(pool.clone(), attachments_dir.to_path_buf());
    let oplog = OplogRepository::new(pool.clone());
    let outbox = OutboxRepository::new(pool.clone());

    let mut created: Vec<Attachment> = Vec::new();
    let mut missing_candidates: Vec<String> = Vec::new();
    for stored_name in disk_files {
        if known_path.contains(&stored_name) {
            continue;
        }
        missing_candidates.push(stored_name);
    }

    // Don't churn on tiny gaps (e.g. leftover temp files). If there are lots of attachment files on disk
    // not present in SQLite, we likely lost metadata and should rebuild it.
    if missing_candidates.len() < 20 && !(db_active < 5 && disk_count > 20) {
        return Ok(false);
    }

    for stored_name in missing_candidates.into_iter().take(2_000) {
        let Some((prefix, rest)) = stored_name.split_once('_') else {
            continue;
        };
        if Uuid::parse_str(prefix).is_err() {
            continue;
        }
        if known_sync.contains(prefix) {
            // If the sync_id already exists, don't create a second row for a different path.
            continue;
        }

        let file_path = attachments_dir.join(&stored_name);
        let meta = tokio::fs::metadata(&file_path)
            .await
            .map_err(|e| format!("Failed to read attachment metadata: {e}"))?;
        let size = meta.len() as i64;
        let sha256 = sha256_file(&file_path).await?;
        let mime = guess_mime(rest);
        let now = Utc::now();

        // `filename` is best-effort; original may have been sanitized in stored_name.
        let att = repo
            .create_attachment_record(prefix, None, rest, mime, size, &sha256, &stored_name, now)
            .await?;

        created.push(att);
    }

    if created.is_empty() {
        return Ok(false);
    }

    if enqueue_sync_ops {
        // Ensure these attachments are pushed on the next sync run.
        for att in created.iter() {
            let payload = serde_json::to_string(att).unwrap_or_else(|_| "{}".to_string());
            let _ = oplog
                .append("attachment", &att.sync_id, "create", &payload, device_id)
                .await;
            let _ = outbox
                .append("attachment", &att.sync_id, "create", &payload, device_id)
                .await;
        }
    }

    Ok(true)
}

pub async fn run_startup_maintenance(
    pool: &SqlitePool,
    attachments_dir: &Path,
    device_id: &str,
    enqueue_sync_ops: bool,
) -> Result<(), String> {
    if has_suspicious_tags(pool).await? {
        rebuild_tags_from_notes(pool).await?;
    }

    let _ = maybe_reindex_attachments(pool, attachments_dir, device_id, enqueue_sync_ops).await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::run_startup_maintenance;
    use crate::local_db::LocalDb;
    use crate::local_db::notes::{NoteInput, NoteRepository};
    use crate::local_runtime::paths::RuntimePaths;
    use chrono::Utc;
    use std::fs;

    fn temp_paths() -> RuntimePaths {
        let pid = std::process::id();
        let nonce = uuid::Uuid::new_v4();
        let root = std::env::temp_dir().join(format!("blinko_maintenance_test_{pid}_{nonce}"));
        RuntimePaths::from_root(root)
    }

    #[tokio::test]
    async fn rebuilds_suspicious_tags_from_notes() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();

        let note_repo = NoteRepository::new(db.pool.clone());
        let _note = note_repo
            .create_note(
                NoteInput {
                    title: "t".to_string(),
                    content: "hello #alpha #!/usr/bin/env #0 #2024 #Projet/Math".to_string(),
                    is_archived: false,
                    is_recycle: false,
                    is_share: false,
                    is_top: false,
                    note_type: 0,
                    created_at: None,
                    updated_at: None,
                },
                "test-device",
            )
            .await
            .unwrap();

        // Seed suspicious tags to trigger rebuild.
        let now = Utc::now();
        sqlx::query("INSERT OR IGNORE INTO tags (name, icon, sort_order, created_at, updated_at) VALUES (?, NULL, 0, ?, ?)")
            .bind("/usr/bin/env")
            .bind(now)
            .bind(now)
            .execute(&db.pool)
            .await
            .unwrap();
        sqlx::query("INSERT OR IGNORE INTO tags (name, icon, sort_order, created_at, updated_at) VALUES (?, NULL, 0, ?, ?)")
            .bind("0")
            .bind(now)
            .bind(now)
            .execute(&db.pool)
            .await
            .unwrap();

        run_startup_maintenance(&db.pool, &paths.attachments_dir, "test-device", false)
            .await
            .unwrap();

        let names: Vec<(String,)> = sqlx::query_as("SELECT name FROM tags ORDER BY name ASC")
            .fetch_all(&db.pool)
            .await
            .unwrap();
        let names: Vec<String> = names.into_iter().map(|t| t.0).collect();

        assert!(names.contains(&"alpha".to_string()));
        assert!(names.contains(&"2024".to_string()));
        assert!(names.contains(&"Projet/Math".to_string()));
        assert!(!names.contains(&"/usr/bin/env".to_string()));
        assert!(!names.contains(&"0".to_string()));

        let (rel_count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM note_tags")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(rel_count, 3);

        let _ = fs::remove_dir_all(paths.root);
    }

    #[tokio::test]
    async fn reindexes_attachments_when_metadata_missing_and_enqueues_ops() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();

        // Create many attachment files without any DB rows.
        for i in 0..25 {
            let sync_id = uuid::Uuid::new_v4().to_string();
            let stored = format!("{sync_id}_file_{i}.txt");
            let fp = paths.attachments_dir.join(stored);
            fs::write(fp, format!("hello-{i}")).unwrap();
        }

        run_startup_maintenance(&db.pool, &paths.attachments_dir, "test-device", true)
            .await
            .unwrap();

        let (att_count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attachments WHERE deleted_at IS NULL")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(att_count, 25);

        let (outbox_pending,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM outbox WHERE status = 'pending'")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(outbox_pending, 25);

        let (oplog_count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM oplog")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(oplog_count, 25);

        let _ = fs::remove_dir_all(paths.root);
    }

    #[tokio::test]
    async fn does_not_reindex_on_small_disk_gap() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();

        for i in 0..5 {
            let sync_id = uuid::Uuid::new_v4().to_string();
            let stored = format!("{sync_id}_tiny_{i}.txt");
            let fp = paths.attachments_dir.join(stored);
            fs::write(fp, format!("x-{i}")).unwrap();
        }

        run_startup_maintenance(&db.pool, &paths.attachments_dir, "test-device", true)
            .await
            .unwrap();

        let (att_count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attachments WHERE deleted_at IS NULL")
            .fetch_one(&db.pool)
            .await
            .unwrap();
        assert_eq!(att_count, 0);

        let _ = fs::remove_dir_all(paths.root);
    }
}

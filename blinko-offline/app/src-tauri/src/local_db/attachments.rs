use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::{FromRow, SqlitePool};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Attachment {
    pub id: i64,
    pub sync_id: String,
    pub note_id: Option<i64>,
    pub filename: String,
    pub mime: String,
    pub size: i64,
    pub sha256: String,
    pub path: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Clone)]
pub struct AttachmentRepository {
    pool: SqlitePool,
    attachments_dir: PathBuf,
}

impl AttachmentRepository {
    pub fn new(pool: SqlitePool, attachments_dir: PathBuf) -> Self {
        Self {
            pool,
            attachments_dir,
        }
    }

    pub async fn save_file(
        &self,
        bytes: &[u8],
        filename: &str,
        mime: &str,
        note_id: Option<i64>,
    ) -> Result<Attachment, String> {
        let sync_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let sha256 = format_hash(bytes);
        let safe_name = filename.replace(['/', '\\'], "_");
        let stored_name = format!("{}_{}", sync_id, safe_name);
        let file_path = self.attachments_dir.join(&stored_name);

        fs::create_dir_all(&self.attachments_dir)
            .map_err(|e| format!("Failed to create attachments dir: {e}"))?;
        fs::write(&file_path, bytes).map_err(|e| format!("Failed to write attachment: {e}"))?;

        self.create_attachment_record(
            &sync_id,
            note_id,
            filename,
            mime,
            bytes.len() as i64,
            &sha256,
            &stored_name,
            now,
        )
        .await
    }

    pub async fn overwrite_file(
        &self,
        id: i64,
        bytes: &[u8],
        filename: &str,
        mime: &str,
    ) -> Result<Attachment, String> {
        let now = Utc::now();
        let sha256 = format_hash(bytes);
        let safe_name = filename.replace(['/', '\\'], "_");

        let att = self
            .get_by_id(id)
            .await?
            .ok_or_else(|| "Attachment not found".to_string())?;

        let file_path = self.attachments_dir.join(&att.path);
        fs::create_dir_all(&self.attachments_dir)
            .map_err(|e| format!("Failed to create attachments dir: {e}"))?;
        fs::write(&file_path, bytes).map_err(|e| format!("Failed to write attachment: {e}"))?;

        sqlx::query("UPDATE attachments SET filename = ?, mime = ?, size = ?, sha256 = ?, updated_at = ? WHERE id = ?")
            .bind(safe_name)
            .bind(mime)
            .bind(bytes.len() as i64)
            .bind(&sha256)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to update attachment: {e}"))?;

        self.get_by_id(id)
            .await?
            .ok_or_else(|| "Failed to load attachment".to_string())
    }

    pub async fn create_attachment_record(
        &self,
        sync_id: &str,
        note_id: Option<i64>,
        filename: &str,
        mime: &str,
        size: i64,
        sha256: &str,
        stored_name: &str,
        now: DateTime<Utc>,
    ) -> Result<Attachment, String> {
        sqlx::query(
            "INSERT INTO attachments (sync_id, note_id, filename, mime, size, sha256, path, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)",
        )
        .bind(sync_id)
        .bind(note_id)
        .bind(filename)
        .bind(mime)
        .bind(size)
        .bind(sha256)
        .bind(stored_name)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to insert attachment: {e}"))?;

        self.get_by_sync_id(sync_id)
            .await?
            .ok_or_else(|| "Failed to load attachment".to_string())
    }

    pub async fn list_for_note(&self, note_id: i64) -> Result<Vec<Attachment>, String> {
        sqlx::query_as::<_, Attachment>(
            "SELECT id, sync_id, note_id, filename, mime, size, sha256, path, created_at, updated_at, deleted_at FROM attachments WHERE note_id = ? AND deleted_at IS NULL",
        )
        .bind(note_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list attachments: {e}"))
    }

    pub async fn list_all(&self) -> Result<Vec<Attachment>, String> {
        sqlx::query_as::<_, Attachment>(
            "SELECT id, sync_id, note_id, filename, mime, size, sha256, path, created_at, updated_at, deleted_at FROM attachments WHERE deleted_at IS NULL ORDER BY created_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list attachments: {e}"))
    }

    pub async fn delete_attachment(&self, id: i64) -> Result<Option<Attachment>, String> {
        let now = Utc::now();
        sqlx::query("UPDATE attachments SET deleted_at = ?, updated_at = ? WHERE id = ?")
            .bind(now)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete attachment: {e}"))?;

        self.get_by_id(id).await
    }

    pub async fn get_by_id(&self, id: i64) -> Result<Option<Attachment>, String> {
        sqlx::query_as::<_, Attachment>(
            "SELECT id, sync_id, note_id, filename, mime, size, sha256, path, created_at, updated_at, deleted_at FROM attachments WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get attachment: {e}"))
    }

    pub async fn get_by_sync_id(&self, sync_id: &str) -> Result<Option<Attachment>, String> {
        sqlx::query_as::<_, Attachment>(
            "SELECT id, sync_id, note_id, filename, mime, size, sha256, path, created_at, updated_at, deleted_at FROM attachments WHERE sync_id = ?",
        )
        .bind(sync_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get attachment by sync_id: {e}"))
    }

    pub async fn assign_note(&self, id: i64, note_id: i64) -> Result<(), String> {
        let now = Utc::now();
        sqlx::query("UPDATE attachments SET note_id = ?, updated_at = ? WHERE id = ?")
            .bind(note_id)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to assign attachment to note: {e}"))?;
        Ok(())
    }

    pub async fn upsert_attachment_by_sync_id(
        &self,
        attachment: &Attachment,
    ) -> Result<Attachment, String> {
        sqlx::query(
            "INSERT INTO attachments (sync_id, note_id, filename, mime, size, sha256, path, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
             ON CONFLICT(sync_id) DO UPDATE SET note_id = excluded.note_id, filename = excluded.filename, mime = excluded.mime, size = excluded.size, sha256 = excluded.sha256, path = excluded.path, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at",
        )
        .bind(&attachment.sync_id)
        .bind(attachment.note_id)
        .bind(&attachment.filename)
        .bind(&attachment.mime)
        .bind(attachment.size)
        .bind(&attachment.sha256)
        .bind(&attachment.path)
        .bind(attachment.created_at)
        .bind(attachment.updated_at)
        .bind(attachment.deleted_at)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to upsert attachment: {e}"))?;

        self.get_by_sync_id(&attachment.sync_id)
            .await?
            .ok_or_else(|| "Failed to load upserted attachment".to_string())
    }
}

fn format_hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest.iter() {
        out.push_str(&format!("{:02x}", byte));
    }
    out
}

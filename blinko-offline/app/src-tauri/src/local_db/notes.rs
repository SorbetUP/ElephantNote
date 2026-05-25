use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Note {
    pub id: i64,
    pub sync_id: String,
    pub title: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub rev: i64,
    pub device_id: String,
    pub is_archived: bool,
    pub is_recycle: bool,
    pub is_share: bool,
    pub is_top: bool,
    pub note_type: i64,
    // Share fields (local mode parity with cloud).
    pub share_password: String,
    pub share_encrypted_url: Option<String>,
    pub share_expiry_date: Option<DateTime<Utc>>,
    pub share_max_view: i64,
    pub share_view_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteInput {
    pub title: String,
    pub content: String,
    pub is_archived: bool,
    pub is_recycle: bool,
    pub is_share: bool,
    pub is_top: bool,
    pub note_type: i64,
    pub created_at: Option<DateTime<Utc>>,
    pub updated_at: Option<DateTime<Utc>>,
}

#[derive(Clone)]
pub struct NoteRepository {
    pool: SqlitePool,
}

impl NoteRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn count_all_notes(&self) -> Result<i64, String> {
        let (count,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM notes")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to count notes: {e}"))?;
        Ok(count)
    }

    pub async fn list_notes(&self) -> Result<Vec<Note>, String> {
        sqlx::query_as::<_, Note>(
            "SELECT id, sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type, share_password, share_encrypted_url, share_expiry_date, share_max_view, share_view_count FROM notes WHERE deleted_at IS NULL ORDER BY is_top DESC, updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list notes: {e}"))
    }

    pub async fn list_all_notes(&self) -> Result<Vec<Note>, String> {
        sqlx::query_as::<_, Note>(
            "SELECT id, sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type, share_password, share_encrypted_url, share_expiry_date, share_max_view, share_view_count FROM notes ORDER BY is_top DESC, updated_at DESC",
        )
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list all notes: {e}"))
    }

    pub async fn list_notes_by_ids(&self, ids: &[i64]) -> Result<Vec<Note>, String> {
        if ids.is_empty() {
            return Ok(vec![]);
        }
        let placeholders = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let query = format!(
            "SELECT id, sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type, share_password, share_encrypted_url, share_expiry_date, share_max_view, share_view_count FROM notes WHERE id IN ({placeholders})"
        );
        let mut q = sqlx::query_as::<_, Note>(&query);
        for id in ids {
            q = q.bind(id);
        }
        q.fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to list notes by ids: {e}"))
    }

    pub async fn get_note(&self, id: i64) -> Result<Option<Note>, String> {
        sqlx::query_as::<_, Note>(
            "SELECT id, sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type, share_password, share_encrypted_url, share_expiry_date, share_max_view, share_view_count FROM notes WHERE id = ?",
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get note: {e}"))
    }

    pub async fn get_note_by_sync_id(&self, sync_id: &str) -> Result<Option<Note>, String> {
        sqlx::query_as::<_, Note>(
            "SELECT id, sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type, share_password, share_encrypted_url, share_expiry_date, share_max_view, share_view_count FROM notes WHERE sync_id = ?",
        )
        .bind(sync_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get note by sync_id: {e}"))
    }

    pub async fn get_note_by_share_encrypted_url(
        &self,
        share_encrypted_url: &str,
    ) -> Result<Option<Note>, String> {
        sqlx::query_as::<_, Note>(
            "SELECT id, sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type, share_password, share_encrypted_url, share_expiry_date, share_max_view, share_view_count FROM notes WHERE share_encrypted_url = ? AND is_share = 1 AND is_recycle = 0 AND deleted_at IS NULL",
        )
        .bind(share_encrypted_url)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get note by share url: {e}"))
    }

    pub async fn create_note(&self, input: NoteInput, device_id: &str) -> Result<Note, String> {
        let sync_id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let created_at = input.created_at.unwrap_or(now);
        let updated_at = input.updated_at.unwrap_or(now);
        let rev = 1_i64;

        sqlx::query(
            "INSERT INTO notes (sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&sync_id)
        .bind(&input.title)
        .bind(&input.content)
        .bind(created_at)
        .bind(updated_at)
        .bind(rev)
        .bind(device_id)
        .bind(input.is_archived)
        .bind(input.is_recycle)
        .bind(input.is_share)
        .bind(input.is_top)
        .bind(input.note_type)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to create note: {e}"))?;

        self.get_note_by_sync_id(&sync_id)
            .await?
            .ok_or_else(|| "Failed to load created note".to_string())
    }

    pub async fn update_note(
        &self,
        id: i64,
        input: NoteInput,
        device_id: &str,
    ) -> Result<Option<Note>, String> {
        let now = Utc::now();
        sqlx::query(
            "UPDATE notes SET title = ?, content = ?, updated_at = ?, rev = rev + 1, device_id = ?, is_archived = ?, is_recycle = ?, is_share = ?, is_top = ?, note_type = ? WHERE id = ?",
        )
        .bind(&input.title)
        .bind(&input.content)
        .bind(now)
        .bind(device_id)
        .bind(input.is_archived)
        .bind(input.is_recycle)
        .bind(input.is_share)
        .bind(input.is_top)
        .bind(input.note_type)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to update note: {e}"))?;

        self.get_note(id).await
    }

    pub async fn delete_note(&self, id: i64, device_id: &str) -> Result<Option<Note>, String> {
        let now = Utc::now();
        sqlx::query(
            "UPDATE notes SET deleted_at = ?, updated_at = ?, rev = rev + 1, device_id = ?, is_recycle = 1 WHERE id = ?",
        )
        .bind(now)
        .bind(now)
        .bind(device_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to delete note: {e}"))?;

        self.get_note(id).await
    }

    pub async fn share_note(
        &self,
        id: i64,
        is_cancel: bool,
        password: &str,
        expire_at: Option<DateTime<Utc>>,
        device_id: &str,
    ) -> Result<Option<Note>, String> {
        let now = Utc::now();

        if is_cancel {
            sqlx::query(
                "UPDATE notes SET is_share = 0, share_password = '', share_encrypted_url = NULL, share_expiry_date = NULL, share_max_view = 0, share_view_count = 0, updated_at = ?, rev = rev + 1, device_id = ? WHERE id = ?",
            )
            .bind(now)
            .bind(device_id)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to cancel share: {e}"))?;
            return self.get_note(id).await;
        }

        let existing = self.get_note(id).await?;
        let existing = match existing {
            Some(note) => note,
            None => return Ok(None),
        };

        let share_id = existing.share_encrypted_url.clone().unwrap_or_else(|| {
            // Use UUID as entropy source; keep the token short for UX.
            Uuid::new_v4()
                .simple()
                .to_string()
                .chars()
                .take(8)
                .collect()
        });

        sqlx::query(
            "UPDATE notes SET is_share = 1, share_password = ?, share_encrypted_url = ?, share_expiry_date = ?, updated_at = ?, rev = rev + 1, device_id = ? WHERE id = ?",
        )
        .bind(password)
        .bind(&share_id)
        .bind(expire_at)
        .bind(now)
        .bind(device_id)
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to share note: {e}"))?;

        self.get_note(id).await
    }

    pub async fn upsert_note_by_sync_id(&self, note: &Note) -> Result<Note, String> {
        sqlx::query(
            "INSERT INTO notes (sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
             ON CONFLICT(sync_id) DO UPDATE SET title = excluded.title, content = excluded.content, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, rev = excluded.rev, device_id = excluded.device_id, is_archived = excluded.is_archived, is_recycle = excluded.is_recycle, is_share = excluded.is_share, is_top = excluded.is_top, note_type = excluded.note_type",
        )
        .bind(&note.sync_id)
        .bind(&note.title)
        .bind(&note.content)
        .bind(note.created_at)
        .bind(note.updated_at)
        .bind(note.deleted_at)
        .bind(note.rev)
        .bind(&note.device_id)
        .bind(note.is_archived)
        .bind(note.is_recycle)
        .bind(note.is_share)
        .bind(note.is_top)
        .bind(note.note_type)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to upsert note: {e}"))?;

        self.get_note_by_sync_id(&note.sync_id)
            .await?
            .ok_or_else(|| "Failed to load upserted note".to_string())
    }
}

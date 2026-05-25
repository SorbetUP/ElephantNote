use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct SyncState {
    pub remote_id: String,
    pub last_pull_cursor: Option<String>,
    pub last_push_cursor: Option<String>,
    pub last_sync_at: Option<DateTime<Utc>>,
    pub status: Option<String>,
}

#[derive(Clone)]
pub struct SyncStateRepository {
    pool: SqlitePool,
}

impl SyncStateRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, remote_id: &str) -> Result<Option<SyncState>, String> {
        sqlx::query_as::<_, SyncState>(
            "SELECT remote_id, last_pull_cursor, last_push_cursor, last_sync_at, status FROM sync_state WHERE remote_id = ?",
        )
        .bind(remote_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get sync state: {e}"))
    }

    pub async fn upsert(
        &self,
        remote_id: &str,
        last_pull_cursor: Option<&str>,
        last_push_cursor: Option<&str>,
        status: Option<&str>,
    ) -> Result<SyncState, String> {
        let now = Utc::now();
        sqlx::query(
            "INSERT INTO sync_state (remote_id, last_pull_cursor, last_push_cursor, last_sync_at, status) VALUES (?, ?, ?, ?, ?) 
             ON CONFLICT(remote_id) DO UPDATE SET last_pull_cursor = excluded.last_pull_cursor, last_push_cursor = excluded.last_push_cursor, last_sync_at = excluded.last_sync_at, status = excluded.status",
        )
        .bind(remote_id)
        .bind(last_pull_cursor)
        .bind(last_push_cursor)
        .bind(now)
        .bind(status)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to upsert sync state: {e}"))?;

        self.get(remote_id)
            .await?
            .ok_or_else(|| "Failed to load sync state".to_string())
    }
}

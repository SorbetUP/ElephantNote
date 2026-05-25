use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct ConflictEntry {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub local_payload: Option<String>,
    pub remote_payload: Option<String>,
    pub resolved_payload: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct ConflictRepository {
    pool: SqlitePool,
}

impl ConflictRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn unresolved_count(&self) -> Result<i64, String> {
        let (count,): (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM conflicts WHERE resolved_payload IS NULL")
                .fetch_one(&self.pool)
                .await
                .map_err(|e| format!("Failed to count conflicts: {e}"))?;
        Ok(count)
    }

    pub async fn list_unresolved(
        &self,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ConflictEntry>, String> {
        sqlx::query_as::<_, ConflictEntry>(
            "SELECT id, entity_type, entity_id, local_payload, remote_payload, resolved_payload, created_at \
             FROM conflicts WHERE resolved_payload IS NULL \
             ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list conflicts: {e}"))
    }

    pub async fn insert(
        &self,
        entity_type: &str,
        entity_id: &str,
        local_payload: Option<&str>,
        remote_payload: Option<&str>,
        resolved_payload: Option<&str>,
    ) -> Result<ConflictEntry, String> {
        let now = Utc::now();
        let res = sqlx::query(
            "INSERT INTO conflicts (entity_type, entity_id, local_payload, remote_payload, resolved_payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(local_payload)
        .bind(remote_payload)
        .bind(resolved_payload)
        .bind(now)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to insert conflict: {e}"))?;

        let id = res.last_insert_rowid();

        self.get_by_id(id).await
    }

    pub async fn get_by_id(&self, id: i64) -> Result<ConflictEntry, String> {
        sqlx::query_as::<_, ConflictEntry>(
            "SELECT id, entity_type, entity_id, local_payload, remote_payload, resolved_payload, created_at FROM conflicts WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to get conflict: {e}"))
    }

    pub async fn mark_resolved(&self, id: i64, resolved_payload: &str) -> Result<(), String> {
        sqlx::query("UPDATE conflicts SET resolved_payload = ? WHERE id = ?")
            .bind(resolved_payload)
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to mark conflict resolved: {e}"))?;
        Ok(())
    }

    pub async fn delete(&self, id: i64) -> Result<(), String> {
        sqlx::query("DELETE FROM conflicts WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete conflict: {e}"))?;
        Ok(())
    }
}

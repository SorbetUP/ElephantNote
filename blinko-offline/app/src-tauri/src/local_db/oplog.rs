use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OplogEntry {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub op: String,
    pub payload_json: String,
    pub ts: DateTime<Utc>,
    pub device_id: String,
}

#[derive(Clone)]
pub struct OplogRepository {
    pool: SqlitePool,
}

impl OplogRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn append(
        &self,
        entity_type: &str,
        entity_id: &str,
        op: &str,
        payload_json: &str,
        device_id: &str,
    ) -> Result<OplogEntry, String> {
        let now = Utc::now();
        let res = sqlx::query(
            "INSERT INTO oplog (entity_type, entity_id, op, payload_json, ts, device_id) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(op)
        .bind(payload_json)
        .bind(now)
        .bind(device_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to append oplog: {e}"))?;

        let id = res.last_insert_rowid();

        self.get_by_id(id).await
    }

    pub async fn list_since(&self, cursor: i64, limit: i64) -> Result<Vec<OplogEntry>, String> {
        sqlx::query_as::<_, OplogEntry>(
            "SELECT id, entity_type, entity_id, op, payload_json, ts, device_id FROM oplog WHERE id > ? ORDER BY id ASC LIMIT ?",
        )
        .bind(cursor)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| format!("Failed to list oplog: {e}"))
    }

    pub async fn get_by_id(&self, id: i64) -> Result<OplogEntry, String> {
        sqlx::query_as::<_, OplogEntry>(
            "SELECT id, entity_type, entity_id, op, payload_json, ts, device_id FROM oplog WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to get oplog: {e}"))
    }
}

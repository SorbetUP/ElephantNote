use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

pub const OUTBOX_STATUS_PENDING: &str = "pending";
pub const OUTBOX_STATUS_PUSHED: &str = "pushed";
pub const OUTBOX_STATUS_SENT: &str = "sent";

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct OutboxEntry {
    pub id: i64,
    pub entity_type: String,
    pub entity_id: String,
    pub op: String,
    pub payload_json: String,
    pub ts: DateTime<Utc>,
    pub device_id: String,
    pub status: String,
}

#[derive(Clone)]
pub struct OutboxRepository {
    pool: SqlitePool,
}

impl OutboxRepository {
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
    ) -> Result<OutboxEntry, String> {
        let now = Utc::now();
        let res = sqlx::query(
            "INSERT INTO outbox (entity_type, entity_id, op, payload_json, ts, device_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(entity_type)
        .bind(entity_id)
        .bind(op)
        .bind(payload_json)
        .bind(now)
        .bind(device_id)
        .bind(OUTBOX_STATUS_PENDING)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to append outbox: {e}"))?;

        let id = res.last_insert_rowid();

        self.get_by_id(id).await
    }

    pub async fn list_pending(&self, limit: i64) -> Result<Vec<OutboxEntry>, String> {
        self.list_by_statuses(&[OUTBOX_STATUS_PENDING], limit).await
    }

    pub async fn list_by_statuses(
        &self,
        statuses: &[&str],
        limit: i64,
    ) -> Result<Vec<OutboxEntry>, String> {
        if statuses.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders = std::iter::repeat("?")
            .take(statuses.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!(
            "SELECT id, entity_type, entity_id, op, payload_json, ts, device_id, status FROM outbox WHERE status IN ({placeholders}) ORDER BY id ASC LIMIT ?",
        );
        let mut q = sqlx::query_as::<_, OutboxEntry>(&sql);
        for status in statuses {
            q = q.bind(status);
        }
        q = q.bind(limit);
        q.fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to list outbox: {e}"))
    }

    pub async fn mark_sent(&self, ids: &[i64]) -> Result<(), String> {
        self.mark_status(ids, OUTBOX_STATUS_SENT).await
    }

    pub async fn mark_status(&self, ids: &[i64], status: &str) -> Result<(), String> {
        if ids.is_empty() {
            return Ok(());
        }
        let placeholders = std::iter::repeat("?")
            .take(ids.len())
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("UPDATE outbox SET status = ? WHERE id IN ({placeholders})");
        let mut q = sqlx::query(&sql).bind(status);
        for id in ids {
            q = q.bind(id);
        }
        q.execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to mark outbox status: {e}"))?;
        Ok(())
    }

    pub async fn get_by_id(&self, id: i64) -> Result<OutboxEntry, String> {
        sqlx::query_as::<_, OutboxEntry>(
            "SELECT id, entity_type, entity_id, op, payload_json, ts, device_id, status FROM outbox WHERE id = ?",
        )
        .bind(id)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to get outbox entry: {e}"))
    }

    pub async fn count_by_status(&self, status: &str) -> Result<i64, String> {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM outbox WHERE status = ?")
            .bind(status)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| format!("Failed to count outbox: {e}"))
    }

    pub async fn count_by_status_and_entity_type(
        &self,
        status: &str,
        entity_type: &str,
    ) -> Result<i64, String> {
        sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM outbox WHERE status = ? AND entity_type = ?",
        )
        .bind(status)
        .bind(entity_type)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| format!("Failed to count outbox: {e}"))
    }
}

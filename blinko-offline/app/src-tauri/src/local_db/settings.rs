use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, SqlitePool};

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Setting {
    pub key: String,
    pub value: String,
    pub updated_at: DateTime<Utc>,
    pub device_id: String,
}

#[derive(Clone)]
pub struct SettingsRepository {
    pool: SqlitePool,
}

impl SettingsRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn get(&self, key: &str) -> Result<Option<Setting>, String> {
        sqlx::query_as::<_, Setting>(
            "SELECT key, value, updated_at, device_id FROM settings WHERE key = ?",
        )
        .bind(key)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Failed to get setting: {e}"))
    }

    pub async fn set(&self, key: &str, value: &str, device_id: &str) -> Result<Setting, String> {
        let now = Utc::now();
        sqlx::query(
            "INSERT INTO settings (key, value, updated_at, device_id) VALUES (?, ?, ?, ?) 
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, device_id = excluded.device_id",
        )
        .bind(key)
        .bind(value)
        .bind(now)
        .bind(device_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to set setting: {e}"))?;

        self.get(key)
            .await?
            .ok_or_else(|| "Failed to load setting".to_string())
    }

    pub async fn list_all(&self) -> Result<Vec<Setting>, String> {
        sqlx::query_as::<_, Setting>("SELECT key, value, updated_at, device_id FROM settings ORDER BY key ASC")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| format!("Failed to list settings: {e}"))
    }

    pub async fn upsert_setting(&self, setting: &Setting) -> Result<(), String> {
        sqlx::query(
            "INSERT INTO settings (key, value, updated_at, device_id) VALUES (?, ?, ?, ?) 
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, device_id = excluded.device_id",
        )
        .bind(&setting.key)
        .bind(&setting.value)
        .bind(setting.updated_at)
        .bind(&setting.device_id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Failed to upsert setting: {e}"))?;
        Ok(())
    }

    pub async fn delete(&self, key: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM settings WHERE key = ?")
            .bind(key)
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to delete setting: {e}"))?;
        Ok(())
    }
}

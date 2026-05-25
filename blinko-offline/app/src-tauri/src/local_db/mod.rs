use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::path::Path;

use crate::local_runtime::paths::RuntimePaths;

pub mod attachments;
pub mod conflicts;
pub mod maintenance;
pub mod notes;
pub mod oplog;
pub mod outbox;
pub mod settings;
pub mod sync_state;
pub mod tags;

#[derive(Clone)]
pub struct LocalDb {
    pub pool: SqlitePool,
}

impl LocalDb {
    pub async fn connect(paths: &RuntimePaths) -> Result<Self, String> {
        let db = Self::connect_lazy(paths)?;
        db.init().await?;
        Ok(db)
    }

    pub fn connect_lazy(paths: &RuntimePaths) -> Result<Self, String> {
        if let Some(parent) = paths.db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create db dir: {e}"))?;
        }

        let options = SqliteConnectOptions::new()
            .filename(&paths.db_path)
            .create_if_missing(true)
            .foreign_keys(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect_lazy_with(options);

        Ok(Self { pool })
    }

    pub async fn init(&self) -> Result<(), String> {
        sqlx::query("PRAGMA journal_mode = WAL;")
            .execute(&self.pool)
            .await
            .map_err(|e| format!("Failed to set WAL mode: {e}"))?;

        sqlx::migrate!()
            .run(&self.pool)
            .await
            .map_err(|e| format!("Failed to run migrations: {e}"))?;

        Ok(())
    }
}

pub fn db_url_from_path(path: &Path) -> String {
    format!("sqlite://{}", path.display())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::local_db::notes::{NoteInput, NoteRepository};
    use crate::local_db::tags::TagRepository;
    use crate::local_runtime::paths::RuntimePaths;
    use std::fs;

    fn temp_paths() -> RuntimePaths {
        let pid = std::process::id();
        let nonce = uuid::Uuid::new_v4();
        let root = std::env::temp_dir().join(format!("blinko_local_db_test_{pid}_{nonce}"));
        RuntimePaths::from_root(root)
    }

    #[tokio::test]
    async fn create_and_read_note() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let repo = NoteRepository::new(db.pool.clone());
        let note = repo
            .create_note(NoteInput {
                title: "hello".to_string(),
                content: "world".to_string(),
                is_archived: false,
                is_recycle: false,
                is_share: false,
                is_top: false,
                note_type: 0,
                created_at: None,
                updated_at: None,
            }, "test-device")
            .await
            .unwrap();
        let fetched = repo.get_note(note.id).await.unwrap();
        assert!(fetched.is_some());
        let _ = fs::remove_dir_all(paths.root);
    }

    #[tokio::test]
    async fn create_tags_for_note() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();
        let note_repo = NoteRepository::new(db.pool.clone());
        let tag_repo = TagRepository::new(db.pool.clone());
        let note = note_repo
            .create_note(
                NoteInput {
                    title: "tags".to_string(),
                    content: "hello #alpha #beta".to_string(),
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
        let names = vec!["alpha".to_string(), "beta".to_string()];
        tag_repo
            .set_note_tags_by_names(note.id, &names)
            .await
            .unwrap();
        let relations = tag_repo.list_relations_for_note(note.id).await.unwrap();
        assert_eq!(relations.len(), 2);
        let _ = fs::remove_dir_all(paths.root);
    }
}

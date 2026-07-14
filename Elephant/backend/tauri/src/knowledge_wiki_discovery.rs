mod engine;

pub use engine::SemanticWikiCandidate;

use elephantnote_knowledge_core::KnowledgeStore;
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::AppHandle;

fn active_connection(app: &AppHandle) -> Result<Connection, String> {
    let root = PathBuf::from(crate::vault::config::get_active_vault(app)?.path);
    let store = KnowledgeStore::open(&root)?;
    Connection::open(store.database_path()).map_err(|error| error.to_string())
}

fn persist_candidate_metadata(
    connection: &Connection,
    candidates: &[SemanticWikiCandidate],
) -> Result<(), String> {
    for candidate in candidates {
        let metadata = serde_json::to_string(&json!({
            "coreSourceCount": candidate.core_source_count,
            "confidence": candidate.confidence,
            "distinctiveness": candidate.distinctiveness,
        }))
        .map_err(|error| error.to_string())?;
        let updated = connection
            .execute(
                "UPDATE wiki_saved_candidates
                 SET metadata_json=?1, updated_at=unixepoch()
                 WHERE topic=?2 AND origin='semantic'",
                params![metadata, candidate.topic.trim().to_lowercase()],
            )
            .map_err(|error| error.to_string())?;
        if updated != 1 {
            return Err(format!(
                "Semantic Wiki candidate metadata row was not persisted: {}",
                candidate.topic
            ));
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn tauri_knowledge_wiki_embedding_map(app: AppHandle) -> Result<Value, String> {
    engine::tauri_knowledge_wiki_embedding_map(app).await
}

#[tauri::command]
pub async fn tauri_knowledge_wiki_semantic_discover(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<SemanticWikiCandidate>, String> {
    let candidates = engine::tauri_knowledge_wiki_semantic_discover(app.clone(), limit).await?;
    let connection = active_connection(&app)?;
    persist_candidate_metadata(&connection, &candidates)?;
    Ok(candidates)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn candidate() -> SemanticWikiCandidate {
        SemanticWikiCandidate {
            topic: "Rust".into(),
            title: "Rust".into(),
            reason: "Initial community".into(),
            preview: "Rust notes".into(),
            suggested_sections: vec!["Ownership".into()],
            source_paths: vec!["Notes/Rust.md".into()],
            source_titles: vec!["Rust guide".into()],
            score: 3,
            coherence: 0.51,
            core_source_count: 2,
            confidence: 0.42,
            distinctiveness: 0.31,
        }
    }

    #[test]
    fn semantic_candidate_metadata_is_refreshed() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(
                "CREATE TABLE wiki_saved_candidates (
                   topic TEXT PRIMARY KEY,
                   metadata_json TEXT NOT NULL DEFAULT '{}',
                   origin TEXT NOT NULL,
                   updated_at INTEGER NOT NULL DEFAULT (unixepoch())
                 );
                 INSERT INTO wiki_saved_candidates(topic, metadata_json, origin)
                 VALUES ('rust', '{}', 'semantic');",
            )
            .expect("create candidate row");

        let mut candidate = candidate();
        persist_candidate_metadata(&connection, &[candidate.clone()])
            .expect("persist initial metadata");
        candidate.core_source_count = 7;
        candidate.confidence = 0.81;
        candidate.distinctiveness = 0.66;
        persist_candidate_metadata(&connection, &[candidate]).expect("refresh metadata");

        let metadata_json: String = connection
            .query_row(
                "SELECT metadata_json FROM wiki_saved_candidates WHERE topic='rust'",
                [],
                |row| row.get(0),
            )
            .expect("read refreshed metadata");
        let metadata: Value = serde_json::from_str(&metadata_json).expect("parse metadata");
        assert_eq!(metadata["coreSourceCount"].as_u64(), Some(7));
        assert!((metadata["confidence"].as_f64().unwrap_or_default() - 0.81).abs() < 1e-6);
        assert!((metadata["distinctiveness"].as_f64().unwrap_or_default() - 0.66).abs() < 1e-6);
    }

    #[test]
    fn missing_semantic_candidate_row_is_an_error() {
        let connection = Connection::open_in_memory().expect("open in-memory database");
        connection
            .execute_batch(
                "CREATE TABLE wiki_saved_candidates (
                   topic TEXT PRIMARY KEY,
                   metadata_json TEXT NOT NULL DEFAULT '{}',
                   origin TEXT NOT NULL,
                   updated_at INTEGER NOT NULL DEFAULT (unixepoch())
                 );",
            )
            .expect("create candidate table");
        let error = persist_candidate_metadata(&connection, &[candidate()])
            .expect_err("missing candidate must fail");
        assert!(error.contains("metadata row was not persisted"));
    }
}

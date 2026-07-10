use crate::knowledge_wikis::{
    tauri_knowledge_wiki_accept, tauri_knowledge_wiki_candidates,
    tauri_knowledge_wiki_generate, WikiCandidate,
};
use elephantnote_knowledge_core::{KnowledgeStore, WikiDraft, WikiDraftStatus};
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const LIBRARY_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS wiki_candidate_decisions (
  topic TEXT PRIMARY KEY,
  decision TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS wiki_candidate_decisions_decision_idx
  ON wiki_candidate_decisions(decision, updated_at DESC);
"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiLibraryItem {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub title: String,
    pub topic: String,
    pub excerpt: String,
    pub reason: String,
    pub path: Option<String>,
    pub source_paths: Vec<String>,
    pub score: usize,
    pub model_id: String,
    pub markdown: String,
    pub draft_id: Option<String>,
    pub citations_count: usize,
    pub updated_at: i64,
}

fn active_vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(
        crate::vault::config::get_active_vault(app)?.path,
    ))
}

fn active_store(root: &Path) -> Result<KnowledgeStore, String> {
    KnowledgeStore::open(root)
}

fn open_library_connection(store: &KnowledgeStore) -> Result<Connection, String> {
    let connection = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    connection
        .execute_batch(LIBRARY_SCHEMA)
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn normalize_topic(topic: &str) -> String {
    topic.trim().to_lowercase()
}

fn candidate_id(topic: &str) -> String {
    format!("wiki-suggestion:{}", normalize_topic(topic))
}

fn rejected_topics(store: &KnowledgeStore) -> Result<HashSet<String>, String> {
    let connection = open_library_connection(store)?;
    let mut statement = connection
        .prepare("SELECT topic FROM wiki_candidate_decisions WHERE decision='rejected'")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<HashSet<_>, _>>()
        .map_err(|error| error.to_string())
}

fn set_candidate_decision(store: &KnowledgeStore, topic: &str, decision: &str) -> Result<(), String> {
    let normalized = normalize_topic(topic);
    if normalized.is_empty() {
        return Err("Wiki suggestion topic cannot be empty.".into());
    }
    let connection = open_library_connection(store)?;
    connection
        .execute(
            "INSERT INTO wiki_candidate_decisions(topic, decision, updated_at)
             VALUES (?1, ?2, unixepoch())
             ON CONFLICT(topic) DO UPDATE SET
               decision=excluded.decision,
               updated_at=unixepoch()",
            params![normalized, decision],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn clear_candidate_decision(store: &KnowledgeStore, topic: &str) -> Result<(), String> {
    let connection = open_library_connection(store)?;
    connection
        .execute(
            "DELETE FROM wiki_candidate_decisions WHERE topic=?1",
            params![normalize_topic(topic)],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn plain_excerpt(markdown: &str) -> String {
    let mut output = String::new();
    for line in markdown.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("<!--") {
            continue;
        }
        for character in trimmed.chars() {
            if matches!(character, '*' | '_' | '`' | '[' | ']' | '>' | '|') {
                continue;
            }
            output.push(character);
            if output.chars().count() >= 220 {
                return format!("{}…", output.trim());
            }
        }
        output.push(' ');
    }
    output.trim().to_string()
}

fn candidate_item(candidate: WikiCandidate) -> WikiLibraryItem {
    WikiLibraryItem {
        id: candidate_id(&candidate.topic),
        kind: "suggestion".into(),
        status: "suggested".into(),
        title: candidate.title,
        topic: candidate.topic,
        excerpt: candidate.reason.clone(),
        reason: candidate.reason,
        path: None,
        source_paths: candidate.source_paths,
        score: candidate.score,
        model_id: String::new(),
        markdown: String::new(),
        draft_id: None,
        citations_count: 0,
        updated_at: 0,
    }
}

fn disk_markdown(root: &Path, draft: &WikiDraft) -> (Option<String>, String) {
    if !matches!(draft.status, WikiDraftStatus::Accepted | WikiDraftStatus::Outdated) {
        return (None, draft.markdown.clone());
    }
    let relative = format!(".elephantnote/wiki/{}.md", draft.slug);
    let target = root.join(&relative);
    let markdown = fs::read_to_string(target).unwrap_or_else(|_| draft.markdown.clone());
    (Some(relative), markdown)
}

fn draft_item(root: &Path, draft: WikiDraft) -> WikiLibraryItem {
    let (path, markdown) = disk_markdown(root, &draft);
    let status = match draft.status {
        WikiDraftStatus::Accepted => "ready",
        WikiDraftStatus::Outdated => "outdated",
        WikiDraftStatus::Proposed => "draft",
        WikiDraftStatus::Rejected => "rejected",
    };
    WikiLibraryItem {
        id: format!("wiki:{}", draft.id),
        kind: "wiki".into(),
        status: status.into(),
        title: draft.title,
        topic: draft.topic,
        excerpt: plain_excerpt(&markdown),
        reason: String::new(),
        path,
        source_paths: draft.source_paths,
        score: 0,
        model_id: draft.model_id,
        markdown,
        draft_id: Some(draft.id),
        citations_count: draft.citations.len(),
        updated_at: draft.updated_at,
    }
}

fn sanitize_generation_payload(mut payload: Value) -> Value {
    if let Some(object) = payload.as_object_mut() {
        object.remove("modelSelection");
        if let Some(ai_config) = object.get_mut("aiConfig").and_then(Value::as_object_mut) {
            ai_config.remove("localModelSelection");
        }
        if let Some(config) = object.get_mut("config").and_then(Value::as_object_mut) {
            config.remove("localModelSelection");
        }
    }
    payload
}

#[tauri::command]
pub fn tauri_knowledge_wiki_library_list(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<WikiLibraryItem>, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let limit = limit.unwrap_or(500).clamp(1, 1_000);
    let rejected = rejected_topics(&store)?;

    let mut suggestions = tauri_knowledge_wiki_candidates(app, Some(limit))?
        .into_iter()
        .filter(|candidate| !rejected.contains(&normalize_topic(&candidate.topic)))
        .map(candidate_item)
        .collect::<Vec<_>>();
    suggestions.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then(left.title.cmp(&right.title))
    });

    let mut wikis = store
        .list_wiki_drafts(None, limit)?
        .into_iter()
        .filter(|draft| !matches!(draft.status, WikiDraftStatus::Rejected))
        .map(|draft| draft_item(&root, draft))
        .collect::<Vec<_>>();
    wikis.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

    suggestions.extend(wikis);
    suggestions.truncate(limit);
    Ok(suggestions)
}

#[tauri::command]
pub async fn tauri_knowledge_wiki_library_generate(
    app: AppHandle,
    topic: String,
    title: Option<String>,
    source_paths: Vec<String>,
    payload: Value,
) -> Result<WikiLibraryItem, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    clear_candidate_decision(&store, &topic)?;

    eprintln!(
        "[knowledge] wiki-library:generate topic={} sources={}",
        topic,
        source_paths.len()
    );
    let generated = tauri_knowledge_wiki_generate(
        app.clone(),
        topic,
        title,
        Some(source_paths),
        sanitize_generation_payload(payload),
        Some(12),
        Some(64),
        Some(10),
    )
    .await?;
    let accepted = tauri_knowledge_wiki_accept(app, generated.draft.id)?;
    eprintln!(
        "[knowledge] wiki-library:ready draft={} path=.elephantnote/wiki/{}.md",
        accepted.id, accepted.slug
    );
    Ok(draft_item(&root, accepted))
}

#[tauri::command]
pub fn tauri_knowledge_wiki_library_reject(
    app: AppHandle,
    topic: String,
) -> Result<(), String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    set_candidate_decision(&store, &topic, "rejected")?;
    eprintln!("[knowledge] wiki-library:rejected topic={}", topic);
    Ok(())
}

#[tauri::command]
pub fn tauri_knowledge_wiki_library_delete(
    app: AppHandle,
    draft_id: String,
    suppress_future: Option<bool>,
) -> Result<(), String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let draft = store
        .wiki_draft(&draft_id)?
        .ok_or_else(|| format!("Unknown wiki draft: {draft_id}"))?;

    let target = root
        .join(".elephantnote")
        .join("wiki")
        .join(format!("{}.md", draft.slug));
    if target.exists() {
        fs::remove_file(&target).map_err(|error| error.to_string())?;
    }

    let connection = open_library_connection(&store)?;
    connection
        .execute("DELETE FROM wiki_drafts WHERE id=?1", params![draft_id])
        .map_err(|error| error.to_string())?;
    if suppress_future.unwrap_or(true) {
        set_candidate_decision(&store, &draft.topic, "rejected")?;
    }
    eprintln!(
        "[knowledge] wiki-library:deleted topic={} file={}",
        draft.topic,
        target.display()
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn candidate_ids_are_stable_and_normalized() {
        assert_eq!(candidate_id("  Minecraft "), "wiki-suggestion:minecraft");
    }

    #[test]
    fn generation_payload_drops_stale_local_model_selection() {
        let cleaned = sanitize_generation_payload(json!({
            "modelSelection": { "wiki": "old.gguf" },
            "aiConfig": {
                "localModelSelection": { "wiki": "old.gguf" },
                "routes": { "chat": { "source": "codex", "model": "gpt-5.4-mini" } }
            }
        }));
        assert!(cleaned.get("modelSelection").is_none());
        assert!(cleaned.pointer("/aiConfig/localModelSelection").is_none());
        assert_eq!(
            cleaned.pointer("/aiConfig/routes/chat/source").and_then(Value::as_str),
            Some("codex")
        );
    }

    #[test]
    fn excerpt_removes_markdown_noise() {
        assert_eq!(plain_excerpt("# Title\n\n**Useful** [text]"), "Useful text");
    }
}

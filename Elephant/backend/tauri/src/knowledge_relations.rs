use elephantnote_knowledge_core::{
    EmbeddingStore, KnowledgeGraph, KnowledgeNodeRef, KnowledgeRelation, KnowledgeStore,
    RelationStatus,
};
use std::path::Path;
use tauri::AppHandle;

const BUILTIN_EMBEDDING_MODEL: &str = "elephantnote-feature-hash-384-v1";

fn active_store(app: &AppHandle) -> Result<KnowledgeStore, String> {
    let root = crate::vault::config::get_active_vault(app)?.path;
    KnowledgeStore::open(Path::new(&root))
}

fn desired_embedding_model(app: &AppHandle) -> String {
    let Ok(config) = crate::tauri_extra_commands::load_ai_config(app) else {
        return BUILTIN_EMBEDDING_MODEL.into();
    };
    let route = config
        .pointer("/routes/embedding")
        .unwrap_or(&serde_json::Value::Null);
    let source = route
        .get("source")
        .or_else(|| route.get("provider"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    let model = route
        .get("model")
        .or_else(|| route.get("modelId"))
        .and_then(serde_json::Value::as_str)
        .map(str::trim)
        .unwrap_or("");
    if source.is_empty() || source == "disabled" || model.is_empty() {
        BUILTIN_EMBEDDING_MODEL.into()
    } else {
        model.to_string()
    }
}

fn wiki_embeddings_are_missing(app: &AppHandle, store: &KnowledgeStore) -> bool {
    let Ok(embeddings) = EmbeddingStore::open(store.database_path()) else {
        return true;
    };
    let Ok(paths) = embeddings.wiki_source_paths() else {
        return true;
    };
    if paths.is_empty() {
        return false;
    }
    let desired_model = desired_embedding_model(app);
    let Ok(status) = embeddings.status() else {
        return true;
    };
    if status.model_id != desired_model {
        return true;
    }
    embeddings
        .pending_inputs(&desired_model, Some(&paths), 1)
        .map(|pending| !pending.is_empty())
        .unwrap_or(true)
}

#[tauri::command]
pub async fn tauri_knowledge_graph(
    app: AppHandle,
    include_suggestions: Option<bool>,
) -> Result<KnowledgeGraph, String> {
    let store = active_store(&app)?;
    if wiki_embeddings_are_missing(&app, &store) {
        match crate::knowledge_embeddings::tauri_knowledge_embeddings_rebuild(
            app.clone(),
            Some(true),
        )
        .await
        {
            Ok(report) if report.updated > 0 => eprintln!(
                "[Knowledge][Graph] embeddings:updated model={} documents={} dimensions={}",
                report.model_id, report.updated, report.dimensions
            ),
            Ok(_) => {}
            Err(error) => eprintln!(
                "[Knowledge][Graph] embeddings:unavailable reason={error}"
            ),
        }
    }
    active_store(&app)?.graph_projection(include_suggestions.unwrap_or(false))
}

#[tauri::command]
pub fn tauri_knowledge_relation_save(
    app: AppHandle,
    relation: KnowledgeRelation,
) -> Result<(), String> {
    active_store(&app)?.save_relation(&relation)
}

#[tauri::command]
pub fn tauri_knowledge_relation_status_set(
    app: AppHandle,
    relation_id: String,
    status: RelationStatus,
) -> Result<bool, String> {
    active_store(&app)?.set_relation_status(&relation_id, status)
}

#[tauri::command]
pub fn tauri_knowledge_relation_get(
    app: AppHandle,
    relation_id: String,
) -> Result<Option<KnowledgeRelation>, String> {
    active_store(&app)?.relation_by_id(&relation_id)
}

#[tauri::command]
pub fn tauri_knowledge_relations_for_node(
    app: AppHandle,
    node: KnowledgeNodeRef,
    include_rejected: Option<bool>,
) -> Result<Vec<KnowledgeRelation>, String> {
    active_store(&app)?.relations_for_node(&node, include_rejected.unwrap_or(false))
}

#[tauri::command]
pub fn tauri_knowledge_relations_list(
    app: AppHandle,
    status: Option<RelationStatus>,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeRelation>, String> {
    active_store(&app)?.list_relations(status, limit.unwrap_or(1_000))
}

use elephantnote_knowledge_core::{
    build_tagging_request, parse_tagging_response, rebuild_vault, ActionValidation, CanonicalTag,
    ChatKnowledgeAction, DocumentSnapshot, DocumentTagAssignment, KnowledgeSearchHit,
    KnowledgeStatus, KnowledgeStore, RebuildReport, StructuredModelRequest, TagAlias,
    TaggingExtraction,
};
use std::path::Path;
use tauri::AppHandle;

fn active_vault_root(app: &AppHandle) -> Result<String, String> {
    crate::vault::config::get_active_vault(app).map(|vault| vault.path)
}

fn active_store(app: &AppHandle) -> Result<KnowledgeStore, String> {
    let root = active_vault_root(app)?;
    KnowledgeStore::open(Path::new(&root))
}

#[tauri::command]
pub fn tauri_knowledge_rebuild(app: AppHandle) -> Result<RebuildReport, String> {
    let root = active_vault_root(&app)?;
    rebuild_vault(Path::new(&root))
}

#[tauri::command]
pub fn tauri_knowledge_status(app: AppHandle) -> Result<KnowledgeStatus, String> {
    active_store(&app)?.status()
}

#[tauri::command]
pub fn tauri_knowledge_search(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeSearchHit>, String> {
    active_store(&app)?.search(&query, limit.unwrap_or(20))
}

#[tauri::command]
pub fn tauri_knowledge_inspect_note(
    app: AppHandle,
    relative_path: String,
) -> Result<Option<DocumentSnapshot>, String> {
    active_store(&app)?.inspect_document(&relative_path)
}

#[tauri::command]
pub fn tauri_knowledge_validate_chat_action(
    action: ChatKnowledgeAction,
) -> ActionValidation {
    action.validate()
}

#[tauri::command]
pub fn tauri_knowledge_tags_list(app: AppHandle) -> Result<Vec<CanonicalTag>, String> {
    active_store(&app)?.list_canonical_tags()
}

#[tauri::command]
pub fn tauri_knowledge_tag_upsert(
    app: AppHandle,
    tag: CanonicalTag,
) -> Result<(), String> {
    active_store(&app)?.upsert_canonical_tag(&tag)
}

#[tauri::command]
pub fn tauri_knowledge_tag_alias_add(
    app: AppHandle,
    alias: TagAlias,
) -> Result<(), String> {
    active_store(&app)?.add_tag_alias(&alias)
}

#[tauri::command]
pub fn tauri_knowledge_tag_resolve(
    app: AppHandle,
    name: String,
    language: Option<String>,
) -> Result<Option<CanonicalTag>, String> {
    active_store(&app)?.resolve_tag(&name, language.as_deref())
}

#[tauri::command]
pub fn tauri_knowledge_tag_assignment_save(
    app: AppHandle,
    assignment: DocumentTagAssignment,
) -> Result<(), String> {
    active_store(&app)?.save_document_tag_assignment(&assignment)
}

#[tauri::command]
pub fn tauri_knowledge_tag_reject_name(
    app: AppHandle,
    relative_path: String,
    proposed_name: String,
    reason: String,
) -> Result<(), String> {
    active_store(&app)?.reject_tag_name(&relative_path, &proposed_name, &reason)
}

#[tauri::command]
pub fn tauri_knowledge_tagging_request(
    app: AppHandle,
    relative_path: String,
    max_tags: Option<usize>,
) -> Result<StructuredModelRequest, String> {
    let store = active_store(&app)?;
    let document = store
        .inspect_document(&relative_path)?
        .ok_or_else(|| format!("Knowledge document is not indexed: {relative_path}"))?;
    let taxonomy = serde_json::to_string(&store.list_canonical_tags()?)
        .map_err(|error| error.to_string())?;
    Ok(build_tagging_request(
        &document,
        &taxonomy,
        max_tags.unwrap_or(8).clamp(1, 20),
    ))
}

#[tauri::command]
pub fn tauri_knowledge_tagging_validate(
    app: AppHandle,
    relative_path: String,
    response_json: String,
    max_tags: Option<usize>,
) -> Result<TaggingExtraction, String> {
    let store = active_store(&app)?;
    let document = store
        .inspect_document(&relative_path)?
        .ok_or_else(|| format!("Knowledge document is not indexed: {relative_path}"))?;
    parse_tagging_response(
        &response_json,
        &document,
        max_tags.unwrap_or(8).clamp(1, 20),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutation_contract_requires_approval_and_hash() {
        let validation = tauri_knowledge_validate_chat_action(ChatKnowledgeAction::ReplaceNote {
            relative_path: "Notes/A.md".into(),
            content: "# A".into(),
            expected_hash: String::new(),
        });
        assert!(!validation.valid);
        assert!(validation.mutates_user_content);
        assert!(validation.requires_approval);
    }
}

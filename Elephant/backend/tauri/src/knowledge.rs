use elephantnote_knowledge_core::{
    rebuild_vault, ActionValidation, ChatKnowledgeAction, DocumentSnapshot, KnowledgeSearchHit,
    KnowledgeStatus, KnowledgeStore, RebuildReport,
};
use std::path::Path;
use tauri::AppHandle;

fn active_vault_root(app: &AppHandle) -> Result<String, String> {
    crate::vault::config::get_active_vault(app).map(|vault| vault.path)
}

#[tauri::command]
pub fn tauri_knowledge_rebuild(app: AppHandle) -> Result<RebuildReport, String> {
    let root = active_vault_root(&app)?;
    rebuild_vault(Path::new(&root))
}

#[tauri::command]
pub fn tauri_knowledge_status(app: AppHandle) -> Result<KnowledgeStatus, String> {
    let root = active_vault_root(&app)?;
    KnowledgeStore::open(Path::new(&root))?.status()
}

#[tauri::command]
pub fn tauri_knowledge_search(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeSearchHit>, String> {
    let root = active_vault_root(&app)?;
    KnowledgeStore::open(Path::new(&root))?.search(&query, limit.unwrap_or(20))
}

#[tauri::command]
pub fn tauri_knowledge_inspect_note(
    app: AppHandle,
    relative_path: String,
) -> Result<Option<DocumentSnapshot>, String> {
    let root = active_vault_root(&app)?;
    KnowledgeStore::open(Path::new(&root))?.inspect_document(&relative_path)
}

#[tauri::command]
pub fn tauri_knowledge_validate_chat_action(
    action: ChatKnowledgeAction,
) -> ActionValidation {
    action.validate()
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

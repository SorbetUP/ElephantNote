use elephantnote_knowledge_core::{
    execute_approved_chat_action, prepare_chat_action, ChatActionExecution, ChatActionProposal,
    ChatActionStatus, ChatKnowledgeAction, KnowledgeStore,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::AppHandle;

fn active_vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(
        crate::vault::config::get_active_vault(app)?.path,
    ))
}

fn active_store(root: &Path) -> Result<KnowledgeStore, String> {
    KnowledgeStore::open(root)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedChatAction {
    pub proposal: ChatActionProposal,
    pub execution: Option<ChatActionExecution>,
}

#[tauri::command]
pub fn tauri_knowledge_chat_action_prepare(
    app: AppHandle,
    action: ChatKnowledgeAction,
    rationale: Option<String>,
) -> Result<PreparedChatAction, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let mut proposal = prepare_chat_action(&root, action, rationale.unwrap_or_default())?;

    if !proposal.action.requires_approval() {
        proposal.status = ChatActionStatus::Approved;
        store.save_chat_action_proposal(&proposal)?;
        let execution = execute_approved_chat_action(&root, &store, &proposal)?;
        store.save_chat_action_proposal(&execution.proposal)?;
        return Ok(PreparedChatAction {
            proposal: execution.proposal.clone(),
            execution: Some(execution),
        });
    }

    store.save_chat_action_proposal(&proposal)?;
    Ok(PreparedChatAction {
        proposal,
        execution: None,
    })
}

#[tauri::command]
pub fn tauri_knowledge_chat_action_get(
    app: AppHandle,
    proposal_id: String,
) -> Result<Option<ChatActionProposal>, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.chat_action_proposal(&proposal_id)
}

#[tauri::command]
pub fn tauri_knowledge_chat_actions_list(
    app: AppHandle,
    status: Option<ChatActionStatus>,
    limit: Option<usize>,
) -> Result<Vec<ChatActionProposal>, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.list_chat_action_proposals(status, limit.unwrap_or(100))
}

#[tauri::command]
pub fn tauri_knowledge_chat_action_approve(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionProposal, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.transition_chat_action(&proposal_id, ChatActionStatus::Approved)
}

#[tauri::command]
pub fn tauri_knowledge_chat_action_reject(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionProposal, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.transition_chat_action(&proposal_id, ChatActionStatus::Rejected)
}

fn completed_execution(
    store: &KnowledgeStore,
    mut proposal: ChatActionProposal,
    result: Value,
) -> Result<ChatActionExecution, String> {
    proposal.status = ChatActionStatus::Executed;
    proposal.result = Some(result.clone());
    proposal.error = None;
    proposal.updated_at = unix_timestamp();
    store.save_chat_action_proposal(&proposal)?;
    Ok(ChatActionExecution { proposal, result })
}

async fn execute_wiki_action(
    app: AppHandle,
    proposal: ChatActionProposal,
) -> Result<ChatActionExecution, String> {
    if !matches!(proposal.status, ChatActionStatus::Approved) {
        return Err("Chat action must be explicitly approved before execution.".into());
    }
    let result = match &proposal.action {
        ChatKnowledgeAction::CreateWiki {
            title,
            topic,
            source_paths,
        } => {
            let config = crate::tauri_extra_commands::load_ai_config(&app)?;
            let item = crate::knowledge_wiki_library::tauri_knowledge_wiki_library_generate(
                app.clone(),
                topic.clone(),
                Some(title.clone()),
                source_paths.clone(),
                json!({ "aiConfig": config }),
            )
            .await?;
            serde_json::to_value(item).map_err(|error| error.to_string())?
        }
        ChatKnowledgeAction::AddWikiSuggestion {
            title,
            topic,
            source_paths,
        } => {
            let item = crate::knowledge_wiki_library::tauri_knowledge_wiki_library_add_candidate(
                app.clone(),
                topic.clone(),
                Some(title.clone()),
                Some(source_paths.clone()),
            )?;
            serde_json::to_value(item).map_err(|error| error.to_string())?
        }
        ChatKnowledgeAction::RejectWikiSuggestion { topic } => {
            crate::knowledge_wiki_library::tauri_knowledge_wiki_library_reject(
                app.clone(),
                topic.clone(),
            )?;
            json!({ "operation": "reject_wiki_suggestion", "topic": topic })
        }
        ChatKnowledgeAction::DeleteWiki { draft_id } => {
            let draft_id = draft_id
                .strip_prefix("wiki:")
                .unwrap_or(draft_id)
                .to_string();
            crate::knowledge_wiki_library::tauri_knowledge_wiki_library_delete(
                app.clone(),
                draft_id.clone(),
                Some(true),
            )?;
            json!({ "operation": "delete_wiki", "draftId": draft_id })
        }
        _ => return Err("Not a Wiki action.".into()),
    };
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    completed_execution(&store, proposal, result)
}

#[tauri::command]
pub async fn tauri_knowledge_chat_action_execute(
    app: AppHandle,
    proposal_id: String,
) -> Result<ChatActionExecution, String> {
    let root = active_vault_root(&app)?;
    let proposal = {
        let store = active_store(&root)?;
        store
            .chat_action_proposal(&proposal_id)?
            .ok_or_else(|| format!("Unknown chat action proposal: {proposal_id}"))?
    };

    let is_wiki = matches!(
        proposal.action,
        ChatKnowledgeAction::CreateWiki { .. }
            | ChatKnowledgeAction::AddWikiSuggestion { .. }
            | ChatKnowledgeAction::RejectWikiSuggestion { .. }
            | ChatKnowledgeAction::DeleteWiki { .. }
    );
    let result = if is_wiki {
        execute_wiki_action(app.clone(), proposal.clone()).await
    } else {
        let store = active_store(&root)?;
        execute_approved_chat_action(&root, &store, &proposal).and_then(|execution| {
            store.save_chat_action_proposal(&execution.proposal)?;
            Ok(execution)
        })
    };

    match result {
        Ok(execution) => Ok(execution),
        Err(error) => {
            let mut failed = proposal;
            failed.status = ChatActionStatus::Failed;
            failed.error = Some(error.clone());
            failed.updated_at = unix_timestamp();
            active_store(&root)?.save_chat_action_proposal(&failed)?;
            Err(error)
        }
    }
}

fn unix_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

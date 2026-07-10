use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{from_value, Value};
use tauri::State;

use super::commands::tauri_muya_engine_sync_document;
use super::muya_clipboard_commands::paste_clipboard;
use super::muya_complete::{apply_complete_command, MuyaCompleteCommand};
use super::muya_engine::{
    apply_command, apply_commands, MuyaEditorCommand, MuyaEditorState, MuyaEditorTransaction,
    MuyaSelection,
};
use super::muya_parity::{apply_parity_command, MuyaParityCommand};
use super::muya_ui::{execute_ui_query, MuyaUiQuery};

#[derive(Default)]
pub struct MuyaEngineSessions {
    sessions: Mutex<HashMap<String, MuyaEditorState>>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MuyaSessionState {
    pub markdown: String,
    pub selection: MuyaSelection,
    pub revision: u64,
    pub undo_depth: usize,
    pub redo_depth: usize,
}

impl From<&MuyaEditorState> for MuyaSessionState {
    fn from(state: &MuyaEditorState) -> Self {
        Self {
            markdown: state.markdown.clone(),
            selection: state.selection,
            revision: state.revision,
            undo_depth: state.undo_stack.len(),
            redo_depth: state.redo_stack.len(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MuyaSessionTransaction {
    pub state: MuyaSessionState,
    pub document_changed: bool,
    pub selection_changed: bool,
}

impl From<&MuyaEditorTransaction> for MuyaSessionTransaction {
    fn from(transaction: &MuyaEditorTransaction) -> Self {
        Self {
            state: MuyaSessionState::from(&transaction.state),
            document_changed: transaction.document_changed,
            selection_changed: transaction.selection_changed,
        }
    }
}

fn validate_editor_id(editor_id: &str) -> Result<(), String> {
    let valid = !editor_id.is_empty()
        && editor_id.len() <= 128
        && editor_id.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':')
        });
    if valid {
        Ok(())
    } else {
        Err("invalid Muya editor session id".to_string())
    }
}

fn lock_sessions(
    sessions: &MuyaEngineSessions,
) -> Result<std::sync::MutexGuard<'_, HashMap<String, MuyaEditorState>>, String> {
    sessions
        .sessions
        .lock()
        .map_err(|_| "Muya editor session store is unavailable".to_string())
}

fn session_transaction(
    sessions: &MuyaEngineSessions,
    editor_id: &str,
    operation: impl FnOnce(MuyaEditorState) -> Result<MuyaEditorTransaction, String>,
) -> Result<MuyaSessionTransaction, String> {
    validate_editor_id(editor_id)?;
    let mut store = lock_sessions(sessions)?;
    let current = store
        .get(editor_id)
        .cloned()
        .ok_or_else(|| format!("Muya editor session not found: {editor_id}"))?;
    let transaction = operation(current)?;
    store.insert(editor_id.to_string(), transaction.state.clone());
    Ok(MuyaSessionTransaction::from(&transaction))
}

#[tauri::command]
pub fn tauri_muya_session_create(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
    markdown: String,
) -> Result<MuyaSessionState, String> {
    validate_editor_id(&editor_id)?;
    let state = MuyaEditorState::new(markdown);
    let view = MuyaSessionState::from(&state);
    lock_sessions(&sessions)?.insert(editor_id, state);
    Ok(view)
}

#[tauri::command]
pub fn tauri_muya_session_sync_document(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
    markdown: String,
    selection: MuyaSelection,
    continue_group: bool,
) -> Result<MuyaSessionTransaction, String> {
    session_transaction(&sessions, &editor_id, |state| {
        let value = tauri_muya_engine_sync_document(state, markdown, selection, continue_group)?;
        from_value::<MuyaEditorTransaction>(value)
            .map_err(|error| format!("invalid Muya sync transaction: {error}"))
    })
}

#[tauri::command]
pub fn tauri_muya_session_apply(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
    command: MuyaEditorCommand,
) -> Result<MuyaSessionTransaction, String> {
    session_transaction(&sessions, &editor_id, |state| apply_command(state, command))
}

#[tauri::command]
pub fn tauri_muya_session_apply_parity(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
    command: MuyaParityCommand,
) -> Result<MuyaSessionTransaction, String> {
    session_transaction(&sessions, &editor_id, |state| {
        apply_parity_command(state, command)
    })
}

#[tauri::command]
pub fn tauri_muya_session_apply_complete(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
    command: MuyaCompleteCommand,
) -> Result<MuyaSessionTransaction, String> {
    session_transaction(&sessions, &editor_id, |state| {
        apply_complete_command(state, command)
    })
}

#[tauri::command]
pub fn tauri_muya_session_paste_clipboard(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
    html: String,
    text: String,
) -> Result<MuyaSessionTransaction, String> {
    session_transaction(&sessions, &editor_id, |state| {
        paste_clipboard(state, html, text)
    })
}

#[tauri::command]
pub fn tauri_muya_session_commit_composition(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
    selection: MuyaSelection,
    text: String,
) -> Result<MuyaSessionTransaction, String> {
    session_transaction(&sessions, &editor_id, |state| {
        apply_commands(
            state,
            vec![
                MuyaEditorCommand::SetSelection {
                    anchor: selection.anchor,
                    focus: selection.focus,
                },
                MuyaEditorCommand::ReplaceSelection { text },
            ],
        )
    })
}

#[tauri::command]
pub fn tauri_muya_session_query(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
    query: MuyaUiQuery,
) -> Result<Value, String> {
    validate_editor_id(&editor_id)?;
    let store = lock_sessions(&sessions)?;
    let state = store
        .get(&editor_id)
        .ok_or_else(|| format!("Muya editor session not found: {editor_id}"))?;
    execute_ui_query(Some(state), query)
}

#[tauri::command]
pub fn tauri_muya_session_close(
    sessions: State<'_, MuyaEngineSessions>,
    editor_id: String,
) -> Result<bool, String> {
    validate_editor_id(&editor_id)?;
    Ok(lock_sessions(&sessions)?.remove(&editor_id).is_some())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_state_exposes_depths_without_serializing_history() {
        let mut state = MuyaEditorState::new("hello".to_string());
        state
            .undo_stack
            .push(super::super::muya_engine::MuyaEditorSnapshot {
                markdown: String::new(),
                selection: MuyaSelection::collapsed(0),
            });
        let view = MuyaSessionState::from(&state);
        let json = serde_json::to_value(view).expect("session view should serialize");

        assert_eq!(json["undoDepth"], 1);
        assert_eq!(json["redoDepth"], 0);
        assert!(json.get("undoStack").is_none());
        assert!(json.get("redoStack").is_none());
    }

    #[test]
    fn session_ids_are_bounded_and_safe() {
        assert!(validate_editor_id("note-1:primary").is_ok());
        assert!(validate_editor_id("").is_err());
        assert!(validate_editor_id("../../note").is_err());
        assert!(validate_editor_id(&"a".repeat(129)).is_err());
    }

    #[test]
    fn complete_commands_keep_history_inside_the_session_state() {
        let state = MuyaEditorState::new("alpha\nbeta".to_string());
        let transaction = apply_complete_command(state, MuyaCompleteCommand::DuplicateBlock)
            .expect("complete command should apply");
        assert_eq!(transaction.state.markdown, "alpha\nbeta\nbeta");
        assert_eq!(transaction.state.undo_stack.len(), 1);
    }

    #[test]
    fn parity_commands_keep_history_inside_the_session_state() {
        let state = MuyaEditorState::new("Body".to_string());
        let transaction = apply_parity_command(
            state,
            MuyaParityCommand::InsertTemplate {
                id: "heading".to_string(),
            },
        )
        .expect("parity command should apply");

        assert_eq!(transaction.state.markdown, "Body# ");
        assert_eq!(transaction.state.undo_stack.len(), 1);
    }

    #[test]
    fn rich_clipboard_transaction_remains_in_native_history() {
        let mut state = MuyaEditorState::new("A😀B".to_string());
        state.selection = MuyaSelection {
            anchor: 1,
            focus: 3,
        };
        let transaction = paste_clipboard(
            state,
            "<strong>bold</strong>".to_string(),
            "bold".to_string(),
        )
        .expect("rich paste should apply");

        assert_eq!(transaction.state.markdown, "A**bold**B");
        assert_eq!(transaction.state.undo_stack.len(), 1);
        assert_eq!(transaction.state.redo_stack.len(), 0);
    }

    #[test]
    fn ime_commit_is_one_native_history_entry() {
        let state = MuyaEditorState::new("A B".to_string());
        let transaction = apply_commands(
            state,
            vec![
                MuyaEditorCommand::SetSelection {
                    anchor: 1,
                    focus: 2,
                },
                MuyaEditorCommand::ReplaceSelection {
                    text: "日本語".to_string(),
                },
            ],
        )
        .expect("composition should commit");

        assert_eq!(transaction.state.markdown, "A日本語B");
        assert_eq!(transaction.state.undo_stack.len(), 1);
        assert_eq!(transaction.state.selection.anchor, 4);
        assert_eq!(transaction.state.selection.focus, 4);
    }
}

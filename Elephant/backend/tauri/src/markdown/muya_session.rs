use std::collections::HashMap;
use std::sync::Mutex;

use serde::Serialize;
use serde_json::{from_value, Value};
use tauri::State;

use super::commands::tauri_muya_engine_sync_document;
use super::muya_engine::{
  apply_command, MuyaEditorCommand, MuyaEditorState, MuyaEditorTransaction, MuyaSelection,
};
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
    && editor_id
      .chars()
      .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':'));
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
    state.undo_stack.push(super::super::muya_engine::MuyaEditorSnapshot {
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
}

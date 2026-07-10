use serde_json::from_value;

use super::commands::tauri_muya_engine_sync_document;
use super::muya_engine::{apply_command, MuyaEditorCommand, MuyaEditorState, MuyaEditorTransaction, MuyaSelection};

#[test]
fn real_muya_sync_persists_markdown_selection_and_history() {
  let state = MuyaEditorState::new("one".to_string());
  let transaction: MuyaEditorTransaction = from_value(
    tauri_muya_engine_sync_document(
      state,
      "one!".to_string(),
      MuyaSelection { anchor: 4, focus: 4 },
      false,
    )
    .expect("document sync should succeed"),
  )
  .expect("transaction should deserialize");

  assert_eq!(transaction.state.markdown, "one!");
  assert_eq!(transaction.state.selection, MuyaSelection { anchor: 4, focus: 4 });
  assert_eq!(transaction.state.undo_stack.len(), 1);
  assert_eq!(transaction.state.undo_stack[0].markdown, "one");
  assert!(transaction.document_changed);
}

#[test]
fn real_muya_sync_groups_consecutive_native_edits() {
  let state = MuyaEditorState::new("a".to_string());
  let first: MuyaEditorTransaction = from_value(
    tauri_muya_engine_sync_document(
      state,
      "ab".to_string(),
      MuyaSelection { anchor: 2, focus: 2 },
      false,
    )
    .expect("first sync should succeed"),
  )
  .expect("first transaction should deserialize");

  let second: MuyaEditorTransaction = from_value(
    tauri_muya_engine_sync_document(
      first.state,
      "abc".to_string(),
      MuyaSelection { anchor: 3, focus: 3 },
      true,
    )
    .expect("grouped sync should succeed"),
  )
  .expect("second transaction should deserialize");

  assert_eq!(second.state.undo_stack.len(), 1);
  assert_eq!(second.state.undo_stack[0].markdown, "a");

  let undo = apply_command(second.state, MuyaEditorCommand::Undo).expect("undo should succeed");
  assert_eq!(undo.state.markdown, "a");
}

#[test]
fn real_muya_sync_clamps_utf16_selection_after_emoji() {
  let state = MuyaEditorState::new(String::new());
  let transaction: MuyaEditorTransaction = from_value(
    tauri_muya_engine_sync_document(
      state,
      "a😀b".to_string(),
      MuyaSelection { anchor: 3, focus: 3 },
      false,
    )
    .expect("unicode sync should succeed"),
  )
  .expect("unicode transaction should deserialize");

  assert_eq!(transaction.state.selection, MuyaSelection { anchor: 3, focus: 3 });
}

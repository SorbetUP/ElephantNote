use super::commands::tauri_muya_engine_apply_grouped;
use super::muya_engine::{apply_command, MuyaEditorCommand, MuyaEditorState};

fn state_from(value: &serde_json::Value) -> MuyaEditorState {
    serde_json::from_value(value["state"].clone()).expect("transaction state must deserialize")
}

#[test]
fn consecutive_grouped_typing_keeps_one_undo_snapshot() {
    let first = tauri_muya_engine_apply_grouped(
        MuyaEditorState::new(String::new()),
        MuyaEditorCommand::InsertText {
            text: "a".to_string(),
        },
        false,
    )
    .expect("first grouped mutation must succeed");
    let second = tauri_muya_engine_apply_grouped(
        state_from(&first),
        MuyaEditorCommand::InsertText {
            text: "b".to_string(),
        },
        true,
    )
    .expect("continued grouped mutation must succeed");

    let state = state_from(&second);
    assert_eq!(state.markdown, "ab");
    assert_eq!(state.undo_stack.len(), 1);
    assert_eq!(state.undo_stack[0].markdown, "");

    let undone = apply_command(state, MuyaEditorCommand::Undo)
        .expect("undo must succeed")
        .state;
    assert_eq!(undone.markdown, "");
}

#[test]
fn closing_a_group_creates_a_new_undo_boundary() {
    let first = tauri_muya_engine_apply_grouped(
        MuyaEditorState::new(String::new()),
        MuyaEditorCommand::InsertText {
            text: "a".to_string(),
        },
        false,
    )
    .unwrap();
    let second = tauri_muya_engine_apply_grouped(
        state_from(&first),
        MuyaEditorCommand::InsertText {
            text: "b".to_string(),
        },
        false,
    )
    .unwrap();

    let state = state_from(&second);
    assert_eq!(state.markdown, "ab");
    assert_eq!(state.undo_stack.len(), 2);

    let once = apply_command(state, MuyaEditorCommand::Undo).unwrap().state;
    assert_eq!(once.markdown, "a");
    let twice = apply_command(once, MuyaEditorCommand::Undo).unwrap().state;
    assert_eq!(twice.markdown, "");
}

#[test]
fn a_noop_does_not_destroy_the_preserved_group_snapshot() {
    let first = tauri_muya_engine_apply_grouped(
        MuyaEditorState::new("a".to_string()),
        MuyaEditorCommand::InsertText {
            text: "b".to_string(),
        },
        false,
    )
    .unwrap();
    let noop = tauri_muya_engine_apply_grouped(
        state_from(&first),
        MuyaEditorCommand::SetSelection {
            anchor: 2,
            focus: 2,
        },
        true,
    )
    .unwrap();

    let state = state_from(&noop);
    assert_eq!(state.markdown, "ab");
    assert_eq!(state.undo_stack.len(), 1);
    assert_eq!(state.undo_stack[0].markdown, "a");
}

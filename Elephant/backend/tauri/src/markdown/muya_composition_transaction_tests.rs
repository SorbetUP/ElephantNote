use super::commands::tauri_muya_engine_commit_composition;
use super::muya_engine::{apply_command, MuyaEditorCommand, MuyaEditorState, MuyaSelection};

#[test]
fn commits_ime_text_with_javascript_utf16_selection() {
    let state = MuyaEditorState::new("A😀B".to_string());
    let value = tauri_muya_engine_commit_composition(
        state,
        MuyaSelection {
            anchor: 1,
            focus: 3,
        },
        "漢".to_string(),
    )
    .expect("composition must commit");
    assert_eq!(value["state"]["markdown"], "A漢B");
    assert_eq!(value["state"]["selection"]["anchor"], 2);
    assert_eq!(value["state"]["selection"]["focus"], 2);
    assert_eq!(value["state"]["undoStack"].as_array().unwrap().len(), 1);
}

#[test]
fn one_undo_reverts_the_entire_composition() {
    let state = MuyaEditorState::new("hello".to_string());
    let value = tauri_muya_engine_commit_composition(
        state,
        MuyaSelection::collapsed(5),
        "世界".to_string(),
    )
    .expect("composition must commit");
    let committed: MuyaEditorState =
        serde_json::from_value(value["state"].clone()).expect("transaction state must deserialize");
    let undone = apply_command(committed, MuyaEditorCommand::Undo)
        .expect("undo must succeed")
        .state;
    assert_eq!(undone.markdown, "hello");
    assert_eq!(undone.selection, MuyaSelection::collapsed(5));
}

#[test]
fn empty_composition_replaces_the_selected_text_as_a_deletion() {
    let state = MuyaEditorState::new("remove me".to_string());
    let value = tauri_muya_engine_commit_composition(
        state,
        MuyaSelection {
            anchor: 0,
            focus: 6,
        },
        String::new(),
    )
    .expect("empty composition must be valid");
    assert_eq!(value["state"]["markdown"], " me");
    assert_eq!(value["state"]["undoStack"].as_array().unwrap().len(), 1);
}

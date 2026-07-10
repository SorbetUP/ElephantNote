use serde_json::{json, Value};

use super::muya_clipboard_html::clipboard_payload_to_markdown;
use super::muya_engine::{apply_command, MuyaEditorCommand, MuyaEditorState};

#[tauri::command]
pub fn tauri_muya_engine_paste_clipboard(
  state: MuyaEditorState,
  html: String,
  text: String,
) -> Result<Value, String> {
  let markdown = clipboard_payload_to_markdown(&html, &text);
  apply_command(state, MuyaEditorCommand::ReplaceSelection { text: markdown })
    .map(|transaction| json!(transaction))
}

#[cfg(test)]
mod tests {
  use super::*;
  use super::super::muya_engine::{apply_command, MuyaEditorCommand, MuyaSelection};

  #[test]
  fn inserts_rich_clipboard_at_utf16_selection() {
    let mut state = MuyaEditorState::new("A😀B".to_string());
    state.selection = MuyaSelection { anchor: 1, focus: 3 };
    let value = tauri_muya_engine_paste_clipboard(
      state,
      "<strong>bold</strong>".to_string(),
      "bold".to_string(),
    ).unwrap();
    assert_eq!(value["state"]["markdown"], "A**bold**B");
    assert_eq!(value["state"]["undoStack"].as_array().unwrap().len(), 1);
  }

  #[test]
  fn one_undo_reverts_the_whole_rich_paste() {
    let state = MuyaEditorState::new("base".to_string());
    let value = tauri_muya_engine_paste_clipboard(
      state,
      "<p>one</p><p>two</p>".to_string(),
      "one\ntwo".to_string(),
    ).unwrap();
    let pasted: MuyaEditorState = serde_json::from_value(value["state"].clone()).unwrap();
    assert_eq!(pasted.markdown, "baseone\n\ntwo");
    let undone = apply_command(pasted, MuyaEditorCommand::Undo).unwrap().state;
    assert_eq!(undone.markdown, "base");
  }

  #[test]
  fn plain_text_paste_preserves_line_breaks() {
    let state = MuyaEditorState::new(String::new());
    let value = tauri_muya_engine_paste_clipboard(
      state,
      String::new(),
      "line 1\nline 2".to_string(),
    ).unwrap();
    assert_eq!(value["state"]["markdown"], "line 1\nline 2");
  }
}

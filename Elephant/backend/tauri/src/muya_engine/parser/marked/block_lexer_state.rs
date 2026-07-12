use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CursorSignatures<'a> {
  pub anchor: &'a str,
  pub focus: &'a str,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockLexerState {
  pub src: String,
  pub top: bool,
  pub prev_list_is_ordered: Option<bool>,
  pub check_cursor_signature: bool,
  pub found_anchor_signature: bool,
  pub found_focus_signature: bool,
  pub cursor_anchor_focus: String,
}

pub fn create_block_lexer_state(
  src: &str,
  top: bool,
  prev_list_is_ordered: Option<bool>,
  check_cursor_signature: bool,
) -> BlockLexerState {
  BlockLexerState {
    src: remove_space_only_lines(src),
    top,
    prev_list_is_ordered,
    check_cursor_signature,
    found_anchor_signature: false,
    found_focus_signature: false,
    cursor_anchor_focus: String::new(),
  }
}

pub fn prepare_cursor_signature(state: &mut BlockLexerState, signatures: CursorSignatures<'_>) {
  state.cursor_anchor_focus.clear();
  if !state.check_cursor_signature {
    return;
  }

  if !state.found_anchor_signature && state.src.starts_with(signatures.anchor) {
    state.cursor_anchor_focus.push_str(signatures.anchor);
    state.src.drain(..signatures.anchor.len());
    state.found_anchor_signature = true;
  }
  if !state.found_focus_signature && state.src.starts_with(signatures.focus) {
    state.cursor_anchor_focus.push_str(signatures.focus);
    state.src.drain(..signatures.focus.len());
    state.found_focus_signature = true;
  }
}

fn remove_space_only_lines(src: &str) -> String {
  let mut output = String::with_capacity(src.len());
  for segment in src.split_inclusive('\n') {
    let (line, newline) = segment
      .strip_suffix('\n')
      .map_or((segment, ""), |line| (line, "\n"));
    if !line.is_empty() && line.bytes().all(|byte| byte == b' ') {
      output.push_str(newline);
    } else {
      output.push_str(segment);
    }
  }
  output
}

#[cfg(test)]
mod tests {
  use super::*;

  const SIGNATURES: CursorSignatures<'static> = CursorSignatures {
    anchor: "ANCHOR",
    focus: "FOCUS",
  };

  #[test]
  fn removes_only_space_only_lines() {
    let state = create_block_lexer_state("   \na\n  ", true, None, false);
    assert_eq!(state.src, "\na\n");
  }

  #[test]
  fn consumes_anchor_then_focus_once() {
    let mut state = create_block_lexer_state("ANCHORFOCUShello", true, Some(false), true);
    prepare_cursor_signature(&mut state, SIGNATURES.clone());
    assert_eq!(state.src, "hello");
    assert_eq!(state.cursor_anchor_focus, "ANCHORFOCUS");
    assert!(state.found_anchor_signature);
    assert!(state.found_focus_signature);
  }

  #[test]
  fn preserves_javascript_consumption_order() {
    let mut state = create_block_lexer_state("FOCUSANCHORhello", false, Some(true), true);
    prepare_cursor_signature(&mut state, SIGNATURES.clone());
    assert_eq!(state.src, "ANCHORhello");
    assert_eq!(state.cursor_anchor_focus, "FOCUS");
    assert!(!state.found_anchor_signature);
    assert!(state.found_focus_signature);
  }

  #[test]
  fn does_not_consume_signatures_twice() {
    let mut state = create_block_lexer_state("ANCHORANCHORx", true, None, true);
    prepare_cursor_signature(&mut state, SIGNATURES.clone());
    prepare_cursor_signature(&mut state, SIGNATURES);
    assert_eq!(state.src, "ANCHORx");
    assert_eq!(state.cursor_anchor_focus, "");
  }
}

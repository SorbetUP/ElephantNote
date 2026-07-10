use serde::Deserialize;

use super::muya_engine::{MuyaEditorState, MuyaSelection};
use super::muya_parity::{apply_parity_command, MuyaParityCommand};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SharedParityCase {
  name: String,
  markdown: String,
  selection: MuyaSelection,
  command: MuyaParityCommand,
  expected: String,
}

#[test]
fn shared_javascript_rust_parity_matrix_passes() {
  let cases: Vec<SharedParityCase> = serde_json::from_str(include_str!(
    "../../../../shared/muyaParityCases.json"
  )).expect("shared Muya parity cases must be valid JSON");

  assert!(cases.len() >= 12, "parity matrix must stay broad");

  for case in cases {
    let mut state = MuyaEditorState::new(case.markdown);
    state.selection = case.selection;
    let transaction = apply_parity_command(state, case.command)
      .unwrap_or_else(|error| panic!("parity case '{}' failed: {error}", case.name));
    assert_eq!(
      transaction.state.markdown,
      case.expected,
      "Muya parity case '{}' diverged",
      case.name
    );
  }
}

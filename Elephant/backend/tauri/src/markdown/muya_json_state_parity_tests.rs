use serde::Deserialize;
use serde_json::Value;

use super::muya_state::{json_state_to_markdown, markdown_to_json_state};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct JsonStateCase {
  name: String,
  markdown: String,
  round_trip: String,
  expected: Value,
}

#[test]
fn shared_json_state_matrix_matches_legacy_muya_shape() {
  let cases: Vec<JsonStateCase> = serde_json::from_str(include_str!(
    "../../../../shared/muyaJsonStateCases.json"
  )).expect("shared Muya JSON state cases must be valid");

  assert!(cases.len() >= 8, "JSON state matrix must remain broad");

  for case in cases {
    let state = markdown_to_json_state(&case.markdown);
    assert_eq!(
      serde_json::to_value(&state).expect("state must serialize"),
      case.expected,
      "Muya JSON state case '{}' diverged",
      case.name
    );
    assert_eq!(
      json_state_to_markdown(&state),
      case.round_trip,
      "Muya JSON state round-trip '{}' diverged",
      case.name
    );
  }
}

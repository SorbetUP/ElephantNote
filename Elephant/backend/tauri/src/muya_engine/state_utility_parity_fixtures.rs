use serde_json::Value;

use super::parser::marked::block_lexer_state::{
  create_block_lexer_state, prepare_cursor_signature, CursorSignatures,
};
use super::utils::footnotes::collect_footnotes;
use super::utils::hash::{gen_upper_to_lower_key_hash, generate_key_hash};
use super::utils::markdown_file::has_markdown_extension;

fn fixture() -> Value {
  serde_json::from_str(include_str!("fixtures/state_utility_foundation.json"))
    .expect("the JavaScript state utility fixture must be valid JSON")
}

#[test]
fn key_hashes_match_the_javascript_oracle() {
  let fixture = fixture();
  let upper = gen_upper_to_lower_key_hash(["PARAGRAPH", "BLOCK_QUOTE"]);
  let expected_upper = fixture["upperLower"].as_array().unwrap();
  for item in expected_upper {
    let item = item.as_array().unwrap();
    assert_eq!(upper[item[0].as_str().unwrap()], item[1].as_str().unwrap());
  }

  let identity = generate_key_hash(["div", "figure"]);
  for item in fixture["identity"].as_array().unwrap() {
    let item = item.as_array().unwrap();
    assert_eq!(identity[item[0].as_str().unwrap()], item[1].as_str().unwrap());
  }
}

#[test]
fn markdown_extensions_match_the_javascript_oracle() {
  let fixture = fixture();
  for case in fixture["markdownExtensions"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    assert_eq!(
      has_markdown_extension(case[0].as_str()),
      case[1].as_bool().unwrap()
    );
  }
}

#[test]
fn footnotes_match_the_javascript_map_contract() {
  let fixture = fixture();
  let map = collect_footnotes(fixture["footnoteBlocks"].as_array().unwrap());
  let actual = map
    .iter()
    .map(|(identifier, block)| Value::Array(vec![Value::String(identifier.to_string()), block.clone()]))
    .collect::<Vec<_>>();
  assert_eq!(actual, fixture["footnotes"]);
}

#[test]
fn block_lexer_state_matches_the_javascript_oracle() {
  let fixture = fixture();
  let signatures = CursorSignatures { anchor: "ANCHOR", focus: "FOCUS" };
  for case in fixture["blockLexerState"].as_array().unwrap() {
    let input = case["input"].as_array().unwrap();
    let mut state = create_block_lexer_state(
      input[0].as_str().unwrap(),
      input[1].as_bool().unwrap(),
      input[2].as_bool(),
      input[3].as_bool().unwrap(),
    );
    prepare_cursor_signature(&mut state, signatures.clone());
    assert_eq!(serde_json::to_value(state).unwrap(), case["state"]);
  }
}

use serde_json::Value;

use super::parser::marked::options::default_options;
use super::utils::clone::{deep_clone, deep_copy, deep_copy_array};
use super::utils::metrics::word_count;

fn fixture() -> Value {
  serde_json::from_str(include_str!("fixtures/utility_foundation.json"))
    .expect("the JavaScript utility fixture must be valid JSON")
}

#[test]
fn metrics_match_the_javascript_oracle() {
  let fixture = fixture();
  for case in fixture["metrics"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    assert_eq!(
      serde_json::to_value(word_count(case[0].as_str().unwrap())).unwrap(),
      case[1]
    );
  }
}

#[test]
fn cloning_matches_the_javascript_oracle_for_muya_json_values() {
  let fixture = fixture();
  let object_case = &fixture["clone"][0];
  let input = &object_case["input"];
  assert_eq!(
    Value::Object(deep_copy(input.as_object().unwrap())),
    object_case["deepCopy"]
  );
  assert_eq!(deep_clone(input), object_case["deepClone"]);

  let array_case = &fixture["clone"][1];
  assert_eq!(
    Value::Array(deep_copy_array(array_case["input"].as_array().unwrap())),
    array_case["deepCopyArray"]
  );
}

#[test]
fn marked_options_match_the_javascript_oracle() {
  let fixture = fixture();
  assert_eq!(default_options(), fixture["options"]);
}

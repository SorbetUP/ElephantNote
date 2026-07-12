use serde_json::Value;

use super::parser::marked::string_tools::{find_closing_bracket, rtrim};
use super::parser::marked::table_tools::split_cells;
use super::parser::marked::unique_id::get_unique_id;
use super::utils::primitives::{
  camel_to_snake, conflict, is_even, is_length_even, is_meta_key, is_odd, snake_to_camel,
  union, ActiveRange, Range,
};

fn fixture() -> Value {
  serde_json::from_str(include_str!("fixtures/atomic_foundation.json"))
    .expect("the JavaScript oracle fixture must be valid JSON")
}

fn items<'a>(value: &'a Value, name: &str) -> &'a [Value] {
  value[name]
    .as_array()
    .unwrap_or_else(|| panic!("fixture field {name} must be an array"))
}

#[test]
fn primitives_match_the_javascript_oracle() {
  let fixture = fixture();
  let primitives = &fixture["primitives"];

  for case in items(primitives, "metaKeys") {
    let case = case.as_array().unwrap();
    assert_eq!(is_meta_key(case[0].as_str().unwrap()), case[1].as_bool().unwrap());
  }
  for case in items(primitives, "odd") {
    let case = case.as_array().unwrap();
    assert_eq!(is_odd(case[0].as_f64().unwrap()), case[1].as_bool().unwrap());
  }
  for case in items(primitives, "even") {
    let case = case.as_array().unwrap();
    assert_eq!(is_even(case[0].as_f64().unwrap()), case[1].as_bool().unwrap());
  }
  for case in items(primitives, "lengthEven") {
    let case = case.as_array().unwrap();
    assert_eq!(
      is_length_even(case[0].as_str().unwrap()),
      case[1].as_bool().unwrap()
    );
  }
  for case in items(primitives, "snakeToCamel") {
    let case = case.as_array().unwrap();
    assert_eq!(
      snake_to_camel(case[0].as_str().unwrap()),
      case[1].as_str().unwrap()
    );
  }
  for case in items(primitives, "camelToSnake") {
    let case = case.as_array().unwrap();
    assert_eq!(
      camel_to_snake(case[0].as_str().unwrap()),
      case[1].as_str().unwrap()
    );
  }

  for case in items(primitives, "conflicts") {
    let case = case.as_array().unwrap();
    let first = case[0].as_array().unwrap();
    let second = case[1].as_array().unwrap();
    assert_eq!(
      conflict(
        [first[0].as_i64().unwrap(), first[1].as_i64().unwrap()],
        [second[0].as_i64().unwrap(), second[1].as_i64().unwrap()],
      ),
      case[2].as_bool().unwrap()
    );
  }

  for case in items(primitives, "unions") {
    let case = case.as_array().unwrap();
    let target = &case[0];
    let local = &case[1];
    let result = union(
      Range {
        start: target["start"].as_i64().unwrap(),
        end: target["end"].as_i64().unwrap(),
      },
      ActiveRange {
        start: local["start"].as_i64().unwrap(),
        end: local["end"].as_i64().unwrap(),
        active: local["active"].clone(),
      },
    );
    if case[2].is_null() {
      assert!(result.is_none());
    } else {
      let result = result.expect("JavaScript oracle returned a range");
      assert_eq!(result.start, case[2]["start"].as_i64().unwrap());
      assert_eq!(result.end, case[2]["end"].as_i64().unwrap());
      assert_eq!(result.active, case[2]["active"]);
    }
  }
}

#[test]
fn marked_string_tools_match_the_javascript_oracle() {
  let fixture = fixture();
  let string_tools = &fixture["stringTools"];

  for case in items(string_tools, "rtrim") {
    let case = case.as_array().unwrap();
    assert_eq!(
      rtrim(
        case[0].as_str().unwrap(),
        case[1].as_str().unwrap(),
        case[2].as_bool().unwrap(),
      ),
      case[3].as_str().unwrap()
    );
  }

  for case in items(string_tools, "closingBracket") {
    let case = case.as_array().unwrap();
    let brackets = case[1].as_array().unwrap();
    assert_eq!(
      find_closing_bracket(
        case[0].as_str().unwrap(),
        brackets[0].as_str().unwrap(),
        brackets[1].as_str().unwrap(),
      ),
      case[2].as_i64().unwrap()
    );
  }
}

#[test]
fn table_tools_match_the_javascript_oracle() {
  let fixture = fixture();
  for case in fixture["tableTools"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    let expected = case[2]
      .as_array()
      .unwrap()
      .iter()
      .map(|value| value.as_str().unwrap().to_string())
      .collect::<Vec<_>>();
    assert_eq!(
      split_cells(case[0].as_str().unwrap(), case[1].as_u64().unwrap() as usize),
      expected
    );
  }
}

#[test]
fn unique_ids_preserve_the_javascript_monotonic_contract() {
  let fixture = fixture();
  let expected_count = fixture["uniqueIds"].as_array().unwrap().len();
  let ids = (0..expected_count).map(|_| get_unique_id()).collect::<Vec<_>>();
  assert!(ids.windows(2).all(|window| window[1] == window[0] + 1));
}

use serde_json::{Map, Value};

pub fn deep_copy_array(array: &[Value]) -> Vec<Value> {
  array.iter().map(deep_copy_value).collect()
}

pub fn deep_copy(object: &Map<String, Value>) -> Map<String, Value> {
  object
    .iter()
    .map(|(key, value)| (key.clone(), deep_copy_value(value)))
    .collect()
}

pub fn deep_clone(value: &Value) -> Value {
  value.clone()
}

fn deep_copy_value(value: &Value) -> Value {
  match value {
    Value::Array(array) => Value::Array(deep_copy_array(array)),
    Value::Object(object) => Value::Object(deep_copy(object)),
    _ => value.clone(),
  }
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::*;

  #[test]
  fn recursively_copies_json_objects_and_arrays() {
    let input = json!({ "a": 1, "b": [2, { "c": "x" }], "d": null });
    let copied = deep_copy(input.as_object().unwrap());
    assert_eq!(Value::Object(copied), input);
  }

  #[test]
  fn deep_clone_matches_json_roundtrip_for_json_values() {
    let input = json!([1, [2], { "x": true }]);
    assert_eq!(deep_clone(&input), input);
    assert_eq!(Value::Array(deep_copy_array(input.as_array().unwrap())), input);
  }
}

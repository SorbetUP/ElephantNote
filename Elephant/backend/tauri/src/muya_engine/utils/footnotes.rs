use serde_json::Value;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct FootnoteMap {
  entries: Vec<(String, Value)>,
}

impl FootnoteMap {
  pub fn get(&self, identifier: &str) -> Option<&Value> {
    self.entries
      .iter()
      .find_map(|(key, value)| (key == identifier).then_some(value))
  }

  pub fn iter(&self) -> impl Iterator<Item = (&str, &Value)> {
    self.entries.iter().map(|(key, value)| (key.as_str(), value))
  }

  pub fn len(&self) -> usize {
    self.entries.len()
  }

  pub fn is_empty(&self) -> bool {
    self.entries.is_empty()
  }

  fn set(&mut self, identifier: String, block: Value) {
    if let Some((_, value)) = self.entries.iter_mut().find(|(key, _)| key == &identifier) {
      *value = block;
    } else {
      self.entries.push((identifier, block));
    }
  }
}

pub fn collect_footnotes(blocks: &[Value]) -> FootnoteMap {
  let mut footnotes = FootnoteMap::default();
  for block in blocks {
    if block.get("type").and_then(Value::as_str) == Some("figure")
      && block.get("functionType").and_then(Value::as_str) == Some("footnote")
    {
      let identifier = block["children"][0]["text"]
        .as_str()
        .expect("Muya footnote blocks require children[0].text")
        .to_string();
      footnotes.set(identifier, block.clone());
    }
  }
  footnotes
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::*;

  #[test]
  fn collects_only_footnote_figures() {
    let first = json!({ "type": "figure", "functionType": "footnote", "children": [{ "text": "a" }], "value": 1 });
    let ignored = json!({ "type": "p", "children": [{ "text": "b" }] });
    let map = collect_footnotes(&[first.clone(), ignored]);
    assert_eq!(map.len(), 1);
    assert_eq!(map.get("a"), Some(&first));
  }

  #[test]
  fn duplicate_identifiers_replace_values_without_reordering() {
    let first = json!({ "type": "figure", "functionType": "footnote", "children": [{ "text": "a" }], "value": 1 });
    let second = json!({ "type": "figure", "functionType": "footnote", "children": [{ "text": "b" }], "value": 2 });
    let replacement = json!({ "type": "figure", "functionType": "footnote", "children": [{ "text": "a" }], "value": 3 });
    let map = collect_footnotes(&[first, second, replacement.clone()]);
    assert_eq!(map.iter().map(|(key, _)| key).collect::<Vec<_>>(), vec!["a", "b"]);
    assert_eq!(map.get("a"), Some(&replacement));
  }
}

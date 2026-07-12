use std::collections::BTreeMap;

pub fn gen_upper_to_lower_key_hash<I, S>(keys: I) -> BTreeMap<String, String>
where
  I: IntoIterator<Item = S>,
  S: AsRef<str>,
{
  keys
    .into_iter()
    .map(|key| {
      let key = key.as_ref().to_string();
      let value = key.to_lowercase().replace('_', "-");
      (key, value)
    })
    .collect()
}

pub fn generate_key_hash<I, S>(keys: I) -> BTreeMap<String, String>
where
  I: IntoIterator<Item = S>,
  S: AsRef<str>,
{
  keys
    .into_iter()
    .map(|key| {
      let key = key.as_ref().to_string();
      (key.clone(), key)
    })
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn generates_lowercase_dash_values() {
    let hash = gen_upper_to_lower_key_hash(["PARAGRAPH", "BLOCK_QUOTE"]);
    assert_eq!(hash["PARAGRAPH"], "paragraph");
    assert_eq!(hash["BLOCK_QUOTE"], "block-quote");
  }

  #[test]
  fn generates_identity_values() {
    let hash = generate_key_hash(["div", "figure"]);
    assert_eq!(hash["div"], "div");
    assert_eq!(hash["figure"], "figure");
  }
}

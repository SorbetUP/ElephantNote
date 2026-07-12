use serde_json::{json, Value};

pub fn default_options() -> Value {
  json!({
    "baseUrl": null,
    "breaks": false,
    "gfm": true,
    "headerIds": true,
    "headerPrefix": "",
    "highlight": null,
    "mathRenderer": null,
    "emojiRenderer": null,
    "tocRenderer": null,
    "langPrefix": "language-",
    "mangle": true,
    "pedantic": false,
    "renderer": null,
    "silent": false,
    "smartLists": false,
    "smartypants": false,
    "xhtml": false,
    "disableInline": false,
    "sanitize": false,
    "sanitizer": null,
    "emoji": true,
    "math": true,
    "frontMatter": true,
    "superSubScript": false,
    "footnote": false,
    "isGitlabCompatibilityEnabled": false,
    "isHtmlEnabled": true
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn defaults_preserve_the_marked_contract() {
    let options = default_options();
    assert_eq!(options["gfm"], true);
    assert_eq!(options["frontMatter"], true);
    assert_eq!(options["isHtmlEnabled"], true);
    assert_eq!(options["baseUrl"], Value::Null);
    assert_eq!(options.as_object().unwrap().len(), 27);
  }
}

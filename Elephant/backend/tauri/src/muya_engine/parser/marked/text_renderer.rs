use serde_json::Value;

pub fn text(value: &str) -> String {
  value.to_string()
}

pub fn html(value: &str) -> String {
  value.to_string()
}

pub fn inline_math(value: &str) -> String {
  value.to_string()
}

pub fn emoji(_text: &str, emoji: &str) -> String {
  emoji.to_string()
}

pub fn script(content: &str, marker: &str) -> String {
  let tag_name = if marker == "^" { "sup" } else { "sub" };
  format!("<{tag_name}>{content}</{tag_name}>")
}

pub fn footnote_identifier(
  identifier: &str,
  footnote_id: &Value,
  footnote_identifier_id: &Value,
  order: &Value,
) -> String {
  let href = if js_truthy(footnote_id) {
    format!("fn{}", js_string(footnote_id))
  } else {
    String::new()
  };
  let label = if js_truthy(order) {
    js_string(order)
  } else {
    identifier.to_string()
  };
  format!(
    "<a href=\"#{href}\" class=\"footnote-ref\" id=\"fnref{}\" role=\"doc-noteref\"><sup>{label}</sup></a>",
    js_string(footnote_identifier_id)
  )
}

pub fn link_or_image_text(text: &Value) -> String {
  js_string(text)
}

pub fn line_break() -> String {
  String::new()
}

fn js_truthy(value: &Value) -> bool {
  match value {
    Value::Null => false,
    Value::Bool(value) => *value,
    Value::Number(value) => value.as_f64().is_some_and(|number| number != 0.0 && !number.is_nan()),
    Value::String(value) => !value.is_empty(),
    Value::Array(_) | Value::Object(_) => true,
  }
}

fn js_string(value: &Value) -> String {
  match value {
    Value::Null => "null".to_string(),
    Value::Bool(value) => value.to_string(),
    Value::Number(value) => value.to_string(),
    Value::String(value) => value.clone(),
    Value::Array(values) => values.iter().map(js_string).collect::<Vec<_>>().join(","),
    Value::Object(_) => "[object Object]".to_string(),
  }
}

#[cfg(test)]
mod tests {
  use serde_json::json;

  use super::*;

  #[test]
  fn preserves_identity_rendering() {
    assert_eq!(text("hello"), "hello");
    assert_eq!(html("<b>x</b>"), "<b>x</b>");
    assert_eq!(inline_math("x+1"), "x+1");
    assert_eq!(emoji(":smile:", "😄"), "😄");
  }

  #[test]
  fn renders_scripts_and_footnotes() {
    assert_eq!(script("x", "^"), "<sup>x</sup>");
    assert_eq!(script("y", "~"), "<sub>y</sub>");
    assert_eq!(
      footnote_identifier("a", &json!(2), &json!(3), &json!(1)),
      "<a href=\"#fn2\" class=\"footnote-ref\" id=\"fnref3\" role=\"doc-noteref\"><sup>1</sup></a>"
    );
    assert_eq!(
      footnote_identifier("label", &json!(0), &json!("x"), &json!(0)),
      "<a href=\"#\" class=\"footnote-ref\" id=\"fnrefx\" role=\"doc-noteref\"><sup>label</sup></a>"
    );
  }

  #[test]
  fn renders_link_and_image_text() {
    assert_eq!(link_or_image_text(&json!("text")), "text");
    assert_eq!(line_break(), "");
  }
}

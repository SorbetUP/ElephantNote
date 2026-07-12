use serde_json::Value;

use super::parser::marked::renderer_tables::{table, table_cell, table_row};
use super::parser::marked::text_renderer::{
  emoji, footnote_identifier, html, inline_math, line_break, link_or_image_text, script, text,
};

fn fixture() -> Value {
  serde_json::from_str(include_str!("fixtures/renderer_foundation.json"))
    .expect("the JavaScript renderer fixture must be valid JSON")
}

#[test]
fn table_renderer_matches_the_javascript_oracle() {
  let fixture = fixture();
  let renderer = &fixture["rendererTables"];

  for case in renderer["table"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    assert_eq!(
      table(case[0].as_str().unwrap(), case[1].as_str().unwrap()),
      case[2].as_str().unwrap()
    );
  }
  for case in renderer["row"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    assert_eq!(table_row(case[0].as_str().unwrap()), case[1].as_str().unwrap());
  }
  for case in renderer["cell"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    let flags = &case[1];
    assert_eq!(
      table_cell(
        case[0].as_str().unwrap(),
        flags["header"].as_bool().unwrap(),
        flags["align"].as_str(),
      ),
      case[2].as_str().unwrap()
    );
  }
}

#[test]
fn text_renderer_matches_the_javascript_oracle() {
  let fixture = fixture();
  let renderer = &fixture["textRenderer"];

  for case in renderer["identity"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    let input = case[0].as_str().unwrap();
    assert_eq!(text(input), case[1].as_str().unwrap());
    assert_eq!(text(input), case[2].as_str().unwrap());
    assert_eq!(text(input), case[3].as_str().unwrap());
    assert_eq!(text(input), case[4].as_str().unwrap());
    assert_eq!(text(input), case[5].as_str().unwrap());
    assert_eq!(html(input), case[6].as_str().unwrap());
    assert_eq!(inline_math(input), case[7].as_str().unwrap());
  }
  for case in renderer["emoji"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    assert_eq!(
      emoji(case[0].as_str().unwrap(), case[1].as_str().unwrap()),
      case[2].as_str().unwrap()
    );
  }
  for case in renderer["script"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    assert_eq!(
      script(case[0].as_str().unwrap(), case[1].as_str().unwrap()),
      case[2].as_str().unwrap()
    );
  }
  for case in renderer["footnote"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    let meta = &case[1];
    assert_eq!(
      footnote_identifier(
        case[0].as_str().unwrap(),
        &meta["footnoteId"],
        &meta["footnoteIdentifierId"],
        &meta["order"],
      ),
      case[2].as_str().unwrap()
    );
  }
  for case in renderer["linkImage"].as_array().unwrap() {
    let case = case.as_array().unwrap();
    assert_eq!(link_or_image_text(&case[2]), case[3].as_str().unwrap());
    assert_eq!(link_or_image_text(&case[2]), case[4].as_str().unwrap());
  }
  assert_eq!(line_break(), renderer["br"].as_str().unwrap());
}

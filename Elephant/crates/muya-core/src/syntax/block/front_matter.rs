use crate::model::FrontMatterStyle;

pub fn parse_opening(source: &str) -> Option<FrontMatterStyle> {
  match source.trim() {
    "---" => Some(FrontMatterStyle::Yaml),
    "+++" => Some(FrontMatterStyle::Toml),
    ";;;" => Some(FrontMatterStyle::Semicolon),
    "{" => Some(FrontMatterStyle::Json),
    _ => None,
  }
}

pub fn is_closing(source: &str, style: FrontMatterStyle) -> bool {
  source.trim() == style.delimiters().1
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn recognizes_supported_opening_and_closing_delimiters() {
    for (opening, style) in [
      ("---", FrontMatterStyle::Yaml),
      ("+++", FrontMatterStyle::Toml),
      (";;;", FrontMatterStyle::Semicolon),
      ("{", FrontMatterStyle::Json),
    ] {
      assert_eq!(parse_opening(opening), Some(style));
      assert!(is_closing(style.delimiters().1, style));
    }
    assert_eq!(parse_opening("***"), None);
  }
}

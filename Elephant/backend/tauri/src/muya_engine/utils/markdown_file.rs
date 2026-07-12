const MARKDOWN_EXTENSIONS: &[&str] = &[
  "markdown", "mdown", "mkdn", "md", "mkd", "mdwn", "mdtxt", "mdtext", "mdx", "text", "txt",
];

pub fn has_markdown_extension(filename: Option<&str>) -> bool {
  let Some(filename) = filename.filter(|value| !value.is_empty()) else {
    return false;
  };
  let lowercase = filename.to_lowercase();
  MARKDOWN_EXTENSIONS
    .iter()
    .any(|extension| lowercase.ends_with(&format!(".{extension}")))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn detects_the_marktext_extension_set_case_insensitively() {
    for extension in MARKDOWN_EXTENSIONS {
      assert!(has_markdown_extension(Some(&format!("note.{extension}"))));
    }
    assert!(has_markdown_extension(Some("README.MD")));
    assert!(!has_markdown_extension(Some("note.pdf")));
    assert!(!has_markdown_extension(Some("md")));
    assert!(!has_markdown_extension(None));
  }
}

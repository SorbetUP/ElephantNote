use std::path::{Path, PathBuf};

pub fn clean_relative_path(path: &str) -> String {
  path.replace('\\', "/")
    .split('/')
    .filter(|part| !part.is_empty() && *part != ".")
    .collect::<Vec<_>>()
    .join("/")
}

pub fn join_path(root: impl AsRef<Path>, relative_path: &str) -> PathBuf {
  let cleaned = clean_relative_path(relative_path);
  if cleaned.is_empty() {
    root.as_ref().to_path_buf()
  } else {
    root.as_ref().join(cleaned)
  }
}

pub fn with_markdown_extension(name: &str) -> String {
  let trimmed = name.trim();
  if trimmed.to_lowercase().ends_with(".md") {
    trimmed.to_string()
  } else {
    format!("{trimmed}.md")
  }
}

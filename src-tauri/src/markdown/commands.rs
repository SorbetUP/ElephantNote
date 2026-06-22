use serde_json::{json, Value};

use super::{parse_markdown_document, render_html, render_plain_text};
use super::parser_v3::{extract_images, extract_links, parse_blocks, split_frontmatter};

#[tauri::command]
pub fn tauri_markdown_parse(markdown: String) -> Value {
  json!(parse_markdown_document(&markdown))
}

#[tauri::command]
pub fn tauri_markdown_render_html(markdown: String) -> Value {
  json!({ "html": render_html(&markdown) })
}

#[tauri::command]
pub fn tauri_markdown_to_text(markdown: String) -> Value {
  let blocks = parse_blocks(&markdown);
  json!({ "text": render_plain_text(&blocks) })
}

#[tauri::command]
pub fn tauri_markdown_extract_frontmatter(markdown: String) -> Value {
  let (frontmatter, body) = split_frontmatter(&markdown);
  json!({ "frontmatter": frontmatter, "body": body })
}

#[tauri::command]
pub fn tauri_markdown_extract_links(markdown: String) -> Value {
  json!({ "links": extract_links(&markdown), "images": extract_images(&markdown) })
}

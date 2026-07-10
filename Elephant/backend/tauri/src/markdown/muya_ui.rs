use serde_json::{json, Value};

use super::muya_compat::render_muya_html;
use super::muya_engine::{utf16_to_byte_index, MuyaEditorState};

pub fn clipboard_payload(state: &MuyaEditorState) -> Value {
  let start_utf16 = state.selection.anchor.min(state.selection.focus);
  let end_utf16 = state.selection.anchor.max(state.selection.focus);
  let start = utf16_to_byte_index(&state.markdown, start_utf16);
  let end = utf16_to_byte_index(&state.markdown, end_utf16);
  let markdown = if start == end { String::new() } else { state.markdown[start..end].to_string() };
  let html = if markdown.is_empty() { String::new() } else { render_muya_html(&markdown) };
  json!({ "markdown": markdown, "html": html })
}

pub fn image_toolbar_state(markdown: &str, cursor_utf16: usize) -> Value {
  let cursor = utf16_to_byte_index(markdown, cursor_utf16);
  let Some(image) = image_at_cursor(markdown, cursor) else {
    return json!({ "visible": false });
  };
  json!({
    "visible": true,
    "start": image.start,
    "end": image.end,
    "alt": image.alt,
    "url": image.url,
    "width": image.width,
    "actions": ["resize", "replace", "caption", "copy", "delete"],
    "sizes": ["25%", "50%", "75%", "100%"]
  })
}

pub fn footnote_popup_state(markdown: &str, cursor_utf16: usize) -> Value {
  let cursor = utf16_to_byte_index(markdown, cursor_utf16);
  let before = &markdown[..cursor];
  let Some(open) = before.rfind("[^") else { return json!({ "visible": false }); };
  let reference = &before[open..];
  if !reference.ends_with(']') || reference.len() < 4 {
    return json!({ "visible": false });
  }
  let label = &reference[2..reference.len() - 1];
  if label.is_empty() || label.contains(']') {
    return json!({ "visible": false });
  }
  let prefix = format!("[^{label}]:");
  let text = markdown
    .lines()
    .find_map(|line| line.strip_prefix(&prefix).map(str::trim))
    .unwrap_or("");
  json!({
    "visible": true,
    "label": label,
    "text": text,
    "actions": ["edit", "jump", "delete"]
  })
}

pub fn slash_commands(query: &str) -> Value {
  let normalized = query.trim_start_matches('/').to_lowercase();
  let commands = [
    ("heading", "Heading", "# "),
    ("task-list", "Task list", "- [ ] "),
    ("table", "Table", "| A | B |\n| - | - |\n|   |   |"),
    ("image", "Image", "![alt](url)"),
    ("math", "Math block", "$$\n\n$$"),
    ("mermaid", "Mermaid diagram", "```mermaid\ngraph TD;\n```"),
    ("footnote", "Footnote", "[^note]\n\n[^note]: "),
    ("code", "Code block", "```\n\n```"),
  ];
  Value::Array(commands.into_iter().filter_map(|(id, label, markdown)| {
    let matches = normalized.is_empty()
      || id.contains(&normalized)
      || label.to_lowercase().contains(&normalized);
    matches.then(|| json!({ "id": id, "label": label, "markdown": markdown }))
  }).collect())
}

pub fn preview_descriptor(block_type: &str, language: Option<&str>, text: &str) -> Value {
  if block_type == "math_block" {
    return json!({ "type": "katex", "source": text });
  }
  if block_type == "code_fence" {
    let language = language.unwrap_or("");
    if matches!(language, "mermaid" | "flowchart" | "sequence" | "vega" | "vega-lite" | "plantuml") {
      return json!({ "type": "diagram", "language": language, "source": text });
    }
  }
  json!({ "type": "none" })
}

struct ImageMatch<'a> {
  start: usize,
  end: usize,
  alt: &'a str,
  url: &'a str,
  width: Option<&'a str>,
}

fn image_at_cursor(markdown: &str, cursor: usize) -> Option<ImageMatch<'_>> {
  for (start, _) in markdown.match_indices("![") {
    let alt_start = start + 2;
    let Some(alt_end_relative) = markdown[alt_start..].find(']') else { continue; };
    let alt_end = alt_start + alt_end_relative;
    if markdown.as_bytes().get(alt_end + 1) != Some(&b'(') { continue; }
    let url_start = alt_end + 2;
    let Some(url_end_relative) = markdown[url_start..].find(')') else { continue; };
    let url_end = url_start + url_end_relative;
    let mut end = url_end + 1;
    let mut width = None;
    if markdown[end..].starts_with("{width=") {
      let width_start = end + "{width=".len();
      if let Some(width_end_relative) = markdown[width_start..].find('}') {
        let width_end = width_start + width_end_relative;
        width = Some(&markdown[width_start..width_end]);
        end = width_end + 1;
      }
    }
    if cursor >= start && cursor <= end {
      return Some(ImageMatch {
        start,
        end,
        alt: &markdown[alt_start..alt_end],
        url: &markdown[url_start..url_end],
        width,
      });
    }
  }
  None
}

#[cfg(test)]
mod tests {
  use super::*;
  use super::super::muya_engine::MuyaSelection;

  #[test]
  fn copies_selected_markdown_and_rendered_html() {
    let mut state = MuyaEditorState::new("A **bold** B".to_string());
    state.selection = MuyaSelection { anchor: 2, focus: 10 };
    let payload = clipboard_payload(&state);
    assert_eq!(payload["markdown"], "**bold**");
    assert!(payload["html"].as_str().unwrap().contains("strong"));
  }

  #[test]
  fn exposes_image_toolbar_with_existing_width() {
    let toolbar = image_toolbar_state("x ![Alt](a.png){width=50%} y", 8);
    assert_eq!(toolbar["visible"], true);
    assert_eq!(toolbar["width"], "50%");
    assert_eq!(toolbar["actions"][0], "resize");
  }

  #[test]
  fn resolves_footnote_reference_and_definition() {
    let markdown = "A[^n]\n\n[^n]: note";
    let popup = footnote_popup_state(markdown, 5);
    assert_eq!(popup["visible"], true);
    assert_eq!(popup["label"], "n");
    assert_eq!(popup["text"], "note");
  }

  #[test]
  fn filters_slash_commands() {
    let commands = slash_commands("/mer");
    assert_eq!(commands.as_array().unwrap().len(), 1);
    assert_eq!(commands[0]["id"], "mermaid");
  }

  #[test]
  fn creates_preview_descriptors_without_rendering_untrusted_code() {
    assert_eq!(preview_descriptor("math_block", None, "x")["type"], "katex");
    assert_eq!(preview_descriptor("code_fence", Some("mermaid"), "graph TD")["type"], "diagram");
    assert_eq!(preview_descriptor("paragraph", None, "x")["type"], "none");
  }
}

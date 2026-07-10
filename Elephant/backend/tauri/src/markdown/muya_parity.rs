use serde::{Deserialize, Serialize};

use super::muya_engine::{
  apply_command, utf16_len, utf16_to_byte_index, MuyaEditorCommand, MuyaEditorState,
  MuyaEditorTransaction,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MuyaTextOperation {
  pub r#type: String,
  pub pos: usize,
  #[serde(default)]
  pub count: usize,
  #[serde(default)]
  pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum MuyaParityCommand {
  ApplyOperation { operation: MuyaTextOperation },
  KeyboardRule { key: String, #[serde(default)] shift_key: bool },
  TableCommand { action: String, #[serde(default)] index: usize },
  ResizeImage { cursor: usize, width: String },
  UpsertFootnote { label: String, text: String },
  InsertTemplate { id: String },
}

pub fn apply_parity_command(
  state: MuyaEditorState,
  command: MuyaParityCommand,
) -> Result<MuyaEditorTransaction, String> {
  match command {
    MuyaParityCommand::ApplyOperation { operation } => apply_text_operation(state, operation),
    MuyaParityCommand::KeyboardRule { key, shift_key } => {
      let next = apply_keyboard_rule(&state.markdown, &key, shift_key);
      replace_document_if_changed(state, next)
    }
    MuyaParityCommand::TableCommand { action, index } => {
      let next = apply_table_command(&state.markdown, &action, index)?;
      replace_document_if_changed(state, next)
    }
    MuyaParityCommand::ResizeImage { cursor, width } => {
      let next = resize_image(&state.markdown, cursor, &width)?;
      replace_document_if_changed(state, next)
    }
    MuyaParityCommand::UpsertFootnote { label, text } => {
      let next = upsert_footnote(&state.markdown, &label, &text)?;
      replace_document_if_changed(state, next)
    }
    MuyaParityCommand::InsertTemplate { id } => {
      let template = slash_template(&id).ok_or_else(|| format!("unsupported Muya template: {id}"))?;
      apply_command(state, MuyaEditorCommand::InsertText { text: template.to_string() })
    }
  }
}

fn apply_text_operation(
  mut state: MuyaEditorState,
  operation: MuyaTextOperation,
) -> Result<MuyaEditorTransaction, String> {
  let maximum = utf16_len(&state.markdown);
  let start = operation.pos.min(maximum);
  let end = start.saturating_add(operation.count).min(maximum);
  let operation_type = operation.r#type.clone();
  let replacement = match operation_type.as_str() {
    "insert" => operation.text,
    "delete" => String::new(),
    "replace" => operation.text,
    other => return Err(format!("unsupported Muya text operation: {other}")),
  };
  let selection_end = if operation_type == "insert" { start } else { end };
  state = apply_command(
    state,
    MuyaEditorCommand::SetSelection { anchor: start, focus: selection_end },
  )?.state;
  apply_command(state, MuyaEditorCommand::ReplaceSelection { text: replacement })
}

fn replace_document_if_changed(
  mut state: MuyaEditorState,
  next: String,
) -> Result<MuyaEditorTransaction, String> {
  if state.markdown == next {
    let selection = state.selection;
    return apply_command(
      state,
      MuyaEditorCommand::SetSelection { anchor: selection.anchor, focus: selection.focus },
    );
  }
  let end = utf16_len(&state.markdown);
  state = apply_command(
    state,
    MuyaEditorCommand::SetSelection { anchor: 0, focus: end },
  )?.state;
  apply_command(state, MuyaEditorCommand::ReplaceSelection { text: next })
}

pub fn apply_keyboard_rule(markdown: &str, key: &str, shift_key: bool) -> String {
  let mut lines = markdown.split('\n').map(str::to_string).collect::<Vec<_>>();
  let Some(current) = lines.last_mut() else { return markdown.to_string(); };

  if key == "Tab" {
    if shift_key {
      if current.starts_with("  ") {
        current.drain(..2);
      }
    } else {
      current.insert_str(0, "  ");
    }
    return lines.join("\n");
  }

  if key != "Enter" {
    return markdown.to_string();
  }

  let continuation = list_continuation(current);
  if let Some(next) = continuation {
    lines.push(next);
    lines.join("\n")
  } else {
    markdown.to_string()
  }
}

fn list_continuation(line: &str) -> Option<String> {
  let indentation_end = line
    .char_indices()
    .find(|(_, character)| !matches!(character, ' ' | '\t'))
    .map_or(line.len(), |(index, _)| index);
  let (indentation, content) = line.split_at(indentation_end);

  for prefix in ["- [ ] ", "- [x] ", "- [X] "] {
    if content.starts_with(prefix) {
      return Some(format!("{indentation}- [ ] "));
    }
  }
  if content.starts_with("- ") {
    return Some(format!("{indentation}- "));
  }
  if let Some((number, _)) = content.split_once(". ") {
    if let Ok(number) = number.parse::<u64>() {
      return Some(format!("{indentation}{}. ", number.saturating_add(1)));
    }
  }
  None
}

pub fn apply_table_command(markdown: &str, action: &str, index: usize) -> Result<String, String> {
  let trailing_newline = markdown.ends_with('\n');
  let mut lines = markdown.lines().map(str::to_string).collect::<Vec<_>>();
  let Some((start, end)) = find_first_table(&lines) else { return Ok(markdown.to_string()); };
  let column_count = split_table_row(&lines[start]).len();

  match action {
    "insert_row" => {
      let insert_at = (start + 2 + index).min(end + 1);
      lines.insert(insert_at, format_table_row(&vec![String::new(); column_count]));
    }
    "delete_row" => {
      let row = start + 2 + index;
      if row <= end && row < lines.len() {
        lines.remove(row);
      }
    }
    "insert_column" => {
      for (offset, line) in lines.iter_mut().enumerate().take(end + 1).skip(start) {
        let mut cells = split_table_row(line);
        let at = index.min(cells.len());
        let value = if offset == start + 1 { "---" } else { "" };
        cells.insert(at, value.to_string());
        *line = format_table_row(&cells);
      }
    }
    "delete_column" => {
      if column_count <= 1 {
        return Ok(markdown.to_string());
      }
      for line in lines.iter_mut().take(end + 1).skip(start) {
        let mut cells = split_table_row(line);
        if index < cells.len() {
          cells.remove(index);
        }
        *line = format_table_row(&cells);
      }
    }
    "align_left" | "align_center" | "align_right" => {
      let separator = start + 1;
      let mut cells = split_table_row(&lines[separator]);
      if index < cells.len() {
        cells[index] = match action {
          "align_left" => ":---",
          "align_center" => ":---:",
          "align_right" => "---:",
          _ => unreachable!(),
        }.to_string();
        lines[separator] = format_table_row(&cells);
      }
    }
    other => return Err(format!("unsupported Muya table command: {other}")),
  }

  let mut result = lines.join("\n");
  if trailing_newline { result.push('\n'); }
  Ok(result)
}

fn find_first_table(lines: &[String]) -> Option<(usize, usize)> {
  for index in 0..lines.len().saturating_sub(1) {
    if is_table_row(&lines[index]) && is_table_separator(&lines[index + 1]) {
      let mut end = index + 1;
      while end + 1 < lines.len() && is_table_row(&lines[end + 1]) {
        end += 1;
      }
      return Some((index, end));
    }
  }
  None
}

fn is_table_row(line: &str) -> bool {
  let line = line.trim();
  line.starts_with('|') && line.ends_with('|') && line.matches('|').count() >= 2
}

fn is_table_separator(line: &str) -> bool {
  is_table_row(line) && line.chars().all(|ch| matches!(ch, '|' | '-' | ':' | ' '))
}

fn split_table_row(line: &str) -> Vec<String> {
  line.trim().trim_matches('|').split('|').map(|cell| cell.trim().to_string()).collect()
}

fn format_table_row(cells: &[String]) -> String {
  format!("| {} |", cells.join(" | "))
}

pub fn resize_image(markdown: &str, cursor_utf16: usize, width: &str) -> Result<String, String> {
  if width.is_empty() || width.chars().any(|character| matches!(character, '\n' | '\r' | '}')) {
    return Err("invalid Muya image width".to_string());
  }
  let cursor = utf16_to_byte_index(markdown, cursor_utf16);
  let Some(image) = image_at_cursor(markdown, cursor) else { return Ok(markdown.to_string()); };
  let replacement = format!("![{}]({}){{width={width}}}", image.alt, image.url);
  Ok(format!("{}{}{}", &markdown[..image.start], replacement, &markdown[image.end..]))
}

struct ImageMatch<'a> {
  start: usize,
  end: usize,
  alt: &'a str,
  url: &'a str,
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
    if markdown[end..].starts_with("{width=") {
      if let Some(relative) = markdown[end..].find('}') {
        end += relative + 1;
      }
    }
    if cursor >= start && cursor <= end {
      return Some(ImageMatch {
        start,
        end,
        alt: &markdown[alt_start..alt_end],
        url: &markdown[url_start..url_end],
      });
    }
  }
  None
}

pub fn upsert_footnote(markdown: &str, label: &str, text: &str) -> Result<String, String> {
  if label.is_empty() || label.chars().any(|character| matches!(character, ']' | '\n' | '\r')) {
    return Err("invalid Muya footnote label".to_string());
  }
  let prefix = format!("[^{label}]:");
  let mut found = false;
  let mut lines = markdown.lines().map(|line| {
    if line.starts_with(&prefix) {
      found = true;
      format!("{prefix} {text}")
    } else {
      line.to_string()
    }
  }).collect::<Vec<_>>();
  if found {
    let mut result = lines.join("\n");
    if markdown.ends_with('\n') { result.push('\n'); }
    return Ok(result);
  }
  while lines.last().is_some_and(|line| line.is_empty()) {
    lines.pop();
  }
  let mut result = lines.join("\n");
  if !result.is_empty() { result.push_str("\n\n"); }
  result.push_str(&format!("{prefix} {text}\n"));
  Ok(result)
}

pub fn slash_template(id: &str) -> Option<&'static str> {
  match id {
    "heading" => Some("# "),
    "task-list" => Some("- [ ] "),
    "table" => Some("| A | B |\n| - | - |\n|   |   |"),
    "image" => Some("![alt](url)"),
    "math" => Some("$$\n\n$$"),
    "mermaid" => Some("```mermaid\ngraph TD;\n```"),
    "footnote" => Some("[^note]\n\n[^note]: "),
    "code" => Some("```\n\n```"),
    _ => None,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use super::super::muya_engine::MuyaSelection;

  #[test]
  fn matches_javascript_text_operations_with_utf16_offsets() {
    let state = MuyaEditorState::new("A😀B".to_string());
    let transaction = apply_parity_command(state, MuyaParityCommand::ApplyOperation {
      operation: MuyaTextOperation { r#type: "replace".to_string(), pos: 1, count: 2, text: "é".to_string() },
    }).unwrap();
    assert_eq!(transaction.state.markdown, "AéB");
  }

  #[test]
  fn continues_task_bullet_and_ordered_lists() {
    assert_eq!(apply_keyboard_rule("- [x] done", "Enter", false), "- [x] done\n- [ ] ");
    assert_eq!(apply_keyboard_rule("  - item", "Enter", false), "  - item\n  - ");
    assert_eq!(apply_keyboard_rule("9. item", "Enter", false), "9. item\n10. ");
  }

  #[test]
  fn indents_and_outdents_the_last_line() {
    assert_eq!(apply_keyboard_rule("a\nb", "Tab", false), "a\n  b");
    assert_eq!(apply_keyboard_rule("a\n  b", "Tab", true), "a\nb");
  }

  #[test]
  fn supports_complete_table_command_matrix() {
    let table = "| A | B |\n| - | - |\n| 1 | 2 |";
    assert_eq!(apply_table_command(table, "insert_row", 1).unwrap().lines().count(), 4);
    assert_eq!(apply_table_command(table, "delete_row", 0).unwrap().lines().count(), 2);
    assert!(apply_table_command(table, "insert_column", 1).unwrap().contains("A |  | B"));
    assert!(apply_table_command(table, "delete_column", 0).unwrap().contains("| B |"));
    assert!(apply_table_command(table, "align_center", 1).unwrap().contains(":---:"));
  }

  #[test]
  fn resizes_images_and_replaces_existing_width() {
    let markdown = "before ![Alt](pic.png){width=25%} after";
    let result = resize_image(markdown, 12, "75%").unwrap();
    assert_eq!(result, "before ![Alt](pic.png){width=75%} after");
  }

  #[test]
  fn skips_malformed_images_and_finds_the_valid_one() {
    let markdown = "![broken then ![Alt](pic.png)";
    let result = resize_image(markdown, 24, "50%").unwrap();
    assert!(result.ends_with("![Alt](pic.png){width=50%}"));
  }

  #[test]
  fn inserts_and_updates_footnotes() {
    let inserted = upsert_footnote("Body", "note", "First").unwrap();
    assert_eq!(inserted, "Body\n\n[^note]: First\n");
    let updated = upsert_footnote(&inserted, "note", "Second").unwrap();
    assert_eq!(updated, "Body\n\n[^note]: Second\n");
  }

  #[test]
  fn inserts_templates_at_the_current_selection() {
    let mut state = MuyaEditorState::new("Body".to_string());
    state.selection = MuyaSelection::collapsed(0);
    let transaction = apply_parity_command(state, MuyaParityCommand::InsertTemplate { id: "heading".to_string() }).unwrap();
    assert_eq!(transaction.state.markdown, "# Body");
  }

  #[test]
  fn rejects_unknown_mutations_instead_of_silently_ignoring_them() {
    assert!(apply_table_command("| A |\n| - |", "explode", 0).is_err());
    assert!(upsert_footnote("Body", "bad]label", "x").is_err());
    assert!(resize_image("![](a)", 1, "bad}").is_err());
  }
}

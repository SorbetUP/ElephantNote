use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MuyaExtra {
  pub kind: String,
  pub text: String,
  pub attrs: Value,
  pub line: usize,
}

pub fn collect_muya_extras(markdown: &str) -> Vec<MuyaExtra> {
  let mut extras = Vec::new();
  extras.extend(collect_block_math(markdown));
  extras.extend(collect_inline_math(markdown));
  extras.extend(collect_diagrams(markdown));
  extras.sort_by_key(|extra| extra.line);
  extras
}

pub fn render_muya_extras_html(markdown: &str) -> String {
  let mut out = String::new();
  let lines = markdown.lines().collect::<Vec<_>>();
  let mut i = 0;

  while i < lines.len() {
    let line = lines[i];
    let trimmed = line.trim();

    if trimmed == "$$" {
      let start_line = i + 1;
      let mut body = Vec::new();
      i += 1;
      while i < lines.len() && lines[i].trim() != "$$" {
        body.push(lines[i]);
        i += 1;
      }
      if i < lines.len() && lines[i].trim() == "$$" {
        out.push_str(&format!(
          "<div class=\"math-block\" data-muya-type=\"math-block\" data-line=\"{}\">{}</div>\n",
          start_line,
          escape_html(&body.join("\n"))
        ));
        i += 1;
        continue;
      }
      out.push_str(line);
      out.push('\n');
      continue;
    }

    if let Some(language) = fenced_language(trimmed) {
      if is_diagram_language(language) {
        let start_line = i + 1;
        let mut body = Vec::new();
        i += 1;
        while i < lines.len() && !lines[i].trim().starts_with("```") {
          body.push(lines[i]);
          i += 1;
        }
        if i < lines.len() {
          out.push_str(&format!(
            "<div class=\"diagram-block diagram-{}\" data-muya-type=\"diagram\" data-language=\"{}\" data-line=\"{}\"><pre><code>{}</code></pre></div>\n",
            escape_attr(language),
            escape_attr(language),
            start_line,
            escape_html(&body.join("\n"))
          ));
          i += 1;
          continue;
        }
      }
    }

    out.push_str(&render_inline_math_line(line));
    out.push('\n');
    i += 1;
  }

  out
}

pub fn collect_block_math(markdown: &str) -> Vec<MuyaExtra> {
  let lines = markdown.lines().collect::<Vec<_>>();
  let mut extras = Vec::new();
  let mut i = 0;

  while i < lines.len() {
    if lines[i].trim() == "$$" {
      let start_line = i + 1;
      let mut body = Vec::new();
      i += 1;
      while i < lines.len() && lines[i].trim() != "$$" {
        body.push(lines[i]);
        i += 1;
      }
      if i < lines.len() && lines[i].trim() == "$$" {
        extras.push(MuyaExtra {
          kind: "math_block".to_string(),
          text: body.join("\n"),
          attrs: json!({ "display": true }),
          line: start_line,
        });
      }
    }
    i += 1;
  }

  extras
}

pub fn collect_inline_math(markdown: &str) -> Vec<MuyaExtra> {
  let mut extras = Vec::new();
  for (line_index, line) in markdown.lines().enumerate() {
    let mut chars = line.char_indices().peekable();
    let mut in_math = false;
    let mut start = 0usize;

    while let Some((index, ch)) = chars.next() {
      if ch != '$' || is_escaped(line, index) {
        continue;
      }
      if line[index..].starts_with("$$") {
        continue;
      }
      if !in_math {
        in_math = true;
        start = index + 1;
      } else {
        if start <= index {
          let text = line[start..index].trim();
          if !text.is_empty() {
            extras.push(MuyaExtra {
              kind: "inline_math".to_string(),
              text: text.to_string(),
              attrs: json!({ "display": false }),
              line: line_index + 1,
            });
          }
        }
        in_math = false;
      }
    }
  }
  extras
}

pub fn collect_diagrams(markdown: &str) -> Vec<MuyaExtra> {
  let lines = markdown.lines().collect::<Vec<_>>();
  let mut extras = Vec::new();
  let mut i = 0;

  while i < lines.len() {
    let trimmed = lines[i].trim();
    if let Some(language) = fenced_language(trimmed) {
      if is_diagram_language(language) {
        let start_line = i + 1;
        let mut body = Vec::new();
        i += 1;
        while i < lines.len() && !lines[i].trim().starts_with("```") {
          body.push(lines[i]);
          i += 1;
        }
        extras.push(MuyaExtra {
          kind: "diagram".to_string(),
          text: body.join("\n"),
          attrs: json!({ "language": language }),
          line: start_line,
        });
      }
    }
    i += 1;
  }

  extras
}

pub fn is_diagram_language(language: &str) -> bool {
  matches!(language.to_ascii_lowercase().as_str(), "mermaid" | "flowchart" | "sequence" | "sequencechart" | "vega" | "vega-lite" | "vegalite" | "plantuml")
}

fn fenced_language(line: &str) -> Option<&str> {
  let rest = line.strip_prefix("```")?.trim();
  if rest.is_empty() { None } else { rest.split_whitespace().next() }
}

fn render_inline_math_line(line: &str) -> String {
  let mut out = String::new();
  let mut last = 0usize;
  let mut start: Option<usize> = None;

  for (index, ch) in line.char_indices() {
    if ch != '$' || is_escaped(line, index) || line[index..].starts_with("$$") {
      continue;
    }

    if let Some(math_start) = start.take() {
      let text = line[math_start..index].trim();
      if !text.is_empty() {
        out.push_str(&escape_html(&line[last..math_start - 1]));
        out.push_str("<span class=\"math-inline\" data-muya-type=\"math-inline\">");
        out.push_str(&escape_html(text));
        out.push_str("</span>");
        last = index + 1;
      }
    } else {
      start = Some(index + 1);
    }
  }

  out.push_str(&escape_html(&line[last..]));
  out
}

fn is_escaped(line: &str, index: usize) -> bool {
  if index == 0 { return false; }
  let prefix = &line[..index];
  let backslashes = prefix.chars().rev().take_while(|ch| *ch == '\\').count();
  backslashes % 2 == 1
}

pub fn escape_html(input: &str) -> String {
  input
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
}

fn escape_attr(input: &str) -> String {
  input
    .chars()
    .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '-' })
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn collects_inline_and_block_math() {
    let extras = collect_muya_extras("Euler $e^{i\\pi}+1=0$\n\n$$\na^2+b^2=c^2\n$$");
    assert!(extras.iter().any(|extra| extra.kind == "inline_math" && extra.text.contains("e^{i")));
    assert!(extras.iter().any(|extra| extra.kind == "math_block" && extra.text.contains("a^2")));
  }

  #[test]
  fn collects_diagram_fences() {
    let extras = collect_muya_extras("```mermaid\ngraph TD; A-->B;\n```");
    assert_eq!(extras[0].kind, "diagram");
    assert_eq!(extras[0].attrs["language"], "mermaid");
  }

  #[test]
  fn renders_math_and_diagram_placeholders() {
    let html = render_muya_extras_html("Text $x+1$\n\n$$\ny=x\n$$\n\n```mermaid\ngraph TD;\n```");
    assert!(html.contains("math-inline"));
    assert!(html.contains("math-block"));
    assert!(html.contains("diagram-block"));
    assert!(html.contains("data-language=\"mermaid\""));
  }

  #[test]
  fn ignores_escaped_inline_math_marker() {
    let extras = collect_inline_math("Price is \\$5 and math $x$.");
    assert_eq!(extras.len(), 1);
    assert_eq!(extras[0].text, "x");
  }
}

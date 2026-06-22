use super::types::MarkdownBlock;

pub fn escape_html(input: &str) -> String {
  input
    .replace('&', "&amp;")
    .replace('<', "&lt;")
    .replace('>', "&gt;")
    .replace('"', "&quot;")
}

pub fn slugify(input: &str) -> String {
  let mut out = String::new();
  let mut dash = false;
  for ch in input.trim().to_lowercase().chars() {
    if ch.is_ascii_alphanumeric() {
      out.push(ch);
      dash = false;
    } else if !dash {
      out.push('-');
      dash = true;
    }
  }
  let out = out.trim_matches('-').to_string();
  if out.is_empty() { "section".to_string() } else { out }
}

pub fn strip_inline_markdown(input: &str) -> String {
  input
    .replace("**", "")
    .replace("__", "")
    .replace('`', "")
    .replace('*', "")
    .replace('_', "")
}

pub fn render_inline(input: &str) -> String {
  let escaped = escape_html(input);
  let mut out = String::new();
  let mut chars = escaped.chars().peekable();
  while let Some(ch) = chars.next() {
    if ch == '`' {
      let mut code = String::new();
      for next in chars.by_ref() {
        if next == '`' { break; }
        code.push(next);
      }
      out.push_str("<code>");
      out.push_str(&code);
      out.push_str("</code>");
    } else {
      out.push(ch);
    }
  }
  out
}

pub fn render_html(blocks: &[MarkdownBlock]) -> String {
  let mut html = String::new();
  let mut in_ul = false;
  let mut in_ol = false;

  for block in blocks {
    match block.kind.as_str() {
      "heading" => {
        close_lists(&mut html, &mut in_ul, &mut in_ol);
        let level = block.level.unwrap_or(1).clamp(1, 6);
        let title = render_inline(&block.text);
        let slug = slugify(&block.text);
        html.push_str(&format!("<h{level} id=\"{slug}\">{title}</h{level}>\n"));
      }
      "paragraph" => {
        close_lists(&mut html, &mut in_ul, &mut in_ol);
        html.push_str("<p>");
        html.push_str(&render_inline(&block.text));
        html.push_str("</p>\n");
      }
      "blockquote" => {
        close_lists(&mut html, &mut in_ul, &mut in_ol);
        html.push_str("<blockquote>");
        html.push_str(&render_inline(&block.text));
        html.push_str("</blockquote>\n");
      }
      "code" => {
        close_lists(&mut html, &mut in_ul, &mut in_ol);
        let language = block.language.clone().unwrap_or_default();
        if language.is_empty() {
          html.push_str("<pre><code>");
        } else {
          html.push_str(&format!("<pre><code class=\"language-{}\">", escape_html(&language)));
        }
        html.push_str(&escape_html(&block.text));
        html.push_str("</code></pre>\n");
      }
      "task" => {
        close_ordered_list(&mut html, &mut in_ol);
        if !in_ul {
          html.push_str("<ul class=\"task-list\">\n");
          in_ul = true;
        }
        let checked = if block.checked.unwrap_or(false) { " checked" } else { "" };
        html.push_str("<li class=\"task-list-item\"><input type=\"checkbox\" disabled");
        html.push_str(checked);
        html.push_str("> ");
        html.push_str(&render_inline(&block.text));
        html.push_str("</li>\n");
      }
      "ordered_list_item" => {
        close_unordered_list(&mut html, &mut in_ul);
        if !in_ol {
          html.push_str("<ol>\n");
          in_ol = true;
        }
        html.push_str("<li>");
        html.push_str(&render_inline(&block.text));
        html.push_str("</li>\n");
      }
      "list_item" => {
        close_ordered_list(&mut html, &mut in_ol);
        if !in_ul {
          html.push_str("<ul>\n");
          in_ul = true;
        }
        html.push_str("<li>");
        html.push_str(&render_inline(&block.text));
        html.push_str("</li>\n");
      }
      "hr" => {
        close_lists(&mut html, &mut in_ul, &mut in_ol);
        html.push_str("<hr>\n");
      }
      _ => {}
    }
  }

  close_lists(&mut html, &mut in_ul, &mut in_ol);
  html
}

pub fn render_plain_text(blocks: &[MarkdownBlock]) -> String {
  blocks
    .iter()
    .filter(|block| block.kind != "hr")
    .map(|block| strip_inline_markdown(&block.text))
    .filter(|text| !text.trim().is_empty())
    .collect::<Vec<_>>()
    .join("\n")
}

fn close_lists(html: &mut String, in_ul: &mut bool, in_ol: &mut bool) {
  close_unordered_list(html, in_ul);
  close_ordered_list(html, in_ol);
}

fn close_unordered_list(html: &mut String, in_ul: &mut bool) {
  if *in_ul {
    html.push_str("</ul>\n");
    *in_ul = false;
  }
}

fn close_ordered_list(html: &mut String, in_ol: &mut bool) {
  if *in_ol {
    html.push_str("</ol>\n");
    *in_ol = false;
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn escapes_html() {
    assert_eq!(escape_html("<script>"), "&lt;script&gt;");
  }

  #[test]
  fn slugifies_headings() {
    assert_eq!(slugify("Hello World!"), "hello-world");
  }

  #[test]
  fn renders_heading_and_paragraph() {
    let blocks = vec![
      MarkdownBlock::new("heading", "# Title", "Title", Some(1)),
      MarkdownBlock::new("paragraph", "Hello", "Hello", None),
    ];
    let html = render_html(&blocks);
    assert!(html.contains("<h1 id=\"title\">Title</h1>"));
    assert!(html.contains("<p>Hello</p>"));
  }
}

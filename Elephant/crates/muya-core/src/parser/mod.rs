use crate::model::{BlockKind, Document, InlineKind, NodeKind, SourceRange};
use crate::syntax::block::{blockquote, fenced_code, heading, paragraph, thematic_break};

struct FenceState {
  opening: fenced_code::FenceOpen,
  start: u32,
  lines: Vec<String>,
}

pub fn parse_markdown(markdown: &str) -> Document {
  let mut document = Document::new();
  let mut utf16_offset = 0u32;
  let mut paragraph_lines = Vec::<String>::new();
  let mut paragraph_start = 0u32;
  let mut fence: Option<FenceState> = None;

  for segment in markdown.split_inclusive('\n') {
    let line = segment.strip_suffix('\n').unwrap_or(segment).trim_end_matches('\r');
    let segment_len = segment.encode_utf16().count() as u32;
    let line_end = utf16_offset + line.encode_utf16().count() as u32;

    if fence.is_some() {
      let is_closing = fenced_code::is_closing(line, &fence.as_ref().unwrap().opening);
      if is_closing {
        let state = fence.take().unwrap();
        append_text_block(
          &mut document,
          BlockKind::CodeBlock {
            language: state.opening.info,
            fenced: true,
          },
          &state.lines.join("\n"),
          SourceRange::new(state.start, line_end),
        );
      } else {
        fence.as_mut().unwrap().lines.push(line.to_string());
      }
      utf16_offset += segment_len;
      continue;
    }

    if line.trim().is_empty() {
      flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
      utf16_offset += segment_len;
      continue;
    }

    if let Some(opening) = fenced_code::parse_opening(line) {
      flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
      fence = Some(FenceState { opening, start: utf16_offset, lines: Vec::new() });
    } else if let Some(parsed) = heading::parse_atx(line) {
      flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
      append_text_block(
        &mut document,
        BlockKind::Heading { level: parsed.level },
        parsed.text,
        SourceRange::new(utf16_offset, line_end),
      );
    } else if thematic_break::matches(line) {
      flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
      let block = document.allocate(
        NodeKind::Block(BlockKind::ThematicBreak),
        Some(SourceRange::new(utf16_offset, line_end)),
      );
      document.append_child(document.root, block);
    } else if let Some(text) = blockquote::strip_marker(line) {
      flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
      append_text_block(
        &mut document,
        BlockKind::BlockQuote,
        text,
        SourceRange::new(utf16_offset, line_end),
      );
    } else {
      if paragraph_lines.is_empty() {
        paragraph_start = utf16_offset;
      }
      paragraph_lines.push(line.to_string());
    }

    utf16_offset += segment_len;
  }

  if let Some(state) = fence.take() {
    append_text_block(
      &mut document,
      BlockKind::CodeBlock {
        language: state.opening.info,
        fenced: true,
      },
      &state.lines.join("\n"),
      SourceRange::new(state.start, utf16_offset),
    );
  }
  flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
  document
}

fn flush_paragraph(
  document: &mut Document,
  lines: &mut Vec<String>,
  start: u32,
  end: u32,
) {
  if lines.is_empty() {
    return;
  }
  let text = paragraph::join_lines(lines);
  append_text_block(document, BlockKind::Paragraph, &text, SourceRange::new(start, end));
  lines.clear();
}

fn append_text_block(document: &mut Document, kind: BlockKind, text: &str, range: SourceRange) {
  let block = document.allocate(NodeKind::Block(kind), Some(range));
  let text_node = document.allocate(
    NodeKind::Inline(InlineKind::Text { value: text.to_string() }),
    Some(range),
  );
  document.append_child(block, text_node);
  document.append_child(document.root, block);
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_heading_paragraph_and_rule() {
    let document = parse_markdown("# Title\n\nBody\n\n---\n");
    let blocks = document.children(document.root).collect::<Vec<_>>();
    assert_eq!(blocks.len(), 3);
    assert!(matches!(blocks[0].kind, NodeKind::Block(BlockKind::Heading { level: 1 })));
    assert!(matches!(blocks[1].kind, NodeKind::Block(BlockKind::Paragraph)));
    assert!(matches!(blocks[2].kind, NodeKind::Block(BlockKind::ThematicBreak)));
  }

  #[test]
  fn parses_blockquotes_and_fenced_code() {
    let document = parse_markdown("> Quote\n\n```rust\nfn main() {}\n```\n");
    let blocks = document.children(document.root).collect::<Vec<_>>();
    assert!(matches!(blocks[0].kind, NodeKind::Block(BlockKind::BlockQuote)));
    assert!(matches!(
      &blocks[1].kind,
      NodeKind::Block(BlockKind::CodeBlock { language: Some(language), fenced: true }) if language == "rust"
    ));
  }

  #[test]
  fn source_ranges_use_utf16_units() {
    let document = parse_markdown("# 😀\n");
    let heading = document.children(document.root).next().unwrap();
    assert_eq!(heading.source.unwrap().len(), 4);
  }
}

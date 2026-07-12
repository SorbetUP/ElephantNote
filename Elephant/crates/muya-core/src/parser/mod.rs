use crate::model::{BlockKind, Document, InlineKind, NodeKind, SourceRange};

pub fn parse_markdown(markdown: &str) -> Document {
  let mut document = Document::new();
  let mut utf16_offset = 0u32;
  let mut paragraph_lines = Vec::<String>::new();
  let mut paragraph_start = 0u32;

  for segment in markdown.split_inclusive('\n') {
    let line = segment.strip_suffix('\n').unwrap_or(segment).trim_end_matches('\r');
    let segment_len = segment.encode_utf16().count() as u32;

    if line.trim().is_empty() {
      flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
      utf16_offset += segment_len;
      continue;
    }

    if let Some((level, text)) = parse_atx_heading(line) {
      flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
      append_text_block(
        &mut document,
        BlockKind::Heading { level },
        text,
        SourceRange::new(utf16_offset, utf16_offset + line.encode_utf16().count() as u32),
      );
    } else if is_thematic_break(line) {
      flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
      let block = document.allocate(
        NodeKind::Block(BlockKind::ThematicBreak),
        Some(SourceRange::new(utf16_offset, utf16_offset + line.encode_utf16().count() as u32)),
      );
      document.append_child(document.root, block);
    } else {
      if paragraph_lines.is_empty() {
        paragraph_start = utf16_offset;
      }
      paragraph_lines.push(line.to_string());
    }

    utf16_offset += segment_len;
  }

  flush_paragraph(&mut document, &mut paragraph_lines, paragraph_start, utf16_offset);
  document
}

fn parse_atx_heading(line: &str) -> Option<(u8, &str)> {
  let hashes = line.chars().take_while(|character| *character == '#').count();
  if hashes == 0 || hashes > 6 {
    return None;
  }
  let text = line.get(hashes..)?.strip_prefix(' ')?;
  Some((hashes as u8, text.trim_end_matches('#').trim_end()))
}

fn is_thematic_break(line: &str) -> bool {
  let compact = line.chars().filter(|character| !character.is_whitespace()).collect::<String>();
  compact.len() >= 3
    && compact.chars().next().is_some_and(|marker| matches!(marker, '-' | '*' | '_'))
    && compact.chars().all(|character| Some(character) == compact.chars().next())
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
  let text = lines.join("\n");
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
  fn source_ranges_use_utf16_units() {
    let document = parse_markdown("# 😀\n");
    let heading = document.children(document.root).next().unwrap();
    assert_eq!(heading.source.unwrap().len(), 4);
  }
}

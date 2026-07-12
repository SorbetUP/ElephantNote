use crate::model::{
  Alignment, BlockKind, Document, InlineKind, ListKind, NodeId, NodeKind, SourceRange,
};
use crate::syntax::block::{blockquote, fenced_code, heading, list, paragraph, table, thematic_break};

#[derive(Clone, Debug)]
struct SourceLine {
  text: String,
  start: u32,
  end: u32,
  next: u32,
}

pub fn parse_markdown(markdown: &str) -> Document {
  let lines = source_lines(markdown);
  let mut document = Document::new();
  let mut index = 0usize;

  while index < lines.len() {
    let line = &lines[index];
    if line.text.trim().is_empty() {
      index += 1;
      continue;
    }

    if let Some(opening) = fenced_code::parse_opening(&line.text) {
      index = parse_fenced_code(&mut document, &lines, index, opening);
      continue;
    }

    if let Some(level) = lines
      .get(index + 1)
      .and_then(|underline| heading::parse_setext_underline(&underline.text))
    {
      let underline = &lines[index + 1];
      append_text_block(
        &mut document,
        BlockKind::Heading { level },
        line.text.trim(),
        SourceRange::new(line.start, underline.end),
      );
      index += 2;
      continue;
    }

    if table::looks_like_row(&line.text) {
      if let Some(alignments) = lines
        .get(index + 1)
        .and_then(|delimiter| table::parse_delimiter(&delimiter.text))
      {
        index = parse_table(&mut document, &lines, index, alignments);
        continue;
      }
    }

    if let Some(parsed) = heading::parse_atx(&line.text) {
      append_text_block(
        &mut document,
        BlockKind::Heading { level: parsed.level },
        parsed.text,
        SourceRange::new(line.start, line.end),
      );
      index += 1;
      continue;
    }

    if thematic_break::matches(&line.text) {
      let block = document.allocate(
        NodeKind::Block(BlockKind::ThematicBreak),
        Some(SourceRange::new(line.start, line.end)),
      );
      document.append_child(document.root, block);
      index += 1;
      continue;
    }

    if blockquote::strip_marker(&line.text).is_some() {
      index = parse_blockquote(&mut document, &lines, index);
      continue;
    }

    if list::parse(&line.text).is_some() {
      index = parse_list(&mut document, &lines, index);
      continue;
    }

    index = parse_paragraph(&mut document, &lines, index);
  }

  document
}

fn source_lines(markdown: &str) -> Vec<SourceLine> {
  let mut offset = 0u32;
  markdown
    .split_inclusive('\n')
    .map(|segment| {
      let text = segment.strip_suffix('\n').unwrap_or(segment).trim_end_matches('\r').to_string();
      let end = offset + text.encode_utf16().count() as u32;
      let next = offset + segment.encode_utf16().count() as u32;
      let line = SourceLine { text, start: offset, end, next };
      offset = next;
      line
    })
    .collect()
}

fn parse_fenced_code(
  document: &mut Document,
  lines: &[SourceLine],
  start_index: usize,
  opening: fenced_code::FenceOpen,
) -> usize {
  let mut index = start_index + 1;
  let mut body = Vec::new();
  let mut end = lines[start_index].end;

  while index < lines.len() {
    let line = &lines[index];
    end = line.end;
    if fenced_code::is_closing(&line.text, &opening) {
      index += 1;
      break;
    }
    body.push(line.text.clone());
    index += 1;
  }

  append_text_block(
    document,
    BlockKind::CodeBlock {
      language: opening.info,
      fenced: true,
    },
    &body.join("\n"),
    SourceRange::new(lines[start_index].start, end),
  );
  index
}

fn parse_blockquote(document: &mut Document, lines: &[SourceLine], start_index: usize) -> usize {
  let mut index = start_index;
  let mut body = Vec::new();
  let mut end = lines[start_index].end;

  while let Some(line) = lines.get(index) {
    let Some(text) = blockquote::strip_marker(&line.text) else {
      break;
    };
    body.push(text.to_string());
    end = line.end;
    index += 1;
  }

  append_text_block(
    document,
    BlockKind::BlockQuote,
    &body.join("\n"),
    SourceRange::new(lines[start_index].start, end),
  );
  index
}

fn parse_list(document: &mut Document, lines: &[SourceLine], start_index: usize) -> usize {
  let first = list::parse(&lines[start_index].text).expect("list marker must exist");
  let list_kind = first.kind;
  let list_start = first.start;
  let mut index = start_index;
  let mut items = Vec::new();
  let mut end = lines[start_index].end;

  while let Some(line) = lines.get(index) {
    let Some(marker) = list::parse(&line.text) else {
      break;
    };
    if marker.kind != list_kind {
      break;
    }
    items.push((marker.content.to_string(), marker.checked));
    end = line.end;
    index += 1;
  }

  let list_node = document.allocate(
    NodeKind::Block(BlockKind::List {
      kind: list_kind,
      start: list_start,
    }),
    Some(SourceRange::new(lines[start_index].start, end)),
  );

  for (content, checked) in items {
    let item = document.allocate(
      NodeKind::Block(BlockKind::ListItem { checked }),
      Some(SourceRange::new(lines[start_index].start, end)),
    );
    let paragraph = document.allocate(
      NodeKind::Block(BlockKind::Paragraph),
      Some(SourceRange::new(lines[start_index].start, end)),
    );
    let text = document.allocate(
      NodeKind::Inline(InlineKind::Text { value: content }),
      Some(SourceRange::new(lines[start_index].start, end)),
    );
    document.append_child(paragraph, text);
    document.append_child(item, paragraph);
    document.append_child(list_node, item);
  }

  document.append_child(document.root, list_node);
  index
}

fn parse_table(
  document: &mut Document,
  lines: &[SourceLine],
  start_index: usize,
  alignments: Vec<Alignment>,
) -> usize {
  let header = table::split_cells(&lines[start_index].text);
  let mut rows = Vec::new();
  let mut index = start_index + 2;
  let mut end = lines[start_index + 1].end;

  while let Some(line) = lines.get(index) {
    if line.text.trim().is_empty() || !table::looks_like_row(&line.text) {
      break;
    }
    rows.push(table::split_cells(&line.text));
    end = line.end;
    index += 1;
  }

  let table_node = document.allocate(
    NodeKind::Block(BlockKind::Table),
    Some(SourceRange::new(lines[start_index].start, end)),
  );
  append_table_row(document, table_node, &header, &alignments, true);
  for row in rows {
    append_table_row(document, table_node, &row, &alignments, false);
  }
  document.append_child(document.root, table_node);
  index
}

fn append_table_row(
  document: &mut Document,
  table_node: NodeId,
  values: &[String],
  alignments: &[Alignment],
  header: bool,
) {
  let row = document.allocate(NodeKind::Block(BlockKind::TableRow), None);
  for (column, alignment) in alignments.iter().copied().enumerate() {
    let cell = document.allocate(
      NodeKind::Block(BlockKind::TableCell { alignment, header }),
      None,
    );
    let text = document.allocate(
      NodeKind::Inline(InlineKind::Text {
        value: values.get(column).cloned().unwrap_or_default(),
      }),
      None,
    );
    document.append_child(cell, text);
    document.append_child(row, cell);
  }
  document.append_child(table_node, row);
}

fn parse_paragraph(document: &mut Document, lines: &[SourceLine], start_index: usize) -> usize {
  let mut index = start_index;
  let mut values = Vec::new();
  let mut end = lines[start_index].end;

  while let Some(line) = lines.get(index) {
    if line.text.trim().is_empty() || (index > start_index && starts_block(lines, index)) {
      break;
    }
    values.push(line.text.clone());
    end = line.end;
    index += 1;
  }

  let text = paragraph::join_lines(&values);
  append_text_block(
    document,
    BlockKind::Paragraph,
    &text,
    SourceRange::new(lines[start_index].start, end),
  );
  index
}

fn starts_block(lines: &[SourceLine], index: usize) -> bool {
  let line = &lines[index].text;
  fenced_code::parse_opening(line).is_some()
    || heading::parse_atx(line).is_some()
    || thematic_break::matches(line)
    || blockquote::strip_marker(line).is_some()
    || list::parse(line).is_some()
    || lines
      .get(index + 1)
      .is_some_and(|next| heading::parse_setext_underline(&next.text).is_some())
    || (table::looks_like_row(line)
      && lines
        .get(index + 1)
        .is_some_and(|next| table::parse_delimiter(&next.text).is_some()))
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
    let document = parse_markdown("> Quote\n> continued\n\n```rust\nfn main() {}\n```\n");
    let blocks = document.children(document.root).collect::<Vec<_>>();
    assert!(matches!(blocks[0].kind, NodeKind::Block(BlockKind::BlockQuote)));
    assert!(matches!(
      &blocks[1].kind,
      NodeKind::Block(BlockKind::CodeBlock { language: Some(language), fenced: true }) if language == "rust"
    ));
  }

  #[test]
  fn parses_setext_lists_and_tables() {
    let document = parse_markdown(
      "Title\n=====\n\n- one\n- two\n\n| Name | Score |\n| :--- | ---: |\n| Ada | 10 |\n",
    );
    let blocks = document.children(document.root).collect::<Vec<_>>();
    assert!(matches!(blocks[0].kind, NodeKind::Block(BlockKind::Heading { level: 1 })));
    assert!(matches!(
      blocks[1].kind,
      NodeKind::Block(BlockKind::List { kind: ListKind::Unordered, .. })
    ));
    assert!(matches!(blocks[2].kind, NodeKind::Block(BlockKind::Table)));
    assert_eq!(document.children(blocks[2].id).count(), 2);
  }

  #[test]
  fn source_ranges_use_utf16_units() {
    let document = parse_markdown("# 😀\n");
    let heading = document.children(document.root).next().unwrap();
    assert_eq!(heading.source.unwrap().len(), 4);
  }
}

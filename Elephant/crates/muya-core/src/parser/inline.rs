use crate::model::{Document, InlineKind, NodeId, NodeKind, SourceRange};
use crate::syntax::inline::{code_span, emphasis, escape, line_break, link, text};

pub fn append_inlines(
  document: &mut Document,
  parent: NodeId,
  source: &str,
  base_utf16: u32,
) {
  let mut byte_offset = 0usize;
  let mut utf16_offset = base_utf16;

  while byte_offset < source.len() {
    let remaining = &source[byte_offset..];

    if let Some(parsed) = escape::parse(remaining) {
      let value = parsed.value.to_string();
      append_leaf(
        document,
        parent,
        InlineKind::Text { value },
        utf16_offset,
        remaining,
        parsed.consumed,
      );
      advance(remaining, parsed.consumed, &mut byte_offset, &mut utf16_offset);
      continue;
    }

    if let Some(parsed) = code_span::parse(remaining) {
      append_leaf(
        document,
        parent,
        InlineKind::CodeSpan {
          code: parsed.code.to_string(),
        },
        utf16_offset,
        remaining,
        parsed.consumed,
      );
      advance(remaining, parsed.consumed, &mut byte_offset, &mut utf16_offset);
      continue;
    }

    if let Some(parsed) = link::parse_image(remaining) {
      append_leaf(
        document,
        parent,
        InlineKind::Image {
          source: parsed.destination.to_string(),
          title: parsed.title.map(str::to_string),
          alt: parsed.label.to_string(),
        },
        utf16_offset,
        remaining,
        parsed.consumed,
      );
      advance(remaining, parsed.consumed, &mut byte_offset, &mut utf16_offset);
      continue;
    }

    if let Some(parsed) = link::parse_link(remaining) {
      let consumed_utf16 = utf16_len(&remaining[..parsed.consumed]);
      let node = document.allocate(
        NodeKind::Inline(InlineKind::Link {
          destination: parsed.destination.to_string(),
          title: parsed.title.map(str::to_string),
        }),
        Some(SourceRange::new(
          utf16_offset,
          utf16_offset + consumed_utf16,
        )),
      );
      document.append_child(parent, node);
      append_inlines(document, node, parsed.label, utf16_offset + 1);
      advance(remaining, parsed.consumed, &mut byte_offset, &mut utf16_offset);
      continue;
    }

    if let Some(parsed) = emphasis::parse(remaining) {
      let consumed_utf16 = utf16_len(&remaining[..parsed.consumed]);
      let kind = match parsed.kind {
        emphasis::EmphasisKind::Emphasis => InlineKind::Emphasis,
        emphasis::EmphasisKind::Strong => InlineKind::Strong,
        emphasis::EmphasisKind::Strike => InlineKind::Strike,
      };
      let node = document.allocate(
        NodeKind::Inline(kind),
        Some(SourceRange::new(
          utf16_offset,
          utf16_offset + consumed_utf16,
        )),
      );
      document.append_child(parent, node);
      let delimiter_bytes = (parsed.consumed - parsed.content.len()) / 2;
      append_inlines(
        document,
        node,
        parsed.content,
        utf16_offset + delimiter_bytes as u32,
      );
      advance(remaining, parsed.consumed, &mut byte_offset, &mut utf16_offset);
      continue;
    }

    if let Some(parsed) = line_break::parse(remaining) {
      let kind = match parsed.kind {
        line_break::BreakKind::Soft => InlineKind::SoftBreak,
        line_break::BreakKind::Hard => InlineKind::HardBreak,
      };
      append_leaf(
        document,
        parent,
        kind,
        utf16_offset,
        remaining,
        parsed.consumed,
      );
      advance(remaining, parsed.consumed, &mut byte_offset, &mut utf16_offset);
      continue;
    }

    let plain = text::take(remaining);
    append_leaf(
      document,
      parent,
      InlineKind::Text {
        value: plain.to_string(),
      },
      utf16_offset,
      remaining,
      plain.len(),
    );
    advance(remaining, plain.len(), &mut byte_offset, &mut utf16_offset);
  }
}

pub fn append_literal(
  document: &mut Document,
  parent: NodeId,
  source: &str,
  base_utf16: u32,
) {
  if source.is_empty() {
    return;
  }
  let node = document.allocate(
    NodeKind::Inline(InlineKind::Text {
      value: source.to_string(),
    }),
    Some(SourceRange::new(
      base_utf16,
      base_utf16 + utf16_len(source),
    )),
  );
  document.append_child(parent, node);
}

fn append_leaf(
  document: &mut Document,
  parent: NodeId,
  kind: InlineKind,
  start: u32,
  source: &str,
  consumed: usize,
) {
  let node = document.allocate(
    NodeKind::Inline(kind),
    Some(SourceRange::new(
      start,
      start + utf16_len(&source[..consumed]),
    )),
  );
  document.append_child(parent, node);
}

fn advance(source: &str, consumed: usize, byte_offset: &mut usize, utf16_offset: &mut u32) {
  *byte_offset += consumed;
  *utf16_offset += utf16_len(&source[..consumed]);
}

fn utf16_len(value: &str) -> u32 {
  value.encode_utf16().count() as u32
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::model::BlockKind;

  #[test]
  fn builds_nested_inline_nodes() {
    let mut document = Document::new();
    let paragraph = document.allocate(NodeKind::Block(BlockKind::Paragraph), None);
    document.append_child(document.root, paragraph);
    append_inlines(
      &mut document,
      paragraph,
      "A **bold** [link](https://example.com) and `code`.",
      0,
    );

    let kinds = document
      .children(paragraph)
      .map(|node| &node.kind)
      .collect::<Vec<_>>();
    assert!(kinds.iter().any(|kind| matches!(kind, NodeKind::Inline(InlineKind::Strong))));
    assert!(kinds.iter().any(|kind| matches!(kind, NodeKind::Inline(InlineKind::Link { .. }))));
    assert!(kinds.iter().any(|kind| matches!(kind, NodeKind::Inline(InlineKind::CodeSpan { .. }))));
  }

  #[test]
  fn preserves_utf16_source_offsets() {
    let mut document = Document::new();
    let paragraph = document.allocate(NodeKind::Block(BlockKind::Paragraph), None);
    append_inlines(&mut document, paragraph, "😀 **x**", 10);
    let strong = document
      .children(paragraph)
      .find(|node| matches!(node.kind, NodeKind::Inline(InlineKind::Strong)))
      .unwrap();
    assert_eq!(strong.source, Some(SourceRange::new(13, 18)));
  }
}

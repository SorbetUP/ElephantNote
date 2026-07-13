use crate::edit::EditError;
use crate::model::{BlockKind, Document, InlineKind, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

pub(super) fn ensure_editable_text(document: &mut Document) -> NodeId {
  if let Some(text) = first_text_descendant(document, document.root) {
    return text;
  }
  let paragraph = document.allocate(NodeKind::Block(BlockKind::Paragraph), None);
  let text = document.allocate(
    NodeKind::Inline(InlineKind::Text {
      value: String::new(),
    }),
    None,
  );
  document.append_child(paragraph, text);
  document.append_child(document.root, paragraph);
  text
}

pub(super) fn first_text_descendant(
  document: &Document,
  root: NodeId,
) -> Option<NodeId> {
  let mut stack = vec![root];
  while let Some(current) = stack.pop() {
    let node = document.node(current)?;
    if matches!(node.kind, NodeKind::Inline(InlineKind::Text { .. })) {
      return Some(current);
    }
    stack.extend(node.children.iter().rev().copied());
  }
  None
}

pub(super) fn validate_selection(
  document: &Document,
  selection: Selection,
) -> Result<(), EditError> {
  validate_point(document, selection.anchor)?;
  validate_point(document, selection.focus)
}

fn validate_point(
  document: &Document,
  point: SelectionPoint,
) -> Result<(), EditError> {
  let node = document
    .node(point.node)
    .ok_or(EditError::NodeNotFound(point.node))?;
  let NodeKind::Inline(InlineKind::Text { value }) = &node.kind else {
    return Err(EditError::NotTextNode(point.node));
  };
  let length = value.encode_utf16().count() as u32;
  if point.offset_utf16 > length {
    return Err(EditError::RangeOutOfBounds {
      node: point.node,
      start: point.offset_utf16,
      end: point.offset_utf16,
    });
  }
  let mut offset = 0u32;
  for character in value.chars() {
    if offset == point.offset_utf16 {
      return Ok(());
    }
    offset += character.len_utf16() as u32;
    if offset > point.offset_utf16 {
      return Err(EditError::InvalidUtf16Boundary {
        node: point.node,
        offset: point.offset_utf16,
      });
    }
  }
  if offset == point.offset_utf16 {
    Ok(())
  } else {
    Err(EditError::RangeOutOfBounds {
      node: point.node,
      start: point.offset_utf16,
      end: point.offset_utf16,
    })
  }
}

use crate::model::{Document, InlineKind, NodeId, NodeKind};

use super::EditError;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Utf16Range {
  pub start: u32,
  pub end: u32,
}

impl Utf16Range {
  pub fn new(start: u32, end: u32) -> Self {
    Self { start, end }
  }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Operation {
  ReplaceText {
    node: NodeId,
    range: Utf16Range,
    inserted: String,
  },
}

impl Operation {
  pub fn apply(&self, document: &mut Document) -> Result<Self, EditError> {
    match self {
      Self::ReplaceText {
        node,
        range,
        inserted,
      } => apply_replace_text(document, *node, *range, inserted),
    }
  }
}

fn apply_replace_text(
  document: &mut Document,
  node_id: NodeId,
  range: Utf16Range,
  inserted: &str,
) -> Result<Operation, EditError> {
  let node = document
    .node_mut(node_id)
    .ok_or(EditError::NodeNotFound(node_id))?;
  let NodeKind::Inline(InlineKind::Text { value }) = &mut node.kind else {
    return Err(EditError::NotTextNode(node_id));
  };

  let utf16_length = value.encode_utf16().count() as u32;
  if range.start > range.end || range.end > utf16_length {
    return Err(EditError::RangeOutOfBounds {
      node: node_id,
      start: range.start,
      end: range.end,
    });
  }

  let start = utf16_to_byte(value, node_id, range.start)?;
  let end = utf16_to_byte(value, node_id, range.end)?;
  let deleted = value[start..end].to_string();
  value.replace_range(start..end, inserted);
  node.source = None;

  Ok(Operation::ReplaceText {
    node: node_id,
    range: Utf16Range::new(
      range.start,
      range.start + inserted.encode_utf16().count() as u32,
    ),
    inserted: deleted,
  })
}

pub(crate) fn utf16_to_byte(
  value: &str,
  node: NodeId,
  target: u32,
) -> Result<usize, EditError> {
  if target == 0 {
    return Ok(0);
  }

  let mut utf16_offset = 0u32;
  for (byte_offset, character) in value.char_indices() {
    if utf16_offset == target {
      return Ok(byte_offset);
    }
    utf16_offset += character.len_utf16() as u32;
    if utf16_offset > target {
      return Err(EditError::InvalidUtf16Boundary {
        node,
        offset: target,
      });
    }
  }

  if utf16_offset == target {
    Ok(value.len())
  } else {
    Err(EditError::RangeOutOfBounds {
      node,
      start: target,
      end: target,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::model::{InlineKind, NodeKind};

  #[test]
  fn replaces_text_and_returns_its_inverse() {
    let mut document = Document::new();
    let node = document.allocate(
      NodeKind::Inline(InlineKind::Text {
        value: "A😀B".to_string(),
      }),
      None,
    );
    let operation = Operation::ReplaceText {
      node,
      range: Utf16Range::new(1, 3),
      inserted: "X".to_string(),
    };
    let inverse = operation.apply(&mut document).unwrap();
    assert!(matches!(
      &document.node(node).unwrap().kind,
      NodeKind::Inline(InlineKind::Text { value }) if value == "AXB"
    ));
    inverse.apply(&mut document).unwrap();
    assert!(matches!(
      &document.node(node).unwrap().kind,
      NodeKind::Inline(InlineKind::Text { value }) if value == "A😀B"
    ));
  }

  #[test]
  fn rejects_offsets_inside_surrogate_pairs() {
    let mut document = Document::new();
    let node = document.allocate(
      NodeKind::Inline(InlineKind::Text {
        value: "😀".to_string(),
      }),
      None,
    );
    let error = Operation::ReplaceText {
      node,
      range: Utf16Range::new(1, 1),
      inserted: "x".to_string(),
    }
    .apply(&mut document)
    .unwrap_err();
    assert_eq!(
      error,
      EditError::InvalidUtf16Boundary {
        node,
        offset: 1,
      }
    );
  }
}

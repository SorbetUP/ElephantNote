use crate::model::{Document, InlineKind, NodeKind};
use crate::selection::{Selection, SelectionPoint};

use super::operation::utf16_to_byte;
use super::{EditError, Operation, Transaction, Utf16Range};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Command {
  InsertText(String),
  DeleteBackward,
}

impl Command {
  pub fn build(
    &self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    let caret = selection.caret().ok_or(EditError::NonCollapsedSelection)?;
    let value = text_value(document, caret)?;

    match self {
      Self::InsertText(inserted) => {
        utf16_to_byte(value, caret.node, caret.offset_utf16)?;
        let next = Selection::collapsed(SelectionPoint {
          node: caret.node,
          offset_utf16: caret.offset_utf16 + inserted.encode_utf16().count() as u32,
        });
        Ok(Transaction {
          operations: vec![Operation::ReplaceText {
            node: caret.node,
            range: Utf16Range::new(caret.offset_utf16, caret.offset_utf16),
            inserted: inserted.clone(),
          }],
          selection_before: selection,
          selection_after: next,
        })
      }
      Self::DeleteBackward => build_delete_backward(value, caret, selection),
    }
  }
}

fn build_delete_backward(
  value: &str,
  caret: SelectionPoint,
  selection: Selection,
) -> Result<Transaction, EditError> {
  let byte_offset = utf16_to_byte(value, caret.node, caret.offset_utf16)?;
  if byte_offset == 0 {
    return Ok(Transaction {
      operations: Vec::new(),
      selection_before: selection,
      selection_after: selection,
    });
  }

  let previous = value[..byte_offset]
    .chars()
    .next_back()
    .expect("non-zero byte offset must have a previous character");
  let start = caret.offset_utf16 - previous.len_utf16() as u32;
  let next = Selection::collapsed(SelectionPoint {
    node: caret.node,
    offset_utf16: start,
  });

  Ok(Transaction {
    operations: vec![Operation::ReplaceText {
      node: caret.node,
      range: Utf16Range::new(start, caret.offset_utf16),
      inserted: String::new(),
    }],
    selection_before: selection,
    selection_after: next,
  })
}

fn text_value(
  document: &Document,
  point: SelectionPoint,
) -> Result<&str, EditError> {
  let node = document
    .node(point.node)
    .ok_or(EditError::NodeNotFound(point.node))?;
  match &node.kind {
    NodeKind::Inline(InlineKind::Text { value }) => Ok(value),
    _ => Err(EditError::NotTextNode(point.node)),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::parse_markdown;

  fn first_text(document: &Document) -> crate::model::NodeId {
    let paragraph = document.children(document.root).next().unwrap();
    document.children(paragraph.id).next().unwrap().id
  }

  #[test]
  fn inserts_text_at_a_utf16_caret() {
    let mut document = parse_markdown("A😀B");
    let node = first_text(&document);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 3,
    });
    let transaction = Command::InsertText("X".to_string())
      .build(&document, selection)
      .unwrap();
    assert_eq!(transaction.selection_after.focus.offset_utf16, 4);
    transaction.apply(&mut document).unwrap();
    assert!(matches!(
      &document.node(node).unwrap().kind,
      NodeKind::Inline(InlineKind::Text { value }) if value == "A😀XB"
    ));
  }

  #[test]
  fn delete_backward_removes_one_unicode_scalar() {
    let mut document = parse_markdown("A😀B");
    let node = first_text(&document);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 3,
    });
    let transaction = Command::DeleteBackward
      .build(&document, selection)
      .unwrap();
    assert_eq!(transaction.selection_after.focus.offset_utf16, 1);
    transaction.apply(&mut document).unwrap();
    assert!(matches!(
      &document.node(node).unwrap().kind,
      NodeKind::Inline(InlineKind::Text { value }) if value == "AB"
    ));
  }
}

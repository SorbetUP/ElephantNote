use crate::model::{BlockKind, Document, InlineKind, Node, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

use super::operation::utf16_to_byte;
use super::{EditError, Operation, Transaction, Utf16Range};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Command {
  InsertText(String),
  InsertParagraph,
  DeleteBackward,
  SetParagraph,
  SetHeading(u8),
}

impl Command {
  pub fn build(
    &self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    match self {
      Self::InsertText(inserted) => build_insert_text(document, selection, inserted),
      Self::InsertParagraph => build_insert_paragraph(document, selection),
      Self::DeleteBackward => build_delete_backward(document, selection),
      Self::SetParagraph => build_set_block_kind(document, selection, BlockKind::Paragraph),
      Self::SetHeading(level) => {
        if !(1..=6).contains(level) {
          return Err(EditError::InvalidHeadingLevel(*level));
        }
        build_set_block_kind(document, selection, BlockKind::Heading { level: *level })
      }
    }
  }
}

fn build_insert_text(
  document: &Document,
  selection: Selection,
  inserted: &str,
) -> Result<Transaction, EditError> {
  let (node, start, end) = selection
    .ordered_same_node()
    .ok_or(EditError::CrossNodeSelection)?;
  let value = text_value(document, node)?;
  utf16_to_byte(value, node, start)?;
  utf16_to_byte(value, node, end)?;
  let next = Selection::collapsed(SelectionPoint {
    node,
    offset_utf16: start + inserted.encode_utf16().count() as u32,
  });

  Ok(Transaction {
    operations: vec![Operation::ReplaceText {
      node,
      range: Utf16Range::new(start, end),
      inserted: inserted.to_string(),
    }],
    selection_before: selection,
    selection_after: next,
  })
}

fn build_delete_backward(
  document: &Document,
  selection: Selection,
) -> Result<Transaction, EditError> {
  if !selection.is_collapsed() {
    let (node, start, end) = selection
      .ordered_same_node()
      .ok_or(EditError::CrossNodeSelection)?;
    let value = text_value(document, node)?;
    utf16_to_byte(value, node, start)?;
    utf16_to_byte(value, node, end)?;
    return Ok(Transaction {
      operations: vec![Operation::ReplaceText {
        node,
        range: Utf16Range::new(start, end),
        inserted: String::new(),
      }],
      selection_before: selection,
      selection_after: Selection::collapsed(SelectionPoint {
        node,
        offset_utf16: start,
      }),
    });
  }

  let caret = selection.caret().expect("collapsed selection must expose a caret");
  let value = text_value(document, caret.node)?;
  let byte_offset = utf16_to_byte(value, caret.node, caret.offset_utf16)?;
  if byte_offset == 0 {
    return build_join_previous_paragraph(document, caret, selection);
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

fn build_insert_paragraph(
  document: &Document,
  selection: Selection,
) -> Result<Transaction, EditError> {
  let caret = selection.caret().ok_or(EditError::NonCollapsedSelection)?;
  let value = text_value(document, caret.node)?;
  let byte_offset = utf16_to_byte(value, caret.node, caret.offset_utf16)?;
  let suffix = value[byte_offset..].to_string();
  let (block, parent, block_index) = plain_paragraph_for_text(document, caret.node)?;

  let new_block_id = document.next_available_id();
  let new_text_id = NodeId(new_block_id.0.saturating_add(1));
  let new_block = Node::new(
    new_block_id,
    NodeKind::Block(BlockKind::Paragraph),
    None,
  );
  let new_text = Node::new(
    new_text_id,
    NodeKind::Inline(InlineKind::Text { value: suffix }),
    None,
  );

  Ok(Transaction {
    operations: vec![
      Operation::ReplaceText {
        node: caret.node,
        range: Utf16Range::new(
          caret.offset_utf16,
          value.encode_utf16().count() as u32,
        ),
        inserted: String::new(),
      },
      Operation::InsertNode {
        parent,
        index: block_index + 1,
        node: new_block,
      },
      Operation::InsertNode {
        parent: new_block_id,
        index: 0,
        node: new_text,
      },
    ],
    selection_before: selection,
    selection_after: Selection::collapsed(SelectionPoint {
      node: new_text_id,
      offset_utf16: 0,
    }),
  })
}

fn build_join_previous_paragraph(
  document: &Document,
  caret: SelectionPoint,
  selection: Selection,
) -> Result<Transaction, EditError> {
  let current_value = text_value(document, caret.node)?;
  let (current_block, parent, _) = plain_paragraph_for_text(document, caret.node)?;
  let Some(previous_block) = document.previous_sibling(current_block) else {
    return Ok(Transaction {
      operations: Vec::new(),
      selection_before: selection,
      selection_after: selection,
    });
  };
  if !matches!(previous_block.kind, NodeKind::Block(BlockKind::Paragraph)) {
    return Ok(Transaction {
      operations: Vec::new(),
      selection_before: selection,
      selection_after: selection,
    });
  }
  if previous_block.parent != Some(parent) {
    return Err(EditError::UnsupportedStructure(current_block));
  }

  let previous_text = single_text_child(document, previous_block.id)?;
  let previous_value = text_value(document, previous_text)?;
  let previous_end = previous_value.encode_utf16().count() as u32;

  Ok(Transaction {
    operations: vec![
      Operation::ReplaceText {
        node: previous_text,
        range: Utf16Range::new(previous_end, previous_end),
        inserted: current_value.to_string(),
      },
      Operation::RemoveNode { node: caret.node },
      Operation::RemoveNode {
        node: current_block,
      },
    ],
    selection_before: selection,
    selection_after: Selection::collapsed(SelectionPoint {
      node: previous_text,
      offset_utf16: previous_end,
    }),
  })
}

fn build_set_block_kind(
  document: &Document,
  selection: Selection,
  kind: BlockKind,
) -> Result<Transaction, EditError> {
  let node = if selection.anchor.node == selection.focus.node {
    selection.focus.node
  } else {
    return Err(EditError::CrossNodeSelection);
  };
  let block = editable_text_block_for_text(document, node)?;
  Ok(Transaction {
    operations: vec![Operation::SetBlockKind { node: block, kind }],
    selection_before: selection,
    selection_after: selection,
  })
}

fn editable_text_block_for_text(
  document: &Document,
  text: NodeId,
) -> Result<NodeId, EditError> {
  let text_node = document.node(text).ok_or(EditError::NodeNotFound(text))?;
  text_value(document, text)?;
  let block = text_node.parent.ok_or(EditError::UnsupportedStructure(text))?;
  let block_node = document
    .node(block)
    .ok_or(EditError::NodeNotFound(block))?;
  if !matches!(
    block_node.kind,
    NodeKind::Block(BlockKind::Paragraph | BlockKind::Heading { .. })
  ) || block_node.children.as_slice() != [text]
  {
    return Err(EditError::UnsupportedStructure(block));
  }
  Ok(block)
}

fn plain_paragraph_for_text(
  document: &Document,
  text: NodeId,
) -> Result<(NodeId, NodeId, usize), EditError> {
  let block = editable_text_block_for_text(document, text)?;
  let block_node = document
    .node(block)
    .ok_or(EditError::NodeNotFound(block))?;
  if !matches!(block_node.kind, NodeKind::Block(BlockKind::Paragraph)) {
    return Err(EditError::UnsupportedStructure(block));
  }
  let parent = block_node
    .parent
    .ok_or(EditError::UnsupportedStructure(block))?;
  let index = document
    .child_index(parent, block)
    .ok_or(EditError::UnsupportedStructure(block))?;
  Ok((block, parent, index))
}

fn single_text_child(document: &Document, block: NodeId) -> Result<NodeId, EditError> {
  let block_node = document
    .node(block)
    .ok_or(EditError::NodeNotFound(block))?;
  let [child] = block_node.children.as_slice() else {
    return Err(EditError::UnsupportedStructure(block));
  };
  text_value(document, *child)?;
  Ok(*child)
}

fn text_value(document: &Document, node_id: NodeId) -> Result<&str, EditError> {
  let node = document
    .node(node_id)
    .ok_or(EditError::NodeNotFound(node_id))?;
  match &node.kind {
    NodeKind::Inline(InlineKind::Text { value }) => Ok(value),
    _ => Err(EditError::NotTextNode(node_id)),
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{parse_markdown, to_markdown};

  fn block_text(document: &Document, block_index: usize) -> NodeId {
    let block = document.children(document.root).nth(block_index).unwrap();
    document.children(block.id).next().unwrap().id
  }

  #[test]
  fn replaces_a_same_node_selection() {
    let mut document = parse_markdown("abcdef");
    let node = block_text(&document, 0);
    let selection = Selection {
      anchor: SelectionPoint {
        node,
        offset_utf16: 5,
      },
      focus: SelectionPoint {
        node,
        offset_utf16: 2,
      },
    };
    let transaction = Command::InsertText("X".to_string())
      .build(&document, selection)
      .unwrap();
    transaction.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "abXf");
  }

  #[test]
  fn inserts_text_at_a_utf16_caret() {
    let mut document = parse_markdown("A😀B");
    let node = block_text(&document, 0);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 3,
    });
    let transaction = Command::InsertText("X".to_string())
      .build(&document, selection)
      .unwrap();
    assert_eq!(transaction.selection_after.focus.offset_utf16, 4);
    transaction.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "A😀XB");
  }

  #[test]
  fn splits_a_plain_paragraph_and_undoes_exactly() {
    let mut document = parse_markdown("hello");
    let node = block_text(&document, 0);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 2,
    });
    let transaction = Command::InsertParagraph
      .build(&document, selection)
      .unwrap();
    let inverse = transaction.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "he\n\nllo");
    assert_eq!(document.children(document.root).count(), 2);

    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "hello");
    assert_eq!(document.children(document.root).count(), 1);
  }

  #[test]
  fn joins_adjacent_plain_paragraphs_at_the_start() {
    let mut document = parse_markdown("One\n\nTwo");
    let node = block_text(&document, 1);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 0,
    });
    let transaction = Command::DeleteBackward
      .build(&document, selection)
      .unwrap();
    let inverse = transaction.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "OneTwo");

    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "One\n\nTwo");
  }

  #[test]
  fn transforms_paragraphs_to_headings_and_back() {
    let mut document = parse_markdown("Title");
    let node = block_text(&document, 0);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 5,
    });
    let heading = Command::SetHeading(2)
      .build(&document, selection)
      .unwrap();
    let inverse = heading.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "## Title");

    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "Title");
  }

  #[test]
  fn rejects_invalid_heading_levels() {
    let document = parse_markdown("Title");
    let node = block_text(&document, 0);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 0,
    });
    assert_eq!(
      Command::SetHeading(7).build(&document, selection),
      Err(EditError::InvalidHeadingLevel(7))
    );
  }

  #[test]
  fn delete_backward_removes_one_unicode_scalar() {
    let mut document = parse_markdown("A😀B");
    let node = block_text(&document, 0);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 3,
    });
    let transaction = Command::DeleteBackward
      .build(&document, selection)
      .unwrap();
    assert_eq!(transaction.selection_after.focus.offset_utf16, 1);
    transaction.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "AB");
  }
}

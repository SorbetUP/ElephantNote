use crate::model::{BlockKind, Document, InlineKind, Node, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

use super::operation::utf16_to_byte;
use super::{EditError, Operation, Transaction, Utf16Range};

struct SplitPath {
  paragraph: NodeId,
  document_parent: NodeId,
  paragraph_index: usize,
  wrappers_top_down: Vec<NodeId>,
}

pub(crate) fn build_insert_paragraph(
  document: &Document,
  selection: Selection,
) -> Result<Transaction, EditError> {
  let caret = selection.caret().ok_or(EditError::NonCollapsedSelection)?;
  let value = text_value(document, caret.node)?;
  let byte_offset = utf16_to_byte(value, caret.node, caret.offset_utf16)?;
  let suffix = value[byte_offset..].to_string();
  let path = split_path(document, caret.node)?;

  if !path.wrappers_top_down.is_empty()
    && (caret.offset_utf16 == 0
      || caret.offset_utf16 == value.encode_utf16().count() as u32)
  {
    return Err(EditError::UnsupportedStructure(caret.node));
  }

  let new_block_id = document.next_available_id();
  let mut next_id = new_block_id.0.saturating_add(1);
  let cloned_wrapper_ids = path
    .wrappers_top_down
    .iter()
    .map(|_| {
      let id = NodeId(next_id);
      next_id = next_id.saturating_add(1);
      id
    })
    .collect::<Vec<_>>();
  let new_text_id = NodeId(next_id);

  let mut operations = vec![
    Operation::ReplaceText {
      node: caret.node,
      range: Utf16Range::new(
        caret.offset_utf16,
        value.encode_utf16().count() as u32,
      ),
      inserted: String::new(),
    },
    Operation::InsertNode {
      parent: path.document_parent,
      index: path.paragraph_index + 1,
      node: Node::new(
        new_block_id,
        NodeKind::Block(BlockKind::Paragraph),
        None,
      ),
    },
  ];

  let mut destination_parent = new_block_id;
  for (original, cloned) in path
    .wrappers_top_down
    .iter()
    .zip(cloned_wrapper_ids.iter())
  {
    let original_node = document
      .node(*original)
      .ok_or(EditError::NodeNotFound(*original))?;
    operations.push(Operation::InsertNode {
      parent: destination_parent,
      index: 0,
      node: Node::new(*cloned, original_node.kind.clone(), None),
    });
    destination_parent = *cloned;
  }

  operations.push(Operation::InsertNode {
    parent: destination_parent,
    index: 0,
    node: Node::new(
      new_text_id,
      NodeKind::Inline(InlineKind::Text { value: suffix }),
      None,
    ),
  });

  let mut original_child = caret.node;
  let mut cloned_parent = cloned_wrapper_ids.last().copied();
  for original_parent in path.wrappers_top_down.iter().rev() {
    let following = following_siblings(document, *original_parent, original_child)?;
    let target = cloned_parent.ok_or(EditError::UnsupportedStructure(*original_parent))?;
    let base = document
      .node(target)
      .map(|node| node.children.len())
      .unwrap_or(0)
      + 1;
    operations.extend(
      following
        .into_iter()
        .enumerate()
        .map(|(offset, node)| Operation::MoveNode {
          node,
          new_parent: target,
          new_index: base + offset,
        }),
    );

    original_child = *original_parent;
    let position = path
      .wrappers_top_down
      .iter()
      .position(|candidate| candidate == original_parent)
      .expect("wrapper must belong to the split path");
    cloned_parent = position
      .checked_sub(1)
      .and_then(|index| cloned_wrapper_ids.get(index).copied());
  }

  let paragraph_following = following_siblings(document, path.paragraph, original_child)?;
  let paragraph_base = if cloned_wrapper_ids.is_empty() { 1 } else { 1 };
  operations.extend(
    paragraph_following
      .into_iter()
      .enumerate()
      .map(|(offset, node)| Operation::MoveNode {
        node,
        new_parent: new_block_id,
        new_index: paragraph_base + offset,
      }),
  );

  Ok(Transaction {
    operations,
    selection_before: selection,
    selection_after: Selection::collapsed(SelectionPoint {
      node: new_text_id,
      offset_utf16: 0,
    }),
  })
}

fn split_path(document: &Document, text: NodeId) -> Result<SplitPath, EditError> {
  text_value(document, text)?;
  let mut wrappers_bottom_up = Vec::new();
  let mut current = text;

  let paragraph = loop {
    let current_node = document
      .node(current)
      .ok_or(EditError::NodeNotFound(current))?;
    let parent = current_node
      .parent
      .ok_or(EditError::UnsupportedStructure(current))?;
    let parent_node = document
      .node(parent)
      .ok_or(EditError::NodeNotFound(parent))?;
    match &parent_node.kind {
      NodeKind::Block(BlockKind::Paragraph) => break parent,
      NodeKind::Inline(InlineKind::Text { .. }) => {
        return Err(EditError::UnsupportedStructure(parent));
      }
      NodeKind::Inline(_) => {
        wrappers_bottom_up.push(parent);
        current = parent;
      }
      _ => return Err(EditError::UnsupportedStructure(parent)),
    }
  };

  let paragraph_node = document
    .node(paragraph)
    .ok_or(EditError::NodeNotFound(paragraph))?;
  let document_parent = paragraph_node
    .parent
    .ok_or(EditError::UnsupportedStructure(paragraph))?;
  let paragraph_index = document
    .child_index(document_parent, paragraph)
    .ok_or(EditError::UnsupportedStructure(paragraph))?;
  wrappers_bottom_up.reverse();

  Ok(SplitPath {
    paragraph,
    document_parent,
    paragraph_index,
    wrappers_top_down: wrappers_bottom_up,
  })
}

fn following_siblings(
  document: &Document,
  parent: NodeId,
  child: NodeId,
) -> Result<Vec<NodeId>, EditError> {
  let parent_node = document
    .node(parent)
    .ok_or(EditError::NodeNotFound(parent))?;
  let index = document
    .child_index(parent, child)
    .ok_or(EditError::UnsupportedStructure(child))?;
  Ok(parent_node.children[index + 1..].to_vec())
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

  #[test]
  fn splits_inside_a_strong_mark_and_restores_original_ids() {
    let mut document = parse_markdown("**beforeafter**");
    let paragraph = document.children(document.root).next().unwrap().id;
    let strong = document.children(paragraph).next().unwrap().id;
    let text = document.children(strong).next().unwrap().id;
    let selection = Selection::collapsed(SelectionPoint {
      node: text,
      offset_utf16: 6,
    });

    let inverse = build_insert_paragraph(&document, selection)
      .unwrap()
      .apply(&mut document)
      .unwrap();
    assert_eq!(to_markdown(&document), "**before**\n\n**after**");
    assert_eq!(document.node(strong).unwrap().parent, Some(paragraph));
    let second_paragraph = document.children(document.root).nth(1).unwrap().id;
    let cloned_strong = document.children(second_paragraph).next().unwrap().id;
    assert_ne!(cloned_strong, strong);

    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "**beforeafter**");
    assert_eq!(document.node(strong).unwrap().parent, Some(paragraph));
    assert_eq!(document.node(text).unwrap().parent, Some(strong));
  }

  #[test]
  fn moves_following_children_at_each_nested_level() {
    let mut document = parse_markdown("**before [link](https://example.com) after**tail");
    let paragraph = document.children(document.root).next().unwrap().id;
    let strong = document.children(paragraph).next().unwrap().id;
    let text = document.children(strong).next().unwrap().id;
    let link = document.children(strong).nth(1).unwrap().id;
    let tail = document.children(paragraph).nth(1).unwrap().id;
    let selection = Selection::collapsed(SelectionPoint {
      node: text,
      offset_utf16: 6,
    });

    let inverse = build_insert_paragraph(&document, selection)
      .unwrap()
      .apply(&mut document)
      .unwrap();
    let second_paragraph = document.children(document.root).nth(1).unwrap().id;
    let cloned_strong = document.children(second_paragraph).next().unwrap().id;
    assert_eq!(document.node(link).unwrap().parent, Some(cloned_strong));
    assert_eq!(document.node(tail).unwrap().parent, Some(second_paragraph));

    inverse.apply(&mut document).unwrap();
    assert_eq!(document.node(link).unwrap().parent, Some(strong));
    assert_eq!(document.node(tail).unwrap().parent, Some(paragraph));
  }

  #[test]
  fn rejects_boundary_splits_inside_nested_marks_until_normalization_exists() {
    let document = parse_markdown("**text**");
    let paragraph = document.children(document.root).next().unwrap().id;
    let strong = document.children(paragraph).next().unwrap().id;
    let text = document.children(strong).next().unwrap().id;
    let selection = Selection::collapsed(SelectionPoint {
      node: text,
      offset_utf16: 0,
    });

    assert_eq!(
      build_insert_paragraph(&document, selection),
      Err(EditError::UnsupportedStructure(text))
    );
  }
}

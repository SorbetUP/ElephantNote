use crate::model::{BlockKind, Document, InlineKind, Node, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

use super::operation::utf16_to_byte;
use super::{EditError, Operation, Transaction, Utf16Range};

#[derive(Clone, Copy)]
enum SplitDestination {
  Document {
    parent: NodeId,
    paragraph_index: usize,
  },
  List {
    list: NodeId,
    item_index: usize,
    new_checked: Option<bool>,
  },
}

struct SplitPath {
  paragraph: NodeId,
  destination: SplitDestination,
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

  let mut next_id = document.next_available_id().0;
  let new_item_id = match path.destination {
    SplitDestination::List { .. } => Some(take_id(&mut next_id)),
    SplitDestination::Document { .. } => None,
  };
  let new_paragraph_id = take_id(&mut next_id);
  let cloned_wrapper_ids = path
    .wrappers_top_down
    .iter()
    .map(|_| take_id(&mut next_id))
    .collect::<Vec<_>>();
  let new_text_id = take_id(&mut next_id);

  let mut operations = vec![Operation::ReplaceText {
    node: caret.node,
    range: Utf16Range::new(
      caret.offset_utf16,
      value.encode_utf16().count() as u32,
    ),
    inserted: String::new(),
  }];

  match path.destination {
    SplitDestination::Document {
      parent,
      paragraph_index,
    } => operations.push(Operation::InsertNode {
      parent,
      index: paragraph_index + 1,
      node: Node::new(
        new_paragraph_id,
        NodeKind::Block(BlockKind::Paragraph),
        None,
      ),
    }),
    SplitDestination::List {
      list,
      item_index,
      new_checked,
    } => {
      let new_item_id = new_item_id.expect("list split must allocate an item ID");
      operations.extend([
        Operation::InsertNode {
          parent: list,
          index: item_index + 1,
          node: Node::new(
            new_item_id,
            NodeKind::Block(BlockKind::ListItem {
              checked: new_checked,
            }),
            None,
          ),
        },
        Operation::InsertNode {
          parent: new_item_id,
          index: 0,
          node: Node::new(
            new_paragraph_id,
            NodeKind::Block(BlockKind::Paragraph),
            None,
          ),
        },
      ]);
    }
  }

  let mut destination_parent = new_paragraph_id;
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

  let wrappers = &path.wrappers_top_down;
  for depth in (0..wrappers.len()).rev() {
    let original_parent = wrappers[depth];
    let original_child = wrappers.get(depth + 1).copied().unwrap_or(caret.node);
    let target = cloned_wrapper_ids[depth];
    let following = following_siblings(document, original_parent, original_child)?;
    operations.extend(
      following
        .into_iter()
        .enumerate()
        .map(|(offset, node)| Operation::MoveNode {
          node,
          new_parent: target,
          new_index: 1 + offset,
        }),
    );
  }

  let paragraph_child = wrappers.first().copied().unwrap_or(caret.node);
  let paragraph_following = following_siblings(document, path.paragraph, paragraph_child)?;
  operations.extend(
    paragraph_following
      .into_iter()
      .enumerate()
      .map(|(offset, node)| Operation::MoveNode {
        node,
        new_parent: new_paragraph_id,
        new_index: 1 + offset,
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

fn take_id(next_id: &mut u64) -> NodeId {
  let id = NodeId(*next_id);
  *next_id = (*next_id).saturating_add(1);
  id
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
  let paragraph_parent = paragraph_node
    .parent
    .ok_or(EditError::UnsupportedStructure(paragraph))?;
  let parent_node = document
    .node(paragraph_parent)
    .ok_or(EditError::NodeNotFound(paragraph_parent))?;

  let destination = if paragraph_parent == document.root {
    SplitDestination::Document {
      parent: paragraph_parent,
      paragraph_index: document
        .child_index(paragraph_parent, paragraph)
        .ok_or(EditError::UnsupportedStructure(paragraph))?,
    }
  } else if let NodeKind::Block(BlockKind::ListItem { checked }) = &parent_node.kind {
    if parent_node.children.as_slice() != [paragraph] {
      return Err(EditError::UnsupportedStructure(paragraph_parent));
    }
    let list = parent_node
      .parent
      .ok_or(EditError::UnsupportedStructure(paragraph_parent))?;
    if !matches!(
      document.node(list).map(|node| &node.kind),
      Some(NodeKind::Block(BlockKind::List { .. }))
    ) {
      return Err(EditError::UnsupportedStructure(list));
    }
    SplitDestination::List {
      list,
      item_index: document
        .child_index(list, paragraph_parent)
        .ok_or(EditError::UnsupportedStructure(paragraph_parent))?,
      new_checked: checked.map(|_| false),
    }
  } else {
    return Err(EditError::UnsupportedStructure(paragraph_parent));
  };

  wrappers_bottom_up.reverse();
  Ok(SplitPath {
    paragraph,
    destination,
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
  fn splits_plain_list_items() {
    let mut document = parse_markdown("- beforeafter");
    let list = document.children(document.root).next().unwrap().id;
    let item = document.children(list).next().unwrap().id;
    let paragraph = document.children(item).next().unwrap().id;
    let text = document.children(paragraph).next().unwrap().id;
    let selection = Selection::collapsed(SelectionPoint {
      node: text,
      offset_utf16: 6,
    });

    let inverse = build_insert_paragraph(&document, selection)
      .unwrap()
      .apply(&mut document)
      .unwrap();
    assert_eq!(to_markdown(&document), "- before\n- after");
    assert_eq!(document.children(list).count(), 2);

    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "- beforeafter");
    assert_eq!(document.children(list).count(), 1);
  }

  #[test]
  fn creates_unchecked_items_when_splitting_tasks() {
    let mut document = parse_markdown("- [x] beforeafter");
    let list = document.children(document.root).next().unwrap().id;
    let item = document.children(list).next().unwrap().id;
    let paragraph = document.children(item).next().unwrap().id;
    let text = document.children(paragraph).next().unwrap().id;
    let selection = Selection::collapsed(SelectionPoint {
      node: text,
      offset_utf16: 6,
    });

    build_insert_paragraph(&document, selection)
      .unwrap()
      .apply(&mut document)
      .unwrap();
    assert_eq!(to_markdown(&document), "- [x] before\n- [ ] after");
    let second = document.children(list).nth(1).unwrap();
    assert!(matches!(
      second.kind,
      NodeKind::Block(BlockKind::ListItem {
        checked: Some(false)
      })
    ));
  }

  #[test]
  fn splits_nested_marks_into_new_list_items() {
    let mut document = parse_markdown("- **beforeafter**");
    let list = document.children(document.root).next().unwrap().id;
    let item = document.children(list).next().unwrap().id;
    let paragraph = document.children(item).next().unwrap().id;
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
    assert_eq!(to_markdown(&document), "- **before**\n- **after**");
    assert_eq!(document.children(list).count(), 2);

    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "- **beforeafter**");
    assert_eq!(document.node(strong).unwrap().parent, Some(paragraph));
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

use std::collections::BTreeMap;

use crate::model::{
  BlockKind, DetachedSubtree, Document, InlineKind, Node, NodeId, NodeKind,
};
use crate::selection::{Selection, SelectionPoint};

use super::operation::utf16_to_byte;
use super::{EditError, Operation, Transaction, Utf16Range};

pub(crate) fn build_paste_markdown(
  document: &Document,
  selection: Selection,
  markdown: &str,
) -> Result<Transaction, EditError> {
  let Some((text, start, end)) = selection.ordered_same_node() else {
    return Err(EditError::CrossNodeSelection);
  };
  let value = text_value(document, text)?;
  utf16_to_byte(value, text, start)?;
  let end_byte = utf16_to_byte(value, text, end)?;
  if markdown.is_empty() {
    return Ok(noop(selection));
  }

  let fragment = crate::parse_markdown(markdown);
  let blocks = fragment.children(fragment.root).collect::<Vec<_>>();
  if blocks.is_empty() {
    return Ok(noop(selection));
  }
  if blocks
    .iter()
    .any(|block| !matches!(block.kind, NodeKind::Block(BlockKind::Paragraph)))
  {
    return Err(EditError::UnsupportedStructure(text));
  }

  let (block, root, block_index, text_index) = direct_root_paragraph(document, text)?;
  let suffix = value[end_byte..].to_string();
  let full_length = value.encode_utf16().count() as u32;
  let mut operations = vec![Operation::ReplaceText {
    node: text,
    range: Utf16Range::new(start, full_length),
    inserted: String::new(),
  }];

  let mut next_id = document.next_available_id().0;
  let mut groups = BTreeMap::new();
  let mut id_map = BTreeMap::new();
  let first = blocks[0];
  let first_children = first.children.clone();
  for (offset, child) in first_children.iter().copied().enumerate() {
    let subtree = clone_subtree(
      &fragment,
      child,
      &mut next_id,
      &mut groups,
      &mut id_map,
    )?;
    operations.push(Operation::InsertSubtree {
      parent: block,
      index: text_index + 1 + offset,
      subtree,
    });
  }

  let mut inserted_blocks = Vec::new();
  for (offset, pasted_block) in blocks.iter().copied().skip(1).enumerate() {
    let subtree = clone_subtree(
      &fragment,
      pasted_block.id,
      &mut next_id,
      &mut groups,
      &mut id_map,
    )?;
    inserted_blocks.push(subtree.root);
    operations.push(Operation::InsertSubtree {
      parent: root,
      index: block_index + 1 + offset,
      subtree,
    });
  }

  let last_source_text = last_text_descendant(&fragment, blocks.last().unwrap().id)
    .ok_or(EditError::UnsupportedStructure(text))?;
  let pasted_caret_node = *id_map
    .get(&last_source_text)
    .ok_or(EditError::UnsupportedStructure(last_source_text))?;
  let pasted_caret_offset = text_value(&fragment, last_source_text)?
    .encode_utf16()
    .count() as u32;

  if !suffix.is_empty() {
    let suffix_id = NodeId(next_id);
    let suffix_node = Node::new(
      suffix_id,
      NodeKind::Inline(InlineKind::Text { value: suffix }),
      None,
    );
    if let Some(last_block) = inserted_blocks.last().copied() {
      let source_last = blocks.last().unwrap();
      operations.push(Operation::InsertNode {
        parent: last_block,
        index: source_last.children.len(),
        node: suffix_node,
      });
    } else {
      operations.push(Operation::InsertNode {
        parent: block,
        index: text_index + 1 + first_children.len(),
        node: suffix_node,
      });
    }
  }

  Ok(Transaction {
    operations,
    selection_before: selection,
    selection_after: Selection::collapsed(SelectionPoint {
      node: pasted_caret_node,
      offset_utf16: pasted_caret_offset,
    }),
  })
}

fn direct_root_paragraph(
  document: &Document,
  text: NodeId,
) -> Result<(NodeId, NodeId, usize, usize), EditError> {
  let text_node = document.node(text).ok_or(EditError::NodeNotFound(text))?;
  let block = text_node.parent.ok_or(EditError::UnsupportedStructure(text))?;
  let block_node = document
    .node(block)
    .ok_or(EditError::NodeNotFound(block))?;
  if !matches!(block_node.kind, NodeKind::Block(BlockKind::Paragraph)) {
    return Err(EditError::UnsupportedStructure(block));
  }
  let root = block_node
    .parent
    .ok_or(EditError::UnsupportedStructure(block))?;
  if root != document.root {
    return Err(EditError::UnsupportedStructure(block));
  }
  let text_index = document
    .child_index(block, text)
    .ok_or(EditError::UnsupportedStructure(text))?;
  let block_index = document
    .child_index(root, block)
    .ok_or(EditError::UnsupportedStructure(block))?;
  Ok((block, root, block_index, text_index))
}

fn clone_subtree(
  source: &Document,
  root: NodeId,
  next_id: &mut u64,
  groups: &mut BTreeMap<u64, u64>,
  id_map: &mut BTreeMap<NodeId, NodeId>,
) -> Result<DetachedSubtree, EditError> {
  let mut nodes = Vec::new();
  let cloned_root = clone_node(
    source,
    root,
    None,
    next_id,
    groups,
    id_map,
    &mut nodes,
  )?;
  Ok(DetachedSubtree {
    root: cloned_root,
    nodes,
  })
}

fn clone_node(
  source: &Document,
  source_id: NodeId,
  parent: Option<NodeId>,
  next_id: &mut u64,
  groups: &mut BTreeMap<u64, u64>,
  id_map: &mut BTreeMap<NodeId, NodeId>,
  nodes: &mut Vec<Node>,
) -> Result<NodeId, EditError> {
  let source_node = source
    .node(source_id)
    .ok_or(EditError::NodeNotFound(source_id))?;
  let id = NodeId(*next_id);
  *next_id = next_id.saturating_add(1);
  id_map.insert(source_id, id);

  let kind = remap_groups(&source_node.kind, next_id, groups);
  let index = nodes.len();
  let mut node = Node::new(id, kind, None);
  node.parent = parent;
  nodes.push(node);
  let children = source_node
    .children
    .iter()
    .copied()
    .map(|child| clone_node(source, child, Some(id), next_id, groups, id_map, nodes))
    .collect::<Result<Vec<_>, _>>()?;
  nodes[index].children = children;
  Ok(id)
}

fn remap_groups(
  kind: &NodeKind,
  next_id: &mut u64,
  groups: &mut BTreeMap<u64, u64>,
) -> NodeKind {
  let NodeKind::Inline(InlineKind::MarkFragment { mark, group, edge }) = kind else {
    return kind.clone();
  };
  let mapped = *groups.entry(*group).or_insert_with(|| {
    let value = *next_id;
    *next_id = next_id.saturating_add(1);
    value
  });
  NodeKind::Inline(InlineKind::MarkFragment {
    mark: *mark,
    group: mapped,
    edge: *edge,
  })
}

fn last_text_descendant(document: &Document, root: NodeId) -> Option<NodeId> {
  let node = document.node(root)?;
  if matches!(node.kind, NodeKind::Inline(InlineKind::Text { .. })) {
    return Some(root);
  }
  node.children
    .iter()
    .rev()
    .find_map(|child| last_text_descendant(document, *child))
}

fn text_value(document: &Document, node: NodeId) -> Result<&str, EditError> {
  let node = document.node(node).ok_or(EditError::NodeNotFound(node))?;
  match &node.kind {
    NodeKind::Inline(InlineKind::Text { value }) => Ok(value),
    _ => Err(EditError::NotTextNode(node.id)),
  }
}

fn noop(selection: Selection) -> Transaction {
  Transaction {
    operations: Vec::new(),
    selection_before: selection,
    selection_after: selection,
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::to_markdown;

  fn selected(document: &Document, start: u32, end: u32) -> Selection {
    let paragraph = document.children(document.root).next().unwrap();
    let text = document.children(paragraph.id).next().unwrap().id;
    Selection {
      anchor: SelectionPoint {
        node: text,
        offset_utf16: start,
      },
      focus: SelectionPoint {
        node: text,
        offset_utf16: end,
      },
    }
  }

  fn apply(initial: &str, start: u32, end: u32, pasted: &str) -> (Document, Transaction) {
    let mut document = crate::parse_markdown(initial);
    let transaction = build_paste_markdown(&document, selected(&document, start, end), pasted)
      .unwrap();
    let inverse = transaction.apply(&mut document).unwrap();
    (document, inverse)
  }

  #[test]
  fn pastes_plain_text_at_a_collapsed_caret() {
    let (document, _) = apply("alpha", 2, 2, "XYZ");
    assert_eq!(to_markdown(&document), "alXYZpha");
  }

  #[test]
  fn replaces_a_selected_range() {
    let (document, _) = apply("alpha", 1, 4, "X");
    assert_eq!(to_markdown(&document), "aXa");
  }

  #[test]
  fn merges_multiline_paragraphs_with_prefix_and_suffix() {
    let (document, _) = apply("alpha", 2, 2, "one\n\ntwo");
    assert_eq!(to_markdown(&document), "alone\n\ntwopha");
  }

  #[test]
  fn preserves_inline_markdown_and_undoes_exactly() {
    let (mut document, inverse) = apply("alpha", 2, 2, "**bold** and *soft*");
    assert_eq!(to_markdown(&document), "al**bold** and *soft*pha");
    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "alpha");
  }
}

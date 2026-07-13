use crate::model::{Document, InlineKind, NodeId, NodeKind};
use crate::selection::Selection;

use super::{EditError, Operation, Transaction};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MarkCommand {
  ToggleStrong,
  ToggleEmphasis,
  ToggleStrike,
}

impl MarkCommand {
  pub fn build(
    self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    if let Some(wrapper) = selected_mark_ancestor(document, selection, self)? {
      return build_unwrap_ancestor(document, selection, wrapper);
    }
    self.generic().build(document, selection)
  }

  fn generic(self) -> super::mark::MarkCommand {
    match self {
      Self::ToggleStrong => super::mark::MarkCommand::ToggleStrong,
      Self::ToggleEmphasis => super::mark::MarkCommand::ToggleEmphasis,
      Self::ToggleStrike => super::mark::MarkCommand::ToggleStrike,
    }
  }
}

fn selected_mark_ancestor(
  document: &Document,
  selection: Selection,
  command: MarkCommand,
) -> Result<Option<NodeId>, EditError> {
  let Some((text, start, end)) = selection.ordered_same_node() else {
    return Ok(None);
  };
  if start == end {
    return Ok(None);
  }

  let mut current = text;
  loop {
    let node = document
      .node(current)
      .ok_or(EditError::NodeNotFound(current))?;
    let Some(parent) = node.parent else {
      return Ok(None);
    };
    let parent_node = document
      .node(parent)
      .ok_or(EditError::NodeNotFound(parent))?;
    match &parent_node.kind {
      NodeKind::Inline(kind) if matches_command(kind, command) => return Ok(Some(parent)),
      NodeKind::Inline(_) => current = parent,
      NodeKind::Block(_) | NodeKind::Document => return Ok(None),
    }
  }
}

fn matches_command(kind: &InlineKind, command: MarkCommand) -> bool {
  matches!(
    (kind, command),
    (InlineKind::Strong, MarkCommand::ToggleStrong)
      | (InlineKind::Emphasis, MarkCommand::ToggleEmphasis)
      | (InlineKind::Strike, MarkCommand::ToggleStrike)
  )
}

fn build_unwrap_ancestor(
  document: &Document,
  selection: Selection,
  wrapper: NodeId,
) -> Result<Transaction, EditError> {
  let wrapper_node = document
    .node(wrapper)
    .ok_or(EditError::NodeNotFound(wrapper))?;
  let parent = wrapper_node
    .parent
    .ok_or(EditError::UnsupportedStructure(wrapper))?;
  let index = document
    .child_index(parent, wrapper)
    .ok_or(EditError::UnsupportedStructure(wrapper))?;
  let children = wrapper_node.children.clone();

  let mut operations = children
    .into_iter()
    .enumerate()
    .map(|(offset, node)| Operation::MoveNode {
      node,
      new_parent: parent,
      new_index: index + offset,
    })
    .collect::<Vec<_>>();
  operations.push(Operation::RemoveNode { node: wrapper });

  Ok(Transaction {
    operations,
    selection_before: selection,
    selection_after: selection,
  })
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::model::Node;
  use crate::selection::SelectionPoint;
  use crate::{parse_markdown, to_markdown};

  fn first_text(document: &Document) -> &Node {
    document
      .nodes
      .values()
      .find(|node| matches!(node.kind, NodeKind::Inline(InlineKind::Text { .. })))
      .unwrap()
  }

  fn selection(document: &Document, start: u32, end: u32) -> Selection {
    let text = first_text(document).id;
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

  #[test]
  fn unwraps_the_whole_strong_ancestor_for_a_partial_selection() {
    let mut document = parse_markdown("**alpha**");
    let transaction = MarkCommand::ToggleStrong
      .build(&document, selection(&document, 1, 4))
      .unwrap();
    let inverse = transaction.apply(&mut document).unwrap();

    assert_eq!(to_markdown(&document), "alpha");
    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "**alpha**");
  }

  #[test]
  fn unwraps_a_nested_emphasis_ancestor_without_removing_strong() {
    let mut document = parse_markdown("***alpha***");
    let transaction = MarkCommand::ToggleEmphasis
      .build(&document, selection(&document, 0, 5))
      .unwrap();
    let inverse = transaction.apply(&mut document).unwrap();

    assert_eq!(to_markdown(&document), "**alpha**");
    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "***alpha***");
  }

  #[test]
  fn falls_back_to_the_generic_builder_for_plain_text() {
    let mut document = parse_markdown("alpha");
    MarkCommand::ToggleEmphasis
      .build(&document, selection(&document, 1, 4))
      .unwrap()
      .apply(&mut document)
      .unwrap();

    assert_eq!(to_markdown(&document), "a*lph*a");
  }
}

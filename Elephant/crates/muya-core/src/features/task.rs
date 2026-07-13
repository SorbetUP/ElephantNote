use std::collections::BTreeMap;

use crate::edit::{EditError, Operation, Transaction};
use crate::model::{BlockKind, Document, InlineKind, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TaskCommand {
  SetChecked {
    item: NodeId,
    checked: bool,
    auto_check: bool,
  },
}

impl TaskCommand {
  pub fn build(
    self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    let Self::SetChecked {
      item,
      checked,
      auto_check,
    } = self;
    task_state(document, item)?.ok_or(EditError::UnsupportedStructure(item))?;

    let mut desired = BTreeMap::new();
    desired.insert(item, checked);
    if auto_check {
      let mut descendants = Vec::new();
      task_descendants(document, item, &mut descendants)?;
      for descendant in descendants {
        desired.insert(descendant, checked);
      }
      update_ancestors(document, item, &mut desired)?;
    }

    let operations = desired
      .into_iter()
      .filter_map(|(node, next)| match task_state(document, node) {
        Ok(Some(current)) if current != next => Some(Ok(Operation::SetBlockKind {
          node,
          kind: BlockKind::ListItem {
            checked: Some(next),
          },
        })),
        Ok(Some(_)) => None,
        Ok(None) => Some(Err(EditError::UnsupportedStructure(node))),
        Err(error) => Some(Err(error)),
      })
      .collect::<Result<Vec<_>, _>>()?;
    let selection_after = first_text_descendant(document, item)
      .map(|node| Selection::collapsed(SelectionPoint { node, offset_utf16: 0 }))
      .unwrap_or(selection);

    Ok(Transaction {
      operations,
      selection_before: selection,
      selection_after,
    })
  }
}

fn update_ancestors(
  document: &Document,
  item: NodeId,
  desired: &mut BTreeMap<NodeId, bool>,
) -> Result<(), EditError> {
  let mut current = parent_task_item(document, item)?;
  while let Some(parent) = current {
    let children = immediate_task_children(document, parent)?;
    if children.is_empty() {
      break;
    }
    let checked = children
      .into_iter()
      .all(|child| desired.get(&child).copied().unwrap_or(false));
    desired.insert(parent, checked);
    current = parent_task_item(document, parent)?;
  }
  Ok(())
}

fn task_descendants(
  document: &Document,
  root: NodeId,
  output: &mut Vec<NodeId>,
) -> Result<(), EditError> {
  let node = document.node(root).ok_or(EditError::NodeNotFound(root))?;
  for child in &node.children {
    if task_state(document, *child)?.is_some() {
      output.push(*child);
    }
    task_descendants(document, *child, output)?;
  }
  Ok(())
}

fn immediate_task_children(
  document: &Document,
  item: NodeId,
) -> Result<Vec<NodeId>, EditError> {
  let node = document.node(item).ok_or(EditError::NodeNotFound(item))?;
  let mut children = Vec::new();
  for child in &node.children {
    let nested = document.node(*child).ok_or(EditError::NodeNotFound(*child))?;
    if !matches!(nested.kind, NodeKind::Block(BlockKind::List { .. })) {
      continue;
    }
    children.extend(
      nested
        .children
        .iter()
        .copied()
        .filter(|candidate| matches!(task_state(document, *candidate), Ok(Some(_)))),
    );
  }
  Ok(children)
}

fn parent_task_item(
  document: &Document,
  item: NodeId,
) -> Result<Option<NodeId>, EditError> {
  let list = document
    .node(item)
    .ok_or(EditError::NodeNotFound(item))?
    .parent
    .ok_or(EditError::UnsupportedStructure(item))?;
  let owner = document
    .node(list)
    .ok_or(EditError::NodeNotFound(list))?
    .parent;
  Ok(owner.filter(|candidate| matches!(task_state(document, *candidate), Ok(Some(_)))))
}

fn task_state(document: &Document, item: NodeId) -> Result<Option<bool>, EditError> {
  let node = document.node(item).ok_or(EditError::NodeNotFound(item))?;
  match &node.kind {
    NodeKind::Block(BlockKind::ListItem { checked }) => Ok(*checked),
    _ => Ok(None),
  }
}

fn first_text_descendant(document: &Document, root: NodeId) -> Option<NodeId> {
  let node = document.node(root)?;
  if matches!(node.kind, NodeKind::Inline(InlineKind::Text { .. })) {
    return Some(root);
  }
  node.children
    .iter()
    .find_map(|child| first_text_descendant(document, *child))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::to_markdown;

  fn task_items(document: &Document) -> Vec<NodeId> {
    document
      .nodes
      .values()
      .filter_map(|node| task_state(document, node.id).ok().flatten().map(|_| node.id))
      .collect()
  }

  #[test]
  fn toggles_one_task_and_restores_it() {
    let mut document = crate::parse_markdown("- [ ] alpha");
    let item = task_items(&document)[0];
    let text = first_text_descendant(&document, item).unwrap();
    let selection = Selection::collapsed(SelectionPoint { node: text, offset_utf16: 3 });
    let transaction = TaskCommand::SetChecked {
      item,
      checked: true,
      auto_check: false,
    }
    .build(&document, selection)
    .unwrap();
    let inverse = transaction.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "- [x] alpha");
    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "- [ ] alpha");
  }

  #[test]
  fn cascades_to_descendants_and_recomputes_parents() {
    let mut document = crate::parse_markdown("- [ ] parent\n  - [ ] child");
    let items = task_items(&document);
    let parent = items[0];
    let child = items[1];
    let selection = Selection::collapsed(SelectionPoint {
      node: first_text_descendant(&document, parent).unwrap(),
      offset_utf16: 0,
    });
    TaskCommand::SetChecked {
      item: parent,
      checked: true,
      auto_check: true,
    }
    .build(&document, selection)
    .unwrap()
    .apply(&mut document)
    .unwrap();
    assert_eq!(to_markdown(&document), "- [x] parent\n  - [x] child");

    TaskCommand::SetChecked {
      item: child,
      checked: false,
      auto_check: true,
    }
    .build(&document, selection)
    .unwrap()
    .apply(&mut document)
    .unwrap();
    assert_eq!(to_markdown(&document), "- [ ] parent\n  - [ ] child");
  }
}

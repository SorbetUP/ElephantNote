use crate::edit::{Operation, Utf16Range};
use crate::model::{BlockKind, Node, NodeId};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ViewPatch {
  ReplaceText {
    node: NodeId,
    range: Utf16Range,
    inserted: String,
  },
  InsertNode {
    parent: NodeId,
    index: usize,
    node: Node,
  },
  RemoveNode {
    node: NodeId,
  },
  SetBlockKind {
    node: NodeId,
    kind: BlockKind,
  },
}

impl ViewPatch {
  pub fn from_operation(operation: &Operation) -> Self {
    match operation {
      Operation::ReplaceText {
        node,
        range,
        inserted,
      } => Self::ReplaceText {
        node: *node,
        range: *range,
        inserted: inserted.clone(),
      },
      Operation::InsertNode {
        parent,
        index,
        node,
      } => Self::InsertNode {
        parent: *parent,
        index: *index,
        node: node.clone(),
      },
      Operation::RemoveNode { node } => Self::RemoveNode { node: *node },
      Operation::SetBlockKind { node, kind } => Self::SetBlockKind {
        node: *node,
        kind: kind.clone(),
      },
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::model::BlockKind;

  #[test]
  fn mirrors_operations_without_document_access() {
    let operation = Operation::SetBlockKind {
      node: NodeId(7),
      kind: BlockKind::Heading { level: 3 },
    };
    assert_eq!(
      ViewPatch::from_operation(&operation),
      ViewPatch::SetBlockKind {
        node: NodeId(7),
        kind: BlockKind::Heading { level: 3 },
      }
    );
  }
}

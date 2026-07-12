use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::{Node, NodeId, NodeKind, SourceRange};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Document {
  pub root: NodeId,
  pub nodes: BTreeMap<NodeId, Node>,
  pub revision: u64,
  next_id: u64,
}

impl Default for Document {
  fn default() -> Self {
    Self::new()
  }
}

impl Document {
  pub fn new() -> Self {
    let root = NodeId(1);
    let mut nodes = BTreeMap::new();
    nodes.insert(root, Node::new(root, NodeKind::Document, None));
    Self {
      root,
      nodes,
      revision: 0,
      next_id: 2,
    }
  }

  pub fn allocate(&mut self, kind: NodeKind, source: Option<SourceRange>) -> NodeId {
    let id = NodeId(self.next_id);
    self.next_id += 1;
    self.nodes.insert(id, Node::new(id, kind, source));
    id
  }

  pub fn next_available_id(&self) -> NodeId {
    NodeId(self.next_id)
  }

  pub fn append_child(&mut self, parent: NodeId, child: NodeId) {
    self
      .nodes
      .get_mut(&child)
      .expect("child node must exist")
      .parent = Some(parent);
    self
      .nodes
      .get_mut(&parent)
      .expect("parent node must exist")
      .children
      .push(child);
  }

  pub fn insert_detached_node(
    &mut self,
    parent: NodeId,
    index: usize,
    mut node: Node,
  ) -> bool {
    if self.nodes.contains_key(&node.id) || !node.children.is_empty() {
      return false;
    }
    let Some(parent_node) = self.nodes.get(&parent) else {
      return false;
    };
    if index > parent_node.children.len() {
      return false;
    }

    node.parent = Some(parent);
    let id = node.id;
    self.nodes.insert(id, node);
    self
      .nodes
      .get_mut(&parent)
      .expect("validated parent must exist")
      .children
      .insert(index, id);
    self.next_id = self.next_id.max(id.0.saturating_add(1));
    true
  }

  pub fn remove_leaf_node(&mut self, node_id: NodeId) -> Option<(Node, NodeId, usize)> {
    if node_id == self.root {
      return None;
    }
    let node = self.nodes.get(&node_id)?;
    if !node.children.is_empty() {
      return None;
    }
    let parent = node.parent?;
    let index = self
      .nodes
      .get(&parent)?
      .children
      .iter()
      .position(|child| *child == node_id)?;

    self.nodes.get_mut(&parent)?.children.remove(index);
    let mut removed = self.nodes.remove(&node_id)?;
    removed.parent = None;
    Some((removed, parent, index))
  }

  pub fn child_index(&self, parent: NodeId, child: NodeId) -> Option<usize> {
    self
      .nodes
      .get(&parent)?
      .children
      .iter()
      .position(|candidate| *candidate == child)
  }

  pub fn previous_sibling(&self, node_id: NodeId) -> Option<&Node> {
    let node = self.node(node_id)?;
    let parent = node.parent?;
    let index = self.child_index(parent, node_id)?;
    index
      .checked_sub(1)
      .and_then(|previous| self.nodes.get(&self.nodes.get(&parent)?.children[previous]))
  }

  pub fn invalidate_source_chain(&mut self, mut node_id: NodeId) {
    while let Some(node) = self.nodes.get_mut(&node_id) {
      node.source = None;
      let Some(parent) = node.parent else {
        break;
      };
      node_id = parent;
    }
  }

  pub fn node(&self, id: NodeId) -> Option<&Node> {
    self.nodes.get(&id)
  }

  pub fn node_mut(&mut self, id: NodeId) -> Option<&mut Node> {
    self.nodes.get_mut(&id)
  }

  pub fn children(&self, id: NodeId) -> impl Iterator<Item = &Node> {
    self
      .nodes
      .get(&id)
      .into_iter()
      .flat_map(|node| node.children.iter())
      .filter_map(|child| self.nodes.get(child))
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::model::{BlockKind, InlineKind};

  #[test]
  fn inserts_and_removes_stable_leaf_nodes() {
    let mut document = Document::new();
    let paragraph = Node::new(
      document.next_available_id(),
      NodeKind::Block(BlockKind::Paragraph),
      None,
    );
    assert!(document.insert_detached_node(document.root, 0, paragraph.clone()));

    let text = Node::new(
      NodeId(paragraph.id.0 + 1),
      NodeKind::Inline(InlineKind::Text {
        value: "hello".to_string(),
      }),
      None,
    );
    assert!(document.insert_detached_node(paragraph.id, 0, text.clone()));
    assert_eq!(document.next_available_id(), NodeId(text.id.0 + 1));

    let (removed_text, parent, index) = document.remove_leaf_node(text.id).unwrap();
    assert_eq!((parent, index), (paragraph.id, 0));
    assert_eq!(removed_text.id, text.id);
    assert!(document.remove_leaf_node(paragraph.id).is_some());
  }
}

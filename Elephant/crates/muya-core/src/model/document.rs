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
    Self { root, nodes, revision: 0, next_id: 2 }
  }

  pub fn allocate(&mut self, kind: NodeKind, source: Option<SourceRange>) -> NodeId {
    let id = NodeId(self.next_id);
    self.next_id += 1;
    self.nodes.insert(id, Node::new(id, kind, source));
    id
  }

  pub fn append_child(&mut self, parent: NodeId, child: NodeId) {
    self.nodes.get_mut(&child).expect("child node must exist").parent = Some(parent);
    self.nodes.get_mut(&parent).expect("parent node must exist").children.push(child);
  }

  pub fn node(&self, id: NodeId) -> Option<&Node> {
    self.nodes.get(&id)
  }

  pub fn children(&self, id: NodeId) -> impl Iterator<Item = &Node> {
    self.nodes
      .get(&id)
      .into_iter()
      .flat_map(|node| node.children.iter())
      .filter_map(|child| self.nodes.get(child))
  }
}

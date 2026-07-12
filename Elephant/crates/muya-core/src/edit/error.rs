use std::fmt;

use crate::model::NodeId;

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EditError {
  NodeNotFound(NodeId),
  NotTextNode(NodeId),
  NonCollapsedSelection,
  InvalidUtf16Boundary { node: NodeId, offset: u32 },
  RangeOutOfBounds { node: NodeId, start: u32, end: u32 },
}

impl fmt::Display for EditError {
  fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    match self {
      Self::NodeNotFound(node) => write!(formatter, "node {node:?} was not found"),
      Self::NotTextNode(node) => write!(formatter, "node {node:?} is not an editable text node"),
      Self::NonCollapsedSelection => write!(formatter, "the command requires a collapsed selection"),
      Self::InvalidUtf16Boundary { node, offset } => {
        write!(formatter, "offset {offset} is not a UTF-16 boundary in node {node:?}")
      }
      Self::RangeOutOfBounds { node, start, end } => {
        write!(formatter, "range {start}..{end} is outside node {node:?}")
      }
    }
  }
}

impl std::error::Error for EditError {}

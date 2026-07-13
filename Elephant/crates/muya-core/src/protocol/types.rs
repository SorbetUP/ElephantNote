use serde::{Deserialize, Serialize};

use crate::model::{Node, NodeId};
use crate::selection::Selection;
use crate::view::ViewPatch;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct EditorRequest {
  pub protocol_version: u16,
  pub expected_revision: u64,
  pub command: ProtocolCommand,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ProtocolCommand {
  Snapshot,
  SetSelection { selection: Selection },
  InsertText { text: String },
  PasteMarkdown { markdown: String },
  InsertParagraph,
  DeleteBackward,
  SetParagraph,
  SetHeading { level: u8 },
  ToggleStrong,
  ToggleEmphasis,
  ToggleStrike,
  IndentListItem,
  OutdentListItem,
  InsertTableRowAfter,
  DeleteTableRow,
  InsertTableColumnAfter,
  DeleteTableColumn,
  NextTableCell,
  PreviousTableCell,
  BeginComposition,
  UpdateComposition { text: String },
  CommitComposition,
  CancelComposition,
  Undo,
  Redo,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "snake_case")]
pub enum EditorResponse {
  Snapshot(ProtocolSnapshot),
  Update(ProtocolUpdate),
  Error(ProtocolError),
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ProtocolDocument {
  pub root: NodeId,
  pub nodes: Vec<Node>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ProtocolSnapshot {
  pub markdown: String,
  pub document: ProtocolDocument,
  pub revision: u64,
  pub selection: Selection,
  pub can_undo: bool,
  pub can_redo: bool,
  pub composition_active: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ProtocolUpdate {
  pub revision: u64,
  pub selection: Selection,
  pub patches: Vec<ViewPatch>,
  pub can_undo: bool,
  pub can_redo: bool,
  pub composition_active: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct ProtocolError {
  pub code: ProtocolErrorCode,
  pub message: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProtocolErrorCode {
  UnsupportedProtocolVersion,
  NodeNotFound,
  NodeAlreadyExists,
  NodeHasChildren,
  NotTextNode,
  NonCollapsedSelection,
  CrossNodeSelection,
  InvalidHeadingLevel,
  UnsupportedStructure,
  InvalidChildIndex,
  InvalidUtf16Boundary,
  RangeOutOfBounds,
  RevisionMismatch,
}

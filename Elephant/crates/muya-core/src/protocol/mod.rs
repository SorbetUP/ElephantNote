use serde::{Deserialize, Serialize};

use crate::edit::{
  Command, EditError, GraphemeCommand, MarkCommand, ParagraphBoundaryCommand,
  PasteCommand,
};
use crate::features::{ListCommand, TableCommand, TableNavigationCommand};
use crate::model::{Document, Node, NodeId};
use crate::selection::Selection;
use crate::session::{EditorSession, SessionCommand, SessionUpdate};
use crate::view::ViewPatch;

pub const EDITOR_PROTOCOL_VERSION: u16 = 1;

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

impl ProtocolDocument {
  pub fn from_document(document: &Document) -> Self {
    let mut nodes = Vec::with_capacity(document.nodes.len());
    append_preorder(document, document.root, &mut nodes);
    Self {
      root: document.root,
      nodes,
    }
  }
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

impl ProtocolSnapshot {
  pub fn from_session(session: &EditorSession) -> Self {
    let snapshot = session.snapshot();
    Self {
      markdown: snapshot.markdown,
      document: ProtocolDocument::from_document(session.document()),
      revision: snapshot.revision,
      selection: snapshot.selection,
      can_undo: snapshot.can_undo,
      can_redo: snapshot.can_redo,
      composition_active: snapshot.composition_active,
    }
  }
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

impl EditorSession {
  pub fn handle_request(&mut self, request: EditorRequest) -> EditorResponse {
    if request.protocol_version != EDITOR_PROTOCOL_VERSION {
      return EditorResponse::Error(ProtocolError {
        code: ProtocolErrorCode::UnsupportedProtocolVersion,
        message: format!(
          "unsupported editor protocol version {}; expected {}",
          request.protocol_version, EDITOR_PROTOCOL_VERSION
        ),
      });
    }

    let revision = request.expected_revision;
    match request.command {
      ProtocolCommand::Snapshot => {
        EditorResponse::Snapshot(ProtocolSnapshot::from_session(self))
      }
      ProtocolCommand::SetSelection { selection } => {
        response(self.set_selection(revision, selection))
      }
      ProtocolCommand::InsertParagraph => {
        let result = self.dispatch(
          revision,
          SessionCommand::Core(Command::InsertParagraph),
        );
        match result {
          Err(EditError::UnsupportedStructure(_)) => response(self.dispatch(
            revision,
            SessionCommand::ParagraphBoundary(
              ParagraphBoundaryCommand::InsertParagraph,
            ),
          )),
          other => response(other),
        }
      }
      command => response(self.dispatch(revision, to_session_command(command))),
    }
  }
}

fn append_preorder(document: &Document, node_id: NodeId, output: &mut Vec<Node>) {
  let Some(node) = document.node(node_id) else {
    return;
  };
  output.push(node.clone());
  for child in &node.children {
    append_preorder(document, *child, output);
  }
}

fn to_session_command(command: ProtocolCommand) -> SessionCommand {
  match command {
    ProtocolCommand::InsertText { text } => {
      SessionCommand::Core(Command::InsertText(text))
    }
    ProtocolCommand::PasteMarkdown { markdown } => {
      SessionCommand::Paste(PasteCommand::new(markdown))
    }
    ProtocolCommand::DeleteBackward => {
      SessionCommand::Grapheme(GraphemeCommand::DeleteBackward)
    }
    ProtocolCommand::SetParagraph => SessionCommand::Core(Command::SetParagraph),
    ProtocolCommand::SetHeading { level } => {
      SessionCommand::Core(Command::SetHeading(level))
    }
    ProtocolCommand::ToggleStrong => {
      SessionCommand::Mark(MarkCommand::ToggleStrong)
    }
    ProtocolCommand::ToggleEmphasis => {
      SessionCommand::Mark(MarkCommand::ToggleEmphasis)
    }
    ProtocolCommand::ToggleStrike => {
      SessionCommand::Mark(MarkCommand::ToggleStrike)
    }
    ProtocolCommand::IndentListItem => {
      SessionCommand::List(ListCommand::IndentItem)
    }
    ProtocolCommand::OutdentListItem => {
      SessionCommand::List(ListCommand::OutdentItem)
    }
    ProtocolCommand::InsertTableRowAfter => {
      SessionCommand::Table(TableCommand::InsertRowAfter)
    }
    ProtocolCommand::DeleteTableRow => {
      SessionCommand::Table(TableCommand::DeleteRow)
    }
    ProtocolCommand::InsertTableColumnAfter => {
      SessionCommand::Table(TableCommand::InsertColumnAfter)
    }
    ProtocolCommand::DeleteTableColumn => {
      SessionCommand::Table(TableCommand::DeleteColumn)
    }
    ProtocolCommand::NextTableCell => {
      SessionCommand::TableNavigation(TableNavigationCommand::NextCell)
    }
    ProtocolCommand::PreviousTableCell => {
      SessionCommand::TableNavigation(TableNavigationCommand::PreviousCell)
    }
    ProtocolCommand::BeginComposition => SessionCommand::BeginComposition,
    ProtocolCommand::UpdateComposition { text } => {
      SessionCommand::UpdateComposition(text)
    }
    ProtocolCommand::CommitComposition => SessionCommand::CommitComposition,
    ProtocolCommand::CancelComposition => SessionCommand::CancelComposition,
    ProtocolCommand::Undo => SessionCommand::Undo,
    ProtocolCommand::Redo => SessionCommand::Redo,
    ProtocolCommand::Snapshot
    | ProtocolCommand::SetSelection { .. }
    | ProtocolCommand::InsertParagraph => {
      unreachable!("handled before command conversion")
    }
  }
}

fn response(result: Result<SessionUpdate, EditError>) -> EditorResponse {
  match result {
    Ok(update) => EditorResponse::Update(update.into()),
    Err(error) => EditorResponse::Error(error.into()),
  }
}

impl From<SessionUpdate> for ProtocolUpdate {
  fn from(update: SessionUpdate) -> Self {
    Self {
      revision: update.revision,
      selection: update.selection,
      patches: update.patches,
      can_undo: update.can_undo,
      can_redo: update.can_redo,
      composition_active: update.composition_active,
    }
  }
}

impl From<EditError> for ProtocolError {
  fn from(error: EditError) -> Self {
    let code = match error {
      EditError::NodeNotFound(_) => ProtocolErrorCode::NodeNotFound,
      EditError::NodeAlreadyExists(_) => ProtocolErrorCode::NodeAlreadyExists,
      EditError::NodeHasChildren(_) => ProtocolErrorCode::NodeHasChildren,
      EditError::NotTextNode(_) => ProtocolErrorCode::NotTextNode,
      EditError::NonCollapsedSelection => ProtocolErrorCode::NonCollapsedSelection,
      EditError::CrossNodeSelection => ProtocolErrorCode::CrossNodeSelection,
      EditError::InvalidHeadingLevel(_) => ProtocolErrorCode::InvalidHeadingLevel,
      EditError::UnsupportedStructure(_) => ProtocolErrorCode::UnsupportedStructure,
      EditError::InvalidChildIndex { .. } => ProtocolErrorCode::InvalidChildIndex,
      EditError::InvalidUtf16Boundary { .. } => {
        ProtocolErrorCode::InvalidUtf16Boundary
      }
      EditError::RangeOutOfBounds { .. } => ProtocolErrorCode::RangeOutOfBounds,
      EditError::RevisionMismatch { .. } => ProtocolErrorCode::RevisionMismatch,
    };
    Self {
      code,
      message: error.to_string(),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::model::{InlineKind, NodeKind};
  use crate::selection::SelectionPoint;

  fn request(revision: u64, command: ProtocolCommand) -> EditorRequest {
    EditorRequest {
      protocol_version: EDITOR_PROTOCOL_VERSION,
      expected_revision: revision,
      command,
    }
  }

  fn first_text(document: &crate::Document, root: NodeId) -> NodeId {
    let mut stack = vec![root];
    while let Some(current) = stack.pop() {
      let node = document.node(current).unwrap();
      if matches!(node.kind, NodeKind::Inline(InlineKind::Text { .. })) {
        return current;
      }
      stack.extend(node.children.iter().rev().copied());
    }
    panic!("text node not found")
  }

  #[test]
  fn serializes_a_stable_versioned_request() {
    let value = serde_json::to_value(request(
      7,
      ProtocolCommand::InsertText { text: "x".into() },
    ))
    .unwrap();
    assert_eq!(value["protocol_version"], 1);
    assert_eq!(value["expected_revision"], 7);
    assert_eq!(value["command"]["type"], "insert_text");
  }

  #[test]
  fn snapshots_include_a_preorder_logical_tree() {
    let session = EditorSession::from_markdown("**bold** and *soft*");
    let snapshot = ProtocolSnapshot::from_session(&session);
    assert_eq!(snapshot.document.nodes.first().unwrap().id, snapshot.document.root);
    assert_eq!(snapshot.document.nodes.len(), session.document().nodes.len());

    let positions = snapshot
      .document
      .nodes
      .iter()
      .enumerate()
      .map(|(index, node)| (node.id, index))
      .collect::<std::collections::BTreeMap<_, _>>();
    for node in &snapshot.document.nodes {
      for child in &node.children {
        assert!(positions[&node.id] < positions[child]);
      }
    }
  }

  #[test]
  fn rejects_unknown_protocol_versions_without_mutation() {
    let mut session = EditorSession::from_markdown("abc");
    let response = session.handle_request(EditorRequest {
      protocol_version: 99,
      expected_revision: 0,
      command: ProtocolCommand::InsertText { text: "x".into() },
    });
    assert!(matches!(
      response,
      EditorResponse::Error(ProtocolError {
        code: ProtocolErrorCode::UnsupportedProtocolVersion,
        ..
      })
    ));
    assert_eq!(session.snapshot().markdown, "abc");
  }

  #[test]
  fn returns_serializable_patches_for_edits() {
    let mut session = EditorSession::from_markdown("abc");
    let response = session.handle_request(request(
      0,
      ProtocolCommand::InsertText { text: "x".into() },
    ));
    let EditorResponse::Update(update) = response else {
      panic!("expected an update response");
    };
    assert_eq!(update.revision, 1);
    assert_eq!(update.patches.len(), 1);
    let json = serde_json::to_value(update).unwrap();
    assert_eq!(json["patches"][0]["type"], "replace_text");
    assert_eq!(session.snapshot().markdown, "xabc");
  }

  #[test]
  fn routes_markdown_paste_through_one_revisioned_update() {
    let mut session = EditorSession::from_markdown("alpha");
    let text = first_text(session.document(), session.document().root);
    session
      .handle_request(request(
        0,
        ProtocolCommand::SetSelection {
          selection: Selection::collapsed(SelectionPoint {
            node: text,
            offset_utf16: 2,
          }),
        },
      ));
    let response = session.handle_request(request(
      0,
      ProtocolCommand::PasteMarkdown {
        markdown: "one\n\ntwo".into(),
      },
    ));
    let EditorResponse::Update(update) = response else {
      panic!("expected an update response");
    };
    assert_eq!(update.revision, 1);
    assert_eq!(session.snapshot().markdown, "alone\n\ntwopha");
  }

  #[test]
  fn routes_mark_boundary_enter_to_the_boundary_engine() {
    let mut session = EditorSession::from_markdown("before**bold**after");
    let block = session
      .document()
      .children(session.document().root)
      .next()
      .unwrap()
      .id;
    let wrapper = session.document().children(block).nth(1).unwrap().id;
    let text = first_text(session.document(), wrapper);
    let selection = Selection::collapsed(SelectionPoint {
      node: text,
      offset_utf16: 0,
    });
    let response = session.handle_request(request(
      0,
      ProtocolCommand::SetSelection { selection },
    ));
    assert!(matches!(response, EditorResponse::Update(_)));

    let response = session.handle_request(request(0, ProtocolCommand::InsertParagraph));
    assert!(matches!(response, EditorResponse::Update(_)));
    assert_eq!(session.snapshot().markdown, "before\n\n**bold**after");
  }

  #[test]
  fn maps_stale_revisions_to_a_stable_error_code() {
    let mut session = EditorSession::from_markdown("abc");
    let response = session.handle_request(request(4, ProtocolCommand::Undo));
    assert!(matches!(
      response,
      EditorResponse::Error(ProtocolError {
        code: ProtocolErrorCode::RevisionMismatch,
        ..
      })
    ));
  }
}

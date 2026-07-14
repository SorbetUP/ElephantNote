use super::*;
use crate::model::{InlineKind, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};
use crate::session::EditorSession;

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
  let value =
    serde_json::to_value(request(7, ProtocolCommand::InsertText { text: "x".into() })).unwrap();
  assert_eq!(value["protocol_version"], 1);
  assert_eq!(value["expected_revision"], 7);
  assert_eq!(value["command"]["type"], "insert_text");
}

#[test]
fn snapshots_include_a_preorder_logical_tree() {
  let session = EditorSession::from_markdown("**bold** and *soft*");
  let snapshot = ProtocolSnapshot::from_session(&session);
  assert_eq!(
    snapshot.document.nodes.first().unwrap().id,
    snapshot.document.root
  );
  assert_eq!(
    snapshot.document.nodes.len(),
    session.document().nodes.len()
  );

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
  let response =
    session.handle_request(request(0, ProtocolCommand::InsertText { text: "x".into() }));
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
  session.handle_request(request(
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
  let response = session.handle_request(request(0, ProtocolCommand::SetSelection { selection }));
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

use crate::edit::{
  Command, EditError, GraphemeCommand, MarkCommand, ParagraphBoundaryCommand,
  PasteCommand, Transaction,
};
use crate::features::{ListCommand, TableCommand, TableNavigationCommand};
use crate::history::{History, HistoryStep};
use crate::model::{BlockKind, Document, InlineKind, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};
use crate::view::ViewPatch;
use crate::{parse_markdown, to_markdown};

#[derive(Clone, Debug)]
pub enum SessionCommand {
  Core(Command),
  Grapheme(GraphemeCommand),
  Mark(MarkCommand),
  Paste(PasteCommand),
  ParagraphBoundary(ParagraphBoundaryCommand),
  List(ListCommand),
  Table(TableCommand),
  TableNavigation(TableNavigationCommand),
  BeginComposition,
  UpdateComposition(String),
  CommitComposition,
  CancelComposition,
  Undo,
  Redo,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionSnapshot {
  pub markdown: String,
  pub revision: u64,
  pub selection: Selection,
  pub can_undo: bool,
  pub can_redo: bool,
  pub composition_active: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SessionUpdate {
  pub revision: u64,
  pub selection: Selection,
  pub patches: Vec<ViewPatch>,
  pub can_undo: bool,
  pub can_redo: bool,
  pub composition_active: bool,
}

#[derive(Clone, Debug)]
pub struct EditorSession {
  document: Document,
  selection: Selection,
  history: History,
}

impl EditorSession {
  pub fn from_markdown(markdown: &str) -> Self {
    Self::with_history_limit(markdown, 500)
  }

  pub fn with_history_limit(markdown: &str, max_history_entries: usize) -> Self {
    let mut document = parse_markdown(markdown);
    let text = ensure_editable_text(&mut document);
    Self {
      document,
      selection: Selection::collapsed(SelectionPoint {
        node: text,
        offset_utf16: 0,
      }),
      history: History::new(max_history_entries),
    }
  }

  pub fn document(&self) -> &Document {
    &self.document
  }

  pub fn selection(&self) -> Selection {
    self.selection
  }

  pub fn snapshot(&self) -> SessionSnapshot {
    SessionSnapshot {
      markdown: to_markdown(&self.document),
      revision: self.document.revision,
      selection: self.selection,
      can_undo: self.history.can_undo(),
      can_redo: self.history.can_redo(),
      composition_active: self.history.is_group_active(),
    }
  }

  pub fn set_selection(
    &mut self,
    expected_revision: u64,
    selection: Selection,
  ) -> Result<SessionUpdate, EditError> {
    self.ensure_revision(expected_revision)?;
    validate_selection(&self.document, selection)?;
    self.selection = selection;
    Ok(self.update(Vec::new()))
  }

  pub fn dispatch(
    &mut self,
    expected_revision: u64,
    command: SessionCommand,
  ) -> Result<SessionUpdate, EditError> {
    self.ensure_revision(expected_revision)?;
    match command {
      SessionCommand::BeginComposition => {
        self.history.begin_group();
        Ok(self.update(Vec::new()))
      }
      SessionCommand::CommitComposition => {
        self.history.commit_group();
        Ok(self.update(Vec::new()))
      }
      SessionCommand::CancelComposition => {
        let step = self
          .history
          .cancel_group_step(&mut self.document)?;
        self.apply_history_step(step)
      }
      SessionCommand::Undo => {
        let step = self.history.undo_step(&mut self.document)?;
        self.apply_history_step(step)
      }
      SessionCommand::Redo => {
        let step = self.history.redo_step(&mut self.document)?;
        self.apply_history_step(step)
      }
      SessionCommand::UpdateComposition(inserted) => {
        let transaction = Command::InsertText(inserted)
          .build(&self.document, self.selection)?;
        self.apply_transaction(transaction, true)
      }
      SessionCommand::Core(command) => {
        let transaction = command.build(&self.document, self.selection)?;
        self.apply_transaction(transaction, false)
      }
      SessionCommand::Grapheme(command) => {
        let transaction = command.build(&self.document, self.selection)?;
        self.apply_transaction(transaction, false)
      }
      SessionCommand::Mark(command) => {
        let transaction = command.build(&self.document, self.selection)?;
        self.apply_transaction(transaction, false)
      }
      SessionCommand::Paste(command) => {
        let transaction = command.build(&self.document, self.selection)?;
        self.apply_transaction(transaction, false)
      }
      SessionCommand::ParagraphBoundary(command) => {
        let transaction = command.build(&self.document, self.selection)?;
        self.apply_transaction(transaction, false)
      }
      SessionCommand::List(command) => {
        let transaction = command.build(&self.document, self.selection)?;
        self.apply_transaction(transaction, false)
      }
      SessionCommand::Table(command) => {
        let transaction = command.build(&self.document, self.selection)?;
        self.apply_transaction(transaction, false)
      }
      SessionCommand::TableNavigation(command) => {
        let transaction = command.build(&self.document, self.selection)?;
        self.apply_transaction(transaction, false)
      }
    }
  }

  fn ensure_revision(&self, expected: u64) -> Result<(), EditError> {
    let actual = self.document.revision;
    if expected != actual {
      return Err(EditError::RevisionMismatch { expected, actual });
    }
    Ok(())
  }

  fn apply_transaction(
    &mut self,
    transaction: Transaction,
    grouped: bool,
  ) -> Result<SessionUpdate, EditError> {
    if transaction.operations.is_empty() {
      self.selection = transaction.selection_after;
      return Ok(self.update(Vec::new()));
    }
    let patches = transaction.view_patches();
    self.selection = if grouped {
      self
        .history
        .apply_grouped(&mut self.document, &transaction)?
    } else {
      self.history.apply(&mut self.document, &transaction)?
    };
    Ok(self.update(patches))
  }

  fn apply_history_step(
    &mut self,
    step: Option<HistoryStep>,
  ) -> Result<SessionUpdate, EditError> {
    let Some(step) = step else {
      return Ok(self.update(Vec::new()));
    };
    self.selection = step.selection;
    Ok(self.update(step.transaction.view_patches()))
  }

  fn update(&self, patches: Vec<ViewPatch>) -> SessionUpdate {
    SessionUpdate {
      revision: self.document.revision,
      selection: self.selection,
      patches,
      can_undo: self.history.can_undo(),
      can_redo: self.history.can_redo(),
      composition_active: self.history.is_group_active(),
    }
  }
}

fn ensure_editable_text(document: &mut Document) -> NodeId {
  if let Some(text) = first_text_descendant(document, document.root) {
    return text;
  }
  let paragraph = document.allocate(NodeKind::Block(BlockKind::Paragraph), None);
  let text = document.allocate(
    NodeKind::Inline(InlineKind::Text {
      value: String::new(),
    }),
    None,
  );
  document.append_child(paragraph, text);
  document.append_child(document.root, paragraph);
  text
}

fn first_text_descendant(document: &Document, root: NodeId) -> Option<NodeId> {
  let mut stack = vec![root];
  while let Some(current) = stack.pop() {
    let node = document.node(current)?;
    if matches!(node.kind, NodeKind::Inline(InlineKind::Text { .. })) {
      return Some(current);
    }
    stack.extend(node.children.iter().rev().copied());
  }
  None
}

fn validate_selection(document: &Document, selection: Selection) -> Result<(), EditError> {
  validate_point(document, selection.anchor)?;
  validate_point(document, selection.focus)
}

fn validate_point(document: &Document, point: SelectionPoint) -> Result<(), EditError> {
  let node = document
    .node(point.node)
    .ok_or(EditError::NodeNotFound(point.node))?;
  let NodeKind::Inline(InlineKind::Text { value }) = &node.kind else {
    return Err(EditError::NotTextNode(point.node));
  };
  let length = value.encode_utf16().count() as u32;
  if point.offset_utf16 > length {
    return Err(EditError::RangeOutOfBounds {
      node: point.node,
      start: point.offset_utf16,
      end: point.offset_utf16,
    });
  }
  let mut offset = 0u32;
  for character in value.chars() {
    if offset == point.offset_utf16 {
      return Ok(());
    }
    offset += character.len_utf16() as u32;
    if offset > point.offset_utf16 {
      return Err(EditError::InvalidUtf16Boundary {
        node: point.node,
        offset: point.offset_utf16,
      });
    }
  }
  if offset == point.offset_utf16 {
    Ok(())
  } else {
    Err(EditError::RangeOutOfBounds {
      node: point.node,
      start: point.offset_utf16,
      end: point.offset_utf16,
    })
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn text_id(session: &EditorSession) -> NodeId {
    first_text_descendant(session.document(), session.document().root).unwrap()
  }

  #[test]
  fn creates_an_editable_target_for_an_empty_document() {
    let session = EditorSession::from_markdown("");
    assert!(session.document().node(session.selection().focus.node).is_some());
    assert_eq!(session.snapshot().markdown, "");
  }

  #[test]
  fn rejects_commands_from_a_stale_revision() {
    let mut session = EditorSession::from_markdown("abc");
    let error = session
      .dispatch(4, SessionCommand::Core(Command::InsertText("x".into())))
      .unwrap_err();
    assert_eq!(
      error,
      EditError::RevisionMismatch {
        expected: 4,
        actual: 0,
      }
    );
  }

  #[test]
  fn dispatches_edits_and_exposes_forward_and_inverse_patches() {
    let mut session = EditorSession::from_markdown("abc");
    let text = text_id(&session);
    session
      .set_selection(
        0,
        Selection::collapsed(SelectionPoint {
          node: text,
          offset_utf16: 3,
        }),
      )
      .unwrap();
    let update = session
      .dispatch(0, SessionCommand::Core(Command::InsertText("x".into())))
      .unwrap();
    assert_eq!(update.revision, 1);
    assert_eq!(update.patches.len(), 1);
    assert_eq!(session.snapshot().markdown, "abcx");

    let undo = session.dispatch(1, SessionCommand::Undo).unwrap();
    assert_eq!(undo.revision, 2);
    assert_eq!(undo.patches.len(), 1);
    assert_eq!(session.snapshot().markdown, "abc");
  }

  #[test]
  fn groups_composition_updates_and_undoes_them_once() {
    let mut session = EditorSession::from_markdown("x");
    let text = text_id(&session);
    session
      .set_selection(
        0,
        Selection::collapsed(SelectionPoint {
          node: text,
          offset_utf16: 1,
        }),
      )
      .unwrap();
    session
      .dispatch(0, SessionCommand::BeginComposition)
      .unwrap();
    let first = session
      .dispatch(0, SessionCommand::UpdateComposition("に".into()))
      .unwrap();
    let second = session
      .dispatch(first.revision, SessionCommand::UpdateComposition("ほ".into()))
      .unwrap();
    let third = session
      .dispatch(second.revision, SessionCommand::UpdateComposition("ん".into()))
      .unwrap();
    session
      .dispatch(third.revision, SessionCommand::CommitComposition)
      .unwrap();
    assert_eq!(session.snapshot().markdown, "xにほん");

    session
      .dispatch(third.revision, SessionCommand::Undo)
      .unwrap();
    assert_eq!(session.snapshot().markdown, "x");
  }

  #[test]
  fn selection_only_navigation_does_not_increment_revision() {
    let mut session = EditorSession::from_markdown(
      "| A | B |\n| --- | --- |\n| one | two |",
    );
    let table = session.document().children(session.document().root).next().unwrap().id;
    let row = session.document().children(table).nth(1).unwrap().id;
    let cell = session.document().children(row).next().unwrap().id;
    let text = first_text_descendant(session.document(), cell).unwrap();
    session
      .set_selection(
        0,
        Selection::collapsed(SelectionPoint {
          node: text,
          offset_utf16: 0,
        }),
      )
      .unwrap();
    let update = session
      .dispatch(
        0,
        SessionCommand::TableNavigation(TableNavigationCommand::NextCell),
      )
      .unwrap();
    assert_eq!(update.revision, 0);
    assert!(update.patches.is_empty());
    assert_ne!(update.selection.focus.node, text);
  }
}

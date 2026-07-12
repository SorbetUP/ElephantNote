use crate::edit::{EditError, Transaction};
use crate::model::Document;
use crate::selection::Selection;

#[derive(Clone, Debug)]
pub struct History {
  undo: Vec<Transaction>,
  redo: Vec<Transaction>,
  max_entries: usize,
}

impl Default for History {
  fn default() -> Self {
    Self::new(500)
  }
}

impl History {
  pub fn new(max_entries: usize) -> Self {
    Self {
      undo: Vec::new(),
      redo: Vec::new(),
      max_entries: max_entries.max(1),
    }
  }

  pub fn apply(
    &mut self,
    document: &mut Document,
    transaction: &Transaction,
  ) -> Result<Selection, EditError> {
    let inverse = transaction.apply(document)?;
    self.undo.push(inverse);
    self.redo.clear();
    self.trim_undo();
    Ok(transaction.selection_after)
  }

  pub fn undo(&mut self, document: &mut Document) -> Result<Option<Selection>, EditError> {
    let Some(transaction) = self.undo.pop() else {
      return Ok(None);
    };
    let redo = transaction.apply(document)?;
    let selection = transaction.selection_after;
    self.redo.push(redo);
    Ok(Some(selection))
  }

  pub fn redo(&mut self, document: &mut Document) -> Result<Option<Selection>, EditError> {
    let Some(transaction) = self.redo.pop() else {
      return Ok(None);
    };
    let undo = transaction.apply(document)?;
    let selection = transaction.selection_after;
    self.undo.push(undo);
    self.trim_undo();
    Ok(Some(selection))
  }

  pub fn can_undo(&self) -> bool {
    !self.undo.is_empty()
  }

  pub fn can_redo(&self) -> bool {
    !self.redo.is_empty()
  }

  fn trim_undo(&mut self) {
    if self.undo.len() > self.max_entries {
      let excess = self.undo.len() - self.max_entries;
      self.undo.drain(..excess);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::edit::Command;
  use crate::model::{InlineKind, NodeKind};
  use crate::selection::{Selection, SelectionPoint};
  use crate::{parse_markdown, to_markdown};

  #[test]
  fn applies_undoes_and_redoes_transactions() {
    let mut document = parse_markdown("abc");
    let paragraph = document.children(document.root).next().unwrap();
    let node = document.children(paragraph.id).next().unwrap().id;
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 1,
    });
    let transaction = Command::InsertText("X".to_string())
      .build(&document, selection)
      .unwrap();
    let mut history = History::default();

    history.apply(&mut document, &transaction).unwrap();
    assert!(history.can_undo());
    assert_text(&document, node, "aXbc");

    history.undo(&mut document).unwrap();
    assert!(history.can_redo());
    assert_text(&document, node, "abc");

    history.redo(&mut document).unwrap();
    assert_text(&document, node, "aXbc");
  }

  #[test]
  fn undoes_and_redoes_paragraph_splits_without_changing_ids() {
    let mut document = parse_markdown("hello");
    let paragraph = document.children(document.root).next().unwrap();
    let node = document.children(paragraph.id).next().unwrap().id;
    let new_block = document.next_available_id();
    let new_text = crate::model::NodeId(new_block.0 + 1);
    let selection = Selection::collapsed(SelectionPoint {
      node,
      offset_utf16: 2,
    });
    let transaction = Command::InsertParagraph
      .build(&document, selection)
      .unwrap();
    let mut history = History::default();

    history.apply(&mut document, &transaction).unwrap();
    assert_eq!(to_markdown(&document), "he\n\nllo");
    assert!(document.node(new_block).is_some());
    assert!(document.node(new_text).is_some());

    history.undo(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "hello");
    assert!(document.node(new_block).is_none());
    assert!(document.node(new_text).is_none());

    history.redo(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "he\n\nllo");
    assert!(document.node(new_block).is_some());
    assert!(document.node(new_text).is_some());
  }

  fn assert_text(document: &Document, node: crate::model::NodeId, expected: &str) {
    assert!(matches!(
      &document.node(node).unwrap().kind,
      NodeKind::Inline(InlineKind::Text { value }) if value == expected
    ));
  }
}

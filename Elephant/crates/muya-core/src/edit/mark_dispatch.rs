use crate::model::{Document, InlineMarkKind};
use crate::selection::Selection;

use super::{EditError, Transaction};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MarkCommand {
  ToggleStrong,
  ToggleEmphasis,
  ToggleStrike,
}

impl MarkCommand {
  pub fn build(self, document: &Document, selection: Selection) -> Result<Transaction, EditError> {
    if let Some(transaction) = super::mark_same_subtree::build_partial_same_top_level_toggle(
      document,
      selection,
      self.fragment_kind(),
    )? {
      return Ok(transaction);
    }
    self.compat().build(document, selection)
  }

  fn compat(self) -> super::mark_compat::MarkCommand {
    match self {
      Self::ToggleStrong => super::mark_compat::MarkCommand::ToggleStrong,
      Self::ToggleEmphasis => super::mark_compat::MarkCommand::ToggleEmphasis,
      Self::ToggleStrike => super::mark_compat::MarkCommand::ToggleStrike,
    }
  }

  fn fragment_kind(self) -> InlineMarkKind {
    match self {
      Self::ToggleStrong => InlineMarkKind::Strong,
      Self::ToggleEmphasis => InlineMarkKind::Emphasis,
      Self::ToggleStrike => InlineMarkKind::Strike,
    }
  }
}

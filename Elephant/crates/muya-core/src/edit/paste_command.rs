use crate::model::Document;
use crate::selection::Selection;

use super::{paste::build_paste_markdown, EditError, Transaction};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PasteCommand {
  markdown: String,
}

impl PasteCommand {
  pub fn new(markdown: impl Into<String>) -> Self {
    Self {
      markdown: markdown.into(),
    }
  }

  pub fn build(
    &self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    build_paste_markdown(document, selection, &self.markdown)
  }
}

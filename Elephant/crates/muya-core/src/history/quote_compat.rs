use crate::edit::{Operation, Transaction};
use crate::model::{BlockKind, Document, NodeKind};

pub(super) fn discards_redo_on_undo(
  document: &Document,
  transaction: &Transaction,
) -> bool {
  let [Operation::SetBlockKind { node, kind }] = transaction.operations.as_slice() else {
    return false;
  };
  let Some(current) = document.node(*node) else {
    return false;
  };
  matches!(
    (&current.kind, kind),
    (
      NodeKind::Block(BlockKind::BlockQuote),
      BlockKind::Paragraph
    ) | (
      NodeKind::Block(BlockKind::Paragraph),
      BlockKind::BlockQuote
    )
  )
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::edit::Transaction;
  use crate::features::BlockTypeCommand;
  use crate::selection::{Selection, SelectionPoint};

  #[test]
  fn detects_only_quote_toggle_inverse_transactions() {
    let document = crate::parse_markdown("> alpha");
    let quote = document.children(document.root).next().unwrap();
    let text = document.children(quote.id).next().unwrap().id;
    let selection = Selection::collapsed(SelectionPoint {
      node: text,
      offset_utf16: 1,
    });
    let transaction = Transaction {
      operations: vec![Operation::SetBlockKind {
        node: quote.id,
        kind: BlockKind::Paragraph,
      }],
      selection_before: selection,
      selection_after: selection,
    };
    assert!(discards_redo_on_undo(&document, &transaction));

    let code = BlockTypeCommand::ToggleCodeBlock
      .build(&crate::parse_markdown("alpha"), selection)
      .unwrap_err();
    assert!(matches!(code, crate::edit::EditError::NodeNotFound(_)));
  }
}

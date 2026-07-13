use crate::edit::{EditError, Transaction};
use crate::model::{BlockKind, Document, InlineKind, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TableNavigationCommand {
  NextCell,
  PreviousCell,
}

#[derive(Clone, Copy, Debug)]
struct CellPosition {
  table: NodeId,
  row_index: usize,
  column_index: usize,
  row_count: usize,
  column_count: usize,
}

impl TableNavigationCommand {
  pub fn build(
    self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    let position = cell_position(document, selection)?;
    match self {
      Self::NextCell => build_next_cell(document, selection, position),
      Self::PreviousCell => build_previous_cell(document, selection, position),
    }
  }
}

fn build_next_cell(
  document: &Document,
  selection: Selection,
  position: CellPosition,
) -> Result<Transaction, EditError> {
  if position.column_index + 1 < position.column_count {
    return selection_transaction(
      document,
      selection,
      position.table,
      position.row_index,
      position.column_index + 1,
    );
  }

  if position.row_index + 1 < position.row_count {
    return selection_transaction(
      document,
      selection,
      position.table,
      position.row_index + 1,
      0,
    );
  }

  Ok(Transaction {
    operations: Vec::new(),
    selection_before: selection,
    selection_after: selection,
  })
}

fn build_previous_cell(
  document: &Document,
  selection: Selection,
  position: CellPosition,
) -> Result<Transaction, EditError> {
  if position.column_index > 0 {
    return selection_transaction(
      document,
      selection,
      position.table,
      position.row_index,
      position.column_index - 1,
    );
  }

  if position.row_index > 0 {
    return selection_transaction(
      document,
      selection,
      position.table,
      position.row_index - 1,
      position.column_count - 1,
    );
  }

  Ok(Transaction {
    operations: Vec::new(),
    selection_before: selection,
    selection_after: selection,
  })
}

fn selection_transaction(
  document: &Document,
  selection: Selection,
  table: NodeId,
  row_index: usize,
  column_index: usize,
) -> Result<Transaction, EditError> {
  let text = cell_text(document, table, row_index, column_index)?;
  Ok(Transaction {
    operations: Vec::new(),
    selection_before: selection,
    selection_after: Selection::collapsed(SelectionPoint {
      node: text,
      offset_utf16: 0,
    }),
  })
}

fn cell_position(document: &Document, selection: Selection) -> Result<CellPosition, EditError> {
  let caret = selection.caret().ok_or(EditError::NonCollapsedSelection)?;
  let cell = ancestor_matching(document, caret.node, |kind| {
    matches!(kind, NodeKind::Block(BlockKind::TableCell { .. }))
  })?;
  let row = document
    .node(cell)
    .and_then(|node| node.parent)
    .ok_or(EditError::UnsupportedStructure(cell))?;
  let table = document
    .node(row)
    .and_then(|node| node.parent)
    .ok_or(EditError::UnsupportedStructure(row))?;

  if !matches!(
    document.node(row).map(|node| &node.kind),
    Some(NodeKind::Block(BlockKind::TableRow))
  ) || !matches!(
    document.node(table).map(|node| &node.kind),
    Some(NodeKind::Block(BlockKind::Table))
  ) {
    return Err(EditError::UnsupportedStructure(cell));
  }

  let table_node = document.node(table).ok_or(EditError::NodeNotFound(table))?;
  let row_node = document.node(row).ok_or(EditError::NodeNotFound(row))?;
  let row_index = document
    .child_index(table, row)
    .ok_or(EditError::UnsupportedStructure(row))?;
  let column_index = document
    .child_index(row, cell)
    .ok_or(EditError::UnsupportedStructure(cell))?;
  let column_count = row_node.children.len();

  if column_count == 0
    || table_node.children.iter().any(|candidate| {
      document
        .node(*candidate)
        .is_none_or(|candidate| candidate.children.len() != column_count)
    })
  {
    return Err(EditError::UnsupportedStructure(table));
  }

  Ok(CellPosition {
    table,
    row_index,
    column_index,
    row_count: table_node.children.len(),
    column_count,
  })
}

fn cell_text(
  document: &Document,
  table: NodeId,
  row_index: usize,
  column_index: usize,
) -> Result<NodeId, EditError> {
  let row = document
    .node(table)
    .and_then(|table| table.children.get(row_index))
    .copied()
    .ok_or(EditError::UnsupportedStructure(table))?;
  let cell = document
    .node(row)
    .and_then(|row| row.children.get(column_index))
    .copied()
    .ok_or(EditError::UnsupportedStructure(row))?;
  first_text_descendant(document, cell)
}

fn ancestor_matching(
  document: &Document,
  start: NodeId,
  predicate: impl Fn(&NodeKind) -> bool,
) -> Result<NodeId, EditError> {
  let mut current = start;
  loop {
    let node = document
      .node(current)
      .ok_or(EditError::NodeNotFound(current))?;
    if predicate(&node.kind) {
      return Ok(current);
    }
    current = node.parent.ok_or(EditError::UnsupportedStructure(start))?;
  }
}

fn first_text_descendant(document: &Document, root: NodeId) -> Result<NodeId, EditError> {
  let mut stack = vec![root];
  while let Some(current) = stack.pop() {
    let node = document
      .node(current)
      .ok_or(EditError::NodeNotFound(current))?;
    if matches!(node.kind, NodeKind::Inline(InlineKind::Text { .. })) {
      return Ok(current);
    }
    stack.extend(node.children.iter().rev().copied());
  }
  Err(EditError::UnsupportedStructure(root))
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{parse_markdown, to_markdown};

  fn text_at(document: &Document, table: NodeId, row: usize, column: usize) -> NodeId {
    cell_text(document, table, row, column).unwrap()
  }

  #[test]
  fn moves_to_the_next_cell_and_wraps_to_the_next_row() {
    let document = parse_markdown("| A | B |\n| --- | --- |\n| one | two |");
    let table = document.children(document.root).next().unwrap().id;
    let source = text_at(&document, table, 0, 1);
    let target = text_at(&document, table, 1, 0);
    let selection = Selection::collapsed(SelectionPoint {
      node: source,
      offset_utf16: 1,
    });

    let transaction = TableNavigationCommand::NextCell
      .build(&document, selection)
      .unwrap();
    assert!(transaction.operations.is_empty());
    assert_eq!(transaction.selection_after.focus.node, target);
    assert_eq!(transaction.selection_after.focus.offset_utf16, 0);
  }

  #[test]
  fn moves_to_the_previous_cell_and_wraps_to_the_previous_row() {
    let document = parse_markdown("| A | B |\n| --- | --- |\n| one | two |");
    let table = document.children(document.root).next().unwrap().id;
    let source = text_at(&document, table, 1, 0);
    let target = text_at(&document, table, 0, 1);
    let selection = Selection::collapsed(SelectionPoint {
      node: source,
      offset_utf16: 0,
    });

    let transaction = TableNavigationCommand::PreviousCell
      .build(&document, selection)
      .unwrap();
    assert!(transaction.operations.is_empty());
    assert_eq!(transaction.selection_after.focus.node, target);
  }

  #[test]
  fn keeps_the_selection_at_the_first_cell() {
    let document = parse_markdown("| A | B |\n| --- | --- |");
    let table = document.children(document.root).next().unwrap().id;
    let source = text_at(&document, table, 0, 0);
    let selection = Selection::collapsed(SelectionPoint {
      node: source,
      offset_utf16: 0,
    });

    let transaction = TableNavigationCommand::PreviousCell
      .build(&document, selection)
      .unwrap();
    assert!(transaction.operations.is_empty());
    assert_eq!(transaction.selection_after, selection);
  }

  #[test]
  fn keeps_the_selection_at_the_final_cell() {
    let document = parse_markdown("| A | B |\n| --- | --- |\n| one | two |");
    let table = document.children(document.root).next().unwrap().id;
    let source = text_at(&document, table, 1, 1);
    let selection = Selection::collapsed(SelectionPoint {
      node: source,
      offset_utf16: 3,
    });

    let transaction = TableNavigationCommand::NextCell
      .build(&document, selection)
      .unwrap();
    assert!(transaction.operations.is_empty());
    assert_eq!(transaction.selection_after, selection);
    assert_eq!(document.children(table).count(), 2);
    assert_eq!(
      to_markdown(&document),
      "| A   | B   |\n| --- | --- |\n| one | two |"
    );
  }
}

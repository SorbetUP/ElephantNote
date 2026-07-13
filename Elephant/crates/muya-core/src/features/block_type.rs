use crate::edit::{EditError, Operation, Transaction};
use crate::model::{BlockKind, Document, ListKind, Node, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BlockTypeCommand {
  ToggleBlockQuote,
  ToggleCodeBlock,
  SetListKind(ListKind),
}

impl BlockTypeCommand {
  pub fn build(
    self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    match self {
      Self::ToggleBlockQuote => toggle_simple(
        document,
        selection,
        BlockKind::BlockQuote,
        BlockKind::Paragraph,
      ),
      Self::ToggleCodeBlock => toggle_code(document, selection),
      Self::SetListKind(kind) => set_list_kind(document, selection, kind),
    }
  }
}

fn toggle_simple(
  document: &Document,
  selection: Selection,
  target: BlockKind,
  fallback: BlockKind,
) -> Result<Transaction, EditError> {
  let block = text_block(document, selection.focus.node)?;
  let current = &document
    .node(block)
    .ok_or(EditError::NodeNotFound(block))?
    .kind;
  let kind = if current == &NodeKind::Block(target.clone()) {
    fallback
  } else if matches!(current, NodeKind::Block(BlockKind::Paragraph)) {
    target
  } else {
    return Err(EditError::UnsupportedStructure(block));
  };
  set_kind(selection, block, kind, selection)
}

fn toggle_code(
  document: &Document,
  selection: Selection,
) -> Result<Transaction, EditError> {
  let block = text_block(document, selection.focus.node)?;
  let node = document.node(block).ok_or(EditError::NodeNotFound(block))?;
  let (kind, offset) = match node.kind {
    NodeKind::Block(BlockKind::CodeBlock { .. }) => {
      (BlockKind::Paragraph, text_length(document, selection.focus.node))
    }
    NodeKind::Block(BlockKind::Paragraph) => (
      BlockKind::CodeBlock {
        language: None,
        fenced: true,
      },
      0,
    ),
    _ => return Err(EditError::UnsupportedStructure(block)),
  };
  let after = Selection::collapsed(SelectionPoint {
    node: selection.focus.node,
    offset_utf16: offset,
  });
  set_kind(selection, block, kind, after)
}

fn set_kind(
  before: Selection,
  block: NodeId,
  kind: BlockKind,
  after: Selection,
) -> Result<Transaction, EditError> {
  Ok(Transaction {
    operations: vec![Operation::SetBlockKind { node: block, kind }],
    selection_before: before,
    selection_after: after,
  })
}

fn set_list_kind(
  document: &Document,
  selection: Selection,
  target: ListKind,
) -> Result<Transaction, EditError> {
  if let Some(list) = ancestor_list(document, selection.focus.node) {
    let current = list_kind(document, list)?;
    return if current == target {
      unwrap_list(document, selection, list)
    } else {
      convert_list(document, selection, list, target)
    };
  }
  wrap_paragraph_in_list(document, selection, target)
}

fn wrap_paragraph_in_list(
  document: &Document,
  selection: Selection,
  kind: ListKind,
) -> Result<Transaction, EditError> {
  let paragraph = text_block(document, selection.focus.node)?;
  let node = document
    .node(paragraph)
    .ok_or(EditError::NodeNotFound(paragraph))?;
  if !matches!(node.kind, NodeKind::Block(BlockKind::Paragraph))
    || node.parent != Some(document.root)
  {
    return Err(EditError::UnsupportedStructure(paragraph));
  }
  let index = document
    .child_index(document.root, paragraph)
    .ok_or(EditError::UnsupportedStructure(paragraph))?;
  let list = document.next_available_id();
  let item = NodeId(list.0.saturating_add(1));
  let checked = (kind == ListKind::Task).then_some(false);
  let after = Selection::collapsed(SelectionPoint {
    node: selection.focus.node,
    offset_utf16: 0,
  });
  Ok(Transaction {
    operations: vec![
      Operation::InsertNode {
        parent: document.root,
        index,
        node: Node::new(
          list,
          NodeKind::Block(BlockKind::List {
            kind,
            start: (kind == ListKind::Ordered).then_some(1),
          }),
          None,
        ),
      },
      Operation::InsertNode {
        parent: list,
        index: 0,
        node: Node::new(
          item,
          NodeKind::Block(BlockKind::ListItem { checked }),
          None,
        ),
      },
      Operation::MoveNode {
        node: paragraph,
        new_parent: item,
        new_index: 0,
      },
    ],
    selection_before: selection,
    selection_after: after,
  })
}

fn convert_list(
  document: &Document,
  selection: Selection,
  list: NodeId,
  kind: ListKind,
) -> Result<Transaction, EditError> {
  let node = document.node(list).ok_or(EditError::NodeNotFound(list))?;
  let mut operations = vec![Operation::SetBlockKind {
    node: list,
    kind: BlockKind::List {
      kind,
      start: (kind == ListKind::Ordered).then_some(1),
    },
  }];
  for item in &node.children {
    operations.push(Operation::SetBlockKind {
      node: *item,
      kind: BlockKind::ListItem {
        checked: (kind == ListKind::Task).then_some(false),
      },
    });
  }
  Ok(Transaction {
    operations,
    selection_before: selection,
    selection_after: selection,
  })
}

fn unwrap_list(
  document: &Document,
  selection: Selection,
  list: NodeId,
) -> Result<Transaction, EditError> {
  let index = document
    .child_index(document.root, list)
    .ok_or(EditError::UnsupportedStructure(list))?;
  let list_node = document.node(list).ok_or(EditError::NodeNotFound(list))?;
  let mut operations = Vec::new();
  let mut offset = 0;
  for item in &list_node.children {
    let item_node = document.node(*item).ok_or(EditError::NodeNotFound(*item))?;
    for child in &item_node.children {
      operations.push(Operation::MoveNode {
        node: *child,
        new_parent: document.root,
        new_index: index + offset,
      });
      offset += 1;
    }
  }
  operations.push(Operation::RemoveNode { node: list });
  Ok(Transaction {
    operations,
    selection_before: selection,
    selection_after: selection,
  })
}

fn text_block(document: &Document, mut node: NodeId) -> Result<NodeId, EditError> {
  loop {
    let current = document.node(node).ok_or(EditError::NodeNotFound(node))?;
    if matches!(
      current.kind,
      NodeKind::Block(BlockKind::Paragraph | BlockKind::BlockQuote | BlockKind::CodeBlock { .. })
    ) {
      return Ok(node);
    }
    node = current.parent.ok_or(EditError::UnsupportedStructure(node))?;
  }
}

fn ancestor_list(document: &Document, mut node: NodeId) -> Option<NodeId> {
  loop {
    let current = document.node(node)?;
    if matches!(current.kind, NodeKind::Block(BlockKind::List { .. })) {
      return Some(node);
    }
    node = current.parent?;
  }
}

fn list_kind(document: &Document, list: NodeId) -> Result<ListKind, EditError> {
  match &document.node(list).ok_or(EditError::NodeNotFound(list))?.kind {
    NodeKind::Block(BlockKind::List { kind, .. }) => Ok(*kind),
    _ => Err(EditError::UnsupportedStructure(list)),
  }
}

fn text_length(document: &Document, node: NodeId) -> u32 {
  match document.node(node).map(|node| &node.kind) {
    Some(NodeKind::Inline(crate::model::InlineKind::Text { value })) => {
      value.encode_utf16().count() as u32
    }
    _ => 0,
  }
}

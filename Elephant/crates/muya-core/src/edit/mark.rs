use crate::model::{Document, InlineKind, Node, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

use super::operation::utf16_to_byte;
use super::{EditError, Operation, Transaction, Utf16Range};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MarkCommand {
  ToggleStrong,
  ToggleEmphasis,
  ToggleStrike,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MarkKind {
  Strong,
  Emphasis,
  Strike,
}

impl MarkCommand {
  pub fn build(
    self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    let mark = match self {
      Self::ToggleStrong => MarkKind::Strong,
      Self::ToggleEmphasis => MarkKind::Emphasis,
      Self::ToggleStrike => MarkKind::Strike,
    };
    build_toggle_mark(document, selection, mark)
  }
}

impl MarkKind {
  fn inline(self) -> InlineKind {
    match self {
      Self::Strong => InlineKind::Strong,
      Self::Emphasis => InlineKind::Emphasis,
      Self::Strike => InlineKind::Strike,
    }
  }

  fn matches(self, kind: &NodeKind) -> bool {
    matches!(
      (self, kind),
      (Self::Strong, NodeKind::Inline(InlineKind::Strong))
        | (Self::Emphasis, NodeKind::Inline(InlineKind::Emphasis))
        | (Self::Strike, NodeKind::Inline(InlineKind::Strike))
    )
  }
}

fn build_toggle_mark(
  document: &Document,
  selection: Selection,
  mark: MarkKind,
) -> Result<Transaction, EditError> {
  let (text, start, end) = selection
    .ordered_same_node()
    .ok_or(EditError::CrossNodeSelection)?;
  if start == end {
    return Ok(Transaction {
      operations: Vec::new(),
      selection_before: selection,
      selection_after: selection,
    });
  }

  let value = text_value(document, text)?;
  let start_byte = utf16_to_byte(value, text, start)?;
  let end_byte = utf16_to_byte(value, text, end)?;
  let text_node = document.node(text).ok_or(EditError::NodeNotFound(text))?;
  let parent = text_node.parent.ok_or(EditError::UnsupportedStructure(text))?;
  let parent_node = document
    .node(parent)
    .ok_or(EditError::NodeNotFound(parent))?;

  if mark.matches(&parent_node.kind) {
    return build_unwrap_mark(
      document,
      selection,
      text,
      parent,
      start,
      end,
      start_byte,
      end_byte,
    );
  }

  build_wrap_mark(
    document,
    selection,
    text,
    parent,
    start,
    end,
    start_byte,
    end_byte,
    mark,
  )
}

#[allow(clippy::too_many_arguments)]
fn build_wrap_mark(
  document: &Document,
  selection: Selection,
  text: NodeId,
  parent: NodeId,
  start: u32,
  end: u32,
  start_byte: usize,
  end_byte: usize,
  mark: MarkKind,
) -> Result<Transaction, EditError> {
  let value = text_value(document, text)?;
  let full_length = value.encode_utf16().count() as u32;
  let parent_index = document
    .child_index(parent, text)
    .ok_or(EditError::UnsupportedStructure(text))?;
  let selected = value[start_byte..end_byte].to_string();
  let suffix = value[end_byte..].to_string();
  let mut next_id = document.next_available_id().0;
  let wrapper_id = take_id(&mut next_id);
  let selected_id = take_id(&mut next_id);
  let suffix_id = take_id(&mut next_id);

  let mut operations = vec![
    Operation::ReplaceText {
      node: text,
      range: Utf16Range::new(start, full_length),
      inserted: String::new(),
    },
    Operation::InsertNode {
      parent,
      index: parent_index + 1,
      node: Node::new(wrapper_id, NodeKind::Inline(mark.inline()), None),
    },
    Operation::InsertNode {
      parent: wrapper_id,
      index: 0,
      node: text_node(selected_id, selected),
    },
  ];
  if !suffix.is_empty() {
    operations.push(Operation::InsertNode {
      parent,
      index: parent_index + 2,
      node: text_node(suffix_id, suffix),
    });
  }

  Ok(Transaction {
    operations,
    selection_before: selection,
    selection_after: selected_selection(selected_id, end - start),
  })
}

#[allow(clippy::too_many_arguments)]
fn build_unwrap_mark(
  document: &Document,
  selection: Selection,
  text: NodeId,
  wrapper: NodeId,
  start: u32,
  end: u32,
  start_byte: usize,
  end_byte: usize,
) -> Result<Transaction, EditError> {
  let value = text_value(document, text)?;
  let full_length = value.encode_utf16().count() as u32;
  let wrapper_node = document
    .node(wrapper)
    .ok_or(EditError::NodeNotFound(wrapper))?;
  if wrapper_node.children.as_slice() != [text] {
    return Err(EditError::UnsupportedStructure(wrapper));
  }
  let grandparent = wrapper_node
    .parent
    .ok_or(EditError::UnsupportedStructure(wrapper))?;
  let wrapper_index = document
    .child_index(grandparent, wrapper)
    .ok_or(EditError::UnsupportedStructure(wrapper))?;

  if start == 0 && end == full_length {
    let detached_text = Node::new(
      text,
      document
        .node(text)
        .ok_or(EditError::NodeNotFound(text))?
        .kind
        .clone(),
      None,
    );
    return Ok(Transaction {
      operations: vec![
        Operation::RemoveNode { node: text },
        Operation::RemoveNode { node: wrapper },
        Operation::InsertNode {
          parent: grandparent,
          index: wrapper_index,
          node: detached_text,
        },
      ],
      selection_before: selection,
      selection_after: selection,
    });
  }

  let selected = value[start_byte..end_byte].to_string();
  let suffix = value[end_byte..].to_string();
  let mut next_id = document.next_available_id().0;
  let selected_id = take_id(&mut next_id);
  let selected_node = text_node(selected_id, selected);
  let mut operations = Vec::new();

  if start == 0 {
    operations.extend([
      Operation::ReplaceText {
        node: text,
        range: Utf16Range::new(0, end),
        inserted: String::new(),
      },
      Operation::InsertNode {
        parent: grandparent,
        index: wrapper_index,
        node: selected_node,
      },
    ]);
  } else {
    operations.extend([
      Operation::ReplaceText {
        node: text,
        range: Utf16Range::new(start, full_length),
        inserted: String::new(),
      },
      Operation::InsertNode {
        parent: grandparent,
        index: wrapper_index + 1,
        node: selected_node,
      },
    ]);

    if end < full_length {
      let suffix_wrapper_id = take_id(&mut next_id);
      let suffix_text_id = take_id(&mut next_id);
      operations.extend([
        Operation::InsertNode {
          parent: grandparent,
          index: wrapper_index + 2,
          node: Node::new(
            suffix_wrapper_id,
            wrapper_node.kind.clone(),
            None,
          ),
        },
        Operation::InsertNode {
          parent: suffix_wrapper_id,
          index: 0,
          node: text_node(suffix_text_id, suffix),
        },
      ]);
    }
  }

  Ok(Transaction {
    operations,
    selection_before: selection,
    selection_after: selected_selection(selected_id, end - start),
  })
}

fn selected_selection(node: NodeId, length: u32) -> Selection {
  Selection {
    anchor: SelectionPoint {
      node,
      offset_utf16: 0,
    },
    focus: SelectionPoint {
      node,
      offset_utf16: length,
    },
  }
}

fn text_node(id: NodeId, value: String) -> Node {
  Node::new(id, NodeKind::Inline(InlineKind::Text { value }), None)
}

fn text_value(document: &Document, node: NodeId) -> Result<&str, EditError> {
  match &document
    .node(node)
    .ok_or(EditError::NodeNotFound(node))?
    .kind
  {
    NodeKind::Inline(InlineKind::Text { value }) => Ok(value),
    _ => Err(EditError::NotTextNode(node)),
  }
}

fn take_id(next_id: &mut u64) -> NodeId {
  let id = NodeId(*next_id);
  *next_id = next_id.saturating_add(1);
  id
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::{parse_markdown, to_markdown};

  fn first_text_descendant(document: &Document, root: NodeId) -> NodeId {
    let mut stack = vec![root];
    while let Some(current) = stack.pop() {
      let node = document.node(current).unwrap();
      if matches!(node.kind, NodeKind::Inline(InlineKind::Text { .. })) {
        return current;
      }
      stack.extend(node.children.iter().rev().copied());
    }
    panic!("text descendant not found");
  }

  fn marked_text(document: &Document) -> NodeId {
    let block = document.children(document.root).next().unwrap().id;
    let wrapper = document.children(block).next().unwrap().id;
    first_text_descendant(document, wrapper)
  }

  fn selection(node: NodeId, start: u32, end: u32) -> Selection {
    Selection {
      anchor: SelectionPoint {
        node,
        offset_utf16: start,
      },
      focus: SelectionPoint {
        node,
        offset_utf16: end,
      },
    }
  }

  #[test]
  fn unwraps_the_middle_of_a_strong_mark_and_undoes_exactly() {
    let mut document = parse_markdown("**abcdef**");
    let text = marked_text(&document);
    let inverse = MarkCommand::ToggleStrong
      .build(&document, selection(text, 2, 5))
      .unwrap()
      .apply(&mut document)
      .unwrap();
    assert_eq!(to_markdown(&document), "**ab**cde**f**");

    inverse.apply(&mut document).unwrap();
    assert_eq!(to_markdown(&document), "**abcdef**");
  }

  #[test]
  fn unwraps_the_prefix_of_a_strong_mark() {
    let mut document = parse_markdown("**abcdef**");
    let text = marked_text(&document);
    MarkCommand::ToggleStrong
      .build(&document, selection(text, 0, 3))
      .unwrap()
      .apply(&mut document)
      .unwrap();
    assert_eq!(to_markdown(&document), "abc**def**");
  }

  #[test]
  fn unwraps_the_suffix_of_a_strong_mark() {
    let mut document = parse_markdown("**abcdef**");
    let text = marked_text(&document);
    MarkCommand::ToggleStrong
      .build(&document, selection(text, 3, 6))
      .unwrap()
      .apply(&mut document)
      .unwrap();
    assert_eq!(to_markdown(&document), "**abc**def");
  }

  #[test]
  fn wraps_a_plain_text_selection() {
    let mut document = parse_markdown("abcdef");
    let block = document.children(document.root).next().unwrap().id;
    let text = first_text_descendant(&document, block);
    MarkCommand::ToggleEmphasis
      .build(&document, selection(text, 1, 4))
      .unwrap()
      .apply(&mut document)
      .unwrap();
    assert_eq!(to_markdown(&document), "a*bcd*ef");
  }
}

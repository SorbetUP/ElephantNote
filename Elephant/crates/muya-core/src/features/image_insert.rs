use crate::edit::{operation::utf16_to_byte, EditError, Operation, Transaction, Utf16Range};
use crate::model::{BlockKind, Document, InlineKind, Node, NodeId, NodeKind};
use crate::selection::{Selection, SelectionPoint};

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct InsertImage {
  pub source: String,
  pub alt: String,
  pub title: Option<String>,
}

impl InsertImage {
  pub fn build(
    self,
    document: &Document,
    selection: Selection,
  ) -> Result<Transaction, EditError> {
    let Some((text, start, end)) = selection.ordered_same_node() else {
      return Err(EditError::CrossNodeSelection);
    };
    if forbidden_context(document, text) {
      return Ok(noop(selection));
    }
    let value = text_value(document, text)?;
    let start_byte = utf16_to_byte(value, text, start)?;
    let end_byte = utf16_to_byte(value, text, end)?;
    let selected = &value[start_byte..end_byte];
    let alt = if selected.is_empty() {
      if self.alt.is_empty() {
        infer_alt(&self.source)
      } else {
        self.alt
      }
    } else {
      selected.to_string()
    };
    let source = normalize_source(&self.source);
    let parent = document
      .node(text)
      .and_then(|node| node.parent)
      .ok_or(EditError::UnsupportedStructure(text))?;
    let index = document
      .child_index(parent, text)
      .ok_or(EditError::UnsupportedStructure(text))?;
    let suffix = value[end_byte..].to_string();
    let full_length = value.encode_utf16().count() as u32;
    let image = document.next_available_id();
    let tail = NodeId(image.0.saturating_add(1));

    Ok(Transaction {
      operations: vec![
        Operation::ReplaceText {
          node: text,
          range: Utf16Range::new(start, full_length),
          inserted: String::new(),
        },
        Operation::InsertNode {
          parent,
          index: index + 1,
          node: Node::new(
            image,
            NodeKind::Inline(InlineKind::Image {
              source,
              title: self.title.filter(|value| !value.is_empty()),
              alt,
            }),
            None,
          ),
        },
        Operation::InsertNode {
          parent,
          index: index + 2,
          node: Node::new(
            tail,
            NodeKind::Inline(InlineKind::Text { value: suffix }),
            None,
          ),
        },
      ],
      selection_before: selection,
      selection_after: Selection::collapsed(SelectionPoint {
        node: tail,
        offset_utf16: 0,
      }),
    })
  }
}

fn text_value(document: &Document, node: NodeId) -> Result<&str, EditError> {
  match document.node(node).map(|node| &node.kind) {
    Some(NodeKind::Inline(InlineKind::Text { value })) => Ok(value),
    Some(_) => Err(EditError::NotTextNode(node)),
    None => Err(EditError::NodeNotFound(node)),
  }
}

fn forbidden_context(document: &Document, mut node: NodeId) -> bool {
  while let Some(current) = document.node(node) {
    if matches!(current.kind, NodeKind::Block(BlockKind::CodeBlock { .. } | BlockKind::ThematicBreak)) {
      return true;
    }
    let Some(parent) = current.parent else {
      break;
    };
    node = parent;
  }
  false
}

fn infer_alt(source: &str) -> String {
  let filename = source.rsplit(['/', '\\']).next().unwrap_or(source);
  let Some((stem, extension)) = filename.rsplit_once('.') else {
    return String::new();
  };
  if stem.is_empty() || extension.is_empty() || !extension.chars().all(|ch| ch.is_ascii_lowercase()) {
    return String::new();
  }
  stem.to_string()
}

fn normalize_source(source: &str) -> String {
  if source.starts_with("data:") {
    return source.to_string();
  }
  let encoded_spaces = source.replace(' ', "%20");
  if source.contains("://") {
    encoded_spaces
  } else {
    encoded_spaces.replace('#', "%23")
  }
}

fn noop(selection: Selection) -> Transaction {
  Transaction {
    operations: Vec::new(),
    selection_before: selection,
    selection_after: selection,
  }
}

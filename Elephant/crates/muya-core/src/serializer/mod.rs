use crate::model::{BlockKind, Document, InlineKind, Node, NodeKind};

pub fn to_markdown(document: &Document) -> String {
  let mut blocks = Vec::new();
  for node in document.children(document.root) {
    blocks.push(serialize_block(document, node));
  }
  blocks.join("\n\n")
}

fn serialize_block(document: &Document, node: &Node) -> String {
  match &node.kind {
    NodeKind::Block(BlockKind::Paragraph) => serialize_inlines(document, node),
    NodeKind::Block(BlockKind::Heading { level }) => {
      format!("{} {}", "#".repeat((*level).into()), serialize_inlines(document, node))
    }
    NodeKind::Block(BlockKind::ThematicBreak) => "---".to_string(),
    NodeKind::Block(BlockKind::BlockQuote) => serialize_inlines(document, node)
      .lines()
      .map(|line| format!("> {line}"))
      .collect::<Vec<_>>()
      .join("\n"),
    NodeKind::Block(BlockKind::CodeBlock { language, .. }) => {
      format!("```{}\n{}\n```", language.as_deref().unwrap_or(""), serialize_inlines(document, node))
    }
    _ => serialize_inlines(document, node),
  }
}

fn serialize_inlines(document: &Document, node: &Node) -> String {
  node.children
    .iter()
    .filter_map(|child| document.node(*child))
    .map(|child| match &child.kind {
      NodeKind::Inline(InlineKind::Text { value }) => value.clone(),
      NodeKind::Inline(InlineKind::CodeSpan { code }) => format!("`{code}`"),
      NodeKind::Inline(InlineKind::SoftBreak) => "\n".to_string(),
      NodeKind::Inline(InlineKind::HardBreak) => "  \n".to_string(),
      _ => serialize_inlines(document, child),
    })
    .collect()
}

#[cfg(test)]
mod tests {
  use pretty_assertions::assert_eq;

  use super::*;
  use crate::parse_markdown;

  #[test]
  fn serializes_the_initial_supported_slice() {
    let document = parse_markdown("# Title\n\nBody\n\n---\n");
    assert_eq!(to_markdown(&document), "# Title\n\nBody\n\n---");
  }
}

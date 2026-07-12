use crate::model::{Alignment, BlockKind, Document, InlineKind, ListKind, Node, NodeKind};

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
    NodeKind::Block(BlockKind::List { kind, start }) => {
      serialize_list(document, node, *kind, *start)
    }
    NodeKind::Block(BlockKind::Table) => serialize_table(document, node),
    _ => serialize_inlines(document, node),
  }
}

fn serialize_list(
  document: &Document,
  list: &Node,
  kind: ListKind,
  start: Option<u64>,
) -> String {
  document
    .children(list.id)
    .enumerate()
    .map(|(index, item)| {
      let content = serialize_inlines(document, item);
      match kind {
        ListKind::Unordered => format!("- {content}"),
        ListKind::Ordered => format!("{}. {content}", start.unwrap_or(1) + index as u64),
        ListKind::Task => {
          let checked = match &item.kind {
            NodeKind::Block(BlockKind::ListItem { checked: Some(true) }) => "x",
            _ => " ",
          };
          format!("- [{checked}] {content}")
        }
      }
    })
    .collect::<Vec<_>>()
    .join("\n")
}

fn serialize_table(document: &Document, table: &Node) -> String {
  let rows = document.children(table.id).collect::<Vec<_>>();
  let Some(header) = rows.first() else {
    return String::new();
  };

  let header_cells = table_cells(document, header);
  let alignments = document
    .children(header.id)
    .map(|cell| match &cell.kind {
      NodeKind::Block(BlockKind::TableCell { alignment, .. }) => *alignment,
      _ => Alignment::Default,
    })
    .collect::<Vec<_>>();

  let mut lines = vec![format_table_row(&header_cells)];
  lines.push(format_table_row(
    &alignments
      .iter()
      .map(|alignment| match alignment {
        Alignment::Default => "---".to_string(),
        Alignment::Left => ":---".to_string(),
        Alignment::Center => ":---:".to_string(),
        Alignment::Right => "---:".to_string(),
      })
      .collect::<Vec<_>>(),
  ));

  for row in rows.into_iter().skip(1) {
    lines.push(format_table_row(&table_cells(document, row)));
  }
  lines.join("\n")
}

fn table_cells(document: &Document, row: &Node) -> Vec<String> {
  document
    .children(row.id)
    .map(|cell| serialize_inlines(document, cell).replace('|', "\\|"))
    .collect()
}

fn format_table_row(cells: &[String]) -> String {
  format!("| {} |", cells.join(" | "))
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
    .collect::<Vec<_>>()
    .join("")
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

  #[test]
  fn serializes_blockquotes_and_fenced_code() {
    let document = parse_markdown("> Quote\n> continued\n\n```rust\nfn main() {}\n```\n");
    assert_eq!(
      to_markdown(&document),
      "> Quote\n> continued\n\n```rust\nfn main() {}\n```"
    );
  }

  #[test]
  fn canonicalizes_setext_lists_and_tables() {
    let document = parse_markdown(
      "Title\n=====\n\n3. three\n4. four\n\n- [x] done\n- [ ] todo\n\n| Name | Score |\n| :--- | ---: |\n| Ada | 10 |\n",
    );
    assert_eq!(
      to_markdown(&document),
      "# Title\n\n3. three\n4. four\n\n- [x] done\n- [ ] todo\n\n| Name | Score |\n| :--- | ---: |\n| Ada | 10 |"
    );
  }
}

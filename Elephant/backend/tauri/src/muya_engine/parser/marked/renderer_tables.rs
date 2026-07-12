pub fn table(header: &str, body: &str) -> String {
  let body = if body.is_empty() {
    String::new()
  } else {
    format!("<tbody>{body}</tbody>")
  };
  format!("<table>\n<thead>\n{header}</thead>\n{body}</table>\n")
}

pub fn table_row(content: &str) -> String {
  format!("<tr>\n{content}</tr>\n")
}

pub fn table_cell(content: &str, header: bool, align: Option<&str>) -> String {
  let element = if header { "th" } else { "td" };
  let opening = match align.filter(|value| !value.is_empty()) {
    Some(align) => format!("<{element} align=\"{align}\">"),
    None => format!("<{element}>")
  };
  format!("{opening}{content}</{element}>\n")
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn renders_tables_like_marked() {
    assert_eq!(
      table("<tr>h</tr>\n", "<tr>b</tr>\n"),
      "<table>\n<thead>\n<tr>h</tr>\n</thead>\n<tbody><tr>b</tr>\n</tbody></table>\n"
    );
    assert_eq!(
      table("header", ""),
      "<table>\n<thead>\nheader</thead>\n</table>\n"
    );
  }

  #[test]
  fn renders_rows_and_cells_like_marked() {
    assert_eq!(table_row("cell"), "<tr>\ncell</tr>\n");
    assert_eq!(
      table_cell("A", true, Some("center")),
      "<th align=\"center\">A</th>\n"
    );
    assert_eq!(table_cell("B", false, None), "<td>B</td>\n");
  }
}

pub fn split_cells(table_row: &str, count: usize) -> Vec<String> {
  let chars = table_row.chars().collect::<Vec<_>>();
  let mut rewritten = String::with_capacity(table_row.len() + chars.len());

  for (offset, current) in chars.iter().copied().enumerate() {
    if current != '|' {
      rewritten.push(current);
      continue;
    }

    let mut escaped = false;
    let mut cursor = offset;
    while cursor > 0 && chars[cursor - 1] == '\\' {
      escaped = !escaped;
      cursor -= 1;
    }
    if escaped {
      rewritten.push('|');
    } else {
      rewritten.push(' ');
      rewritten.push('|');
    }
  }

  let mut cells = rewritten
    .split(" |")
    .map(ToOwned::to_owned)
    .collect::<Vec<_>>();
  cells.truncate(count);
  cells.resize(count, String::new());
  cells
    .into_iter()
    .map(|cell| cell.trim().replace("\\|", "|"))
    .collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn splits_and_normalizes_escaped_cells() {
    assert_eq!(
      split_cells("a | b\\|c | d", 3),
      vec!["a", "b|c", "d"]
    );
    assert_eq!(split_cells("a|b", 4), vec!["a", "b", "", ""]);
    assert_eq!(split_cells("a|b|c", 2), vec!["a", "b"]);
  }
}

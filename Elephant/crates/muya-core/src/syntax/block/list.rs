use crate::model::ListKind;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ListMarker<'a> {
  pub kind: ListKind,
  pub start: Option<u64>,
  pub checked: Option<bool>,
  pub content: &'a str,
}

pub fn parse(line: &str) -> Option<ListMarker<'_>> {
  let trimmed = line.trim_start();
  let indent = line.len().saturating_sub(trimmed.len());
  if indent > 3 {
    return None;
  }

  parse_unordered(trimmed).or_else(|| parse_ordered(trimmed))
}

fn parse_unordered(line: &str) -> Option<ListMarker<'_>> {
  let marker = line.chars().next()?;
  if !matches!(marker, '-' | '*' | '+') {
    return None;
  }

  let rest = line.get(marker.len_utf8()..)?.strip_prefix(' ')?;
  if let Some(task) = parse_task(rest) {
    return Some(task);
  }

  Some(ListMarker {
    kind: ListKind::Unordered,
    start: None,
    checked: None,
    content: rest,
  })
}

fn parse_task(rest: &str) -> Option<ListMarker<'_>> {
  if let Some(content) = rest.strip_prefix("[ ] ") {
    return Some(ListMarker {
      kind: ListKind::Task,
      start: None,
      checked: Some(false),
      content,
    });
  }

  rest
    .strip_prefix("[x] ")
    .or_else(|| rest.strip_prefix("[X] "))
    .map(|content| ListMarker {
      kind: ListKind::Task,
      start: None,
      checked: Some(true),
      content,
    })
}

fn parse_ordered(line: &str) -> Option<ListMarker<'_>> {
  let digits = line.chars().take_while(|character| character.is_ascii_digit()).count();
  if digits == 0 || digits > 9 {
    return None;
  }

  let start = line.get(..digits)?.parse::<u64>().ok()?;
  let suffix = line.get(digits..)?;
  let rest = suffix
    .strip_prefix(". ")
    .or_else(|| suffix.strip_prefix(") "))?;

  Some(ListMarker {
    kind: ListKind::Ordered,
    start: Some(start),
    checked: None,
    content: rest,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_unordered_ordered_and_task_items() {
    assert_eq!(
      parse("- item"),
      Some(ListMarker {
        kind: ListKind::Unordered,
        start: None,
        checked: None,
        content: "item",
      })
    );
    assert_eq!(
      parse("3. item"),
      Some(ListMarker {
        kind: ListKind::Ordered,
        start: Some(3),
        checked: None,
        content: "item",
      })
    );
    assert_eq!(
      parse("- [x] done"),
      Some(ListMarker {
        kind: ListKind::Task,
        start: None,
        checked: Some(true),
        content: "done",
      })
    );
  }

  #[test]
  fn rejects_deeply_indented_or_incomplete_markers() {
    assert_eq!(parse("    - nested"), None);
    assert_eq!(parse("1.item"), None);
    assert_eq!(parse("-item"), None);
  }
}

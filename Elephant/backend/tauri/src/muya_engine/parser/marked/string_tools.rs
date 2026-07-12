fn single_utf16_unit(value: &str) -> Option<u16> {
  let mut units = value.encode_utf16();
  let first = units.next()?;
  units.next().is_none().then_some(first)
}

pub fn rtrim(value: &str, character: &str, invert: bool) -> String {
  if value.is_empty() {
    return String::new();
  }

  let target = single_utf16_unit(character);
  let units = value.encode_utf16().collect::<Vec<_>>();
  let mut suffix_length = 0usize;
  while suffix_length < units.len() {
    let current = units[units.len() - suffix_length - 1];
    let matches = target == Some(current);
    if (matches && !invert) || (!matches && invert) {
      suffix_length += 1;
    } else {
      break;
    }
  }
  String::from_utf16_lossy(&units[..units.len() - suffix_length])
}

/// Returns the closing bracket offset in JavaScript UTF-16 code units.
pub fn find_closing_bracket(value: &str, opening: &str, closing: &str) -> i64 {
  let Some(opening) = single_utf16_unit(opening) else {
    return -1;
  };
  let Some(closing) = single_utf16_unit(closing) else {
    return -1;
  };
  let units = value.encode_utf16().collect::<Vec<_>>();
  if !units.contains(&closing) {
    return -1;
  }

  let mut level = 0i64;
  let mut index = 0usize;
  while index < units.len() {
    if units[index] == b'\\' as u16 {
      index += 2;
      continue;
    }
    if units[index] == opening {
      level += 1;
    } else if units[index] == closing {
      level -= 1;
      if level < 0 {
        return index as i64;
      }
    }
    index += 1;
  }
  -1
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn trims_matching_and_inverted_suffixes() {
    assert_eq!(rtrim("hello///", "/", false), "hello");
    assert_eq!(rtrim("https://host/path", "/", true), "https://host/");
    assert_eq!(rtrim("abc", "xx", false), "abc");
  }

  #[test]
  fn finds_nested_unescaped_closing_bracket() {
    assert_eq!(find_closing_bracket("a[b]c]", "[", "]"), 5);
    assert_eq!(find_closing_bracket("a\\]b]", "[", "]"), 4);
    assert_eq!(find_closing_bracket("😀]", "[", "]"), 2);
    assert_eq!(find_closing_bracket("abc", "[", "]"), -1);
  }
}

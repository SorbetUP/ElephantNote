#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Range {
  pub start: i64,
  pub end: i64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ActiveRange<T> {
  pub start: i64,
  pub end: i64,
  pub active: T,
}

pub fn is_meta_key(key: &str) -> bool {
  matches!(key, "Shift" | "Control" | "Alt" | "Meta")
}

pub fn is_odd(number: f64) -> bool {
  number.abs() % 2.0 == 1.0
}

pub fn is_even(number: f64) -> bool {
  number.abs() % 2.0 == 0.0
}

/// JavaScript's `String.length` counts UTF-16 code units rather than Unicode
/// scalar values, so the Rust port intentionally does the same.
pub fn is_length_even(value: &str) -> bool {
  value.encode_utf16().count() % 2 == 0
}

pub fn snake_to_camel(name: &str) -> String {
  let mut output = String::with_capacity(name.len());
  let mut chars = name.chars().peekable();
  while let Some(current) = chars.next() {
    if current == '_' {
      if let Some(next) = chars.peek().copied() {
        if next.is_ascii_lowercase() {
          output.push(next.to_ascii_uppercase());
          chars.next();
          continue;
        }
      }
    }
    output.push(current);
  }
  output
}

pub fn camel_to_snake(name: &str) -> String {
  let mut output = String::with_capacity(name.len());
  for current in name.chars() {
    if current.is_ascii_uppercase() {
      output.push('-');
      output.push(current.to_ascii_lowercase());
    } else {
      output.push(current);
    }
  }
  output
}

pub fn conflict(first: [i64; 2], second: [i64; 2]) -> bool {
  !(first[1] < second[0] || second[1] < first[0])
}

pub fn union<T>(target: Range, local: ActiveRange<T>) -> Option<ActiveRange<T>> {
  if target.end <= local.start || local.end <= target.start {
    return None;
  }

  Some(ActiveRange {
    start: if local.start < target.start {
      target.start
    } else {
      local.start
    },
    end: target.end.min(local.end),
    active: local.active,
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn preserves_javascript_meta_key_contract() {
    for key in ["Shift", "Control", "Alt", "Meta"] {
      assert!(is_meta_key(key));
    }
    assert!(!is_meta_key("Enter"));
  }

  #[test]
  fn preserves_numeric_parity_contract() {
    assert!(is_odd(-3.0));
    assert!(is_even(-4.0));
    assert!(!is_odd(1.5));
    assert!(!is_even(f64::NAN));
  }

  #[test]
  fn counts_utf16_units_like_javascript() {
    assert!(is_length_even("😀"));
    assert!(!is_length_even("😀a"));
  }

  #[test]
  fn converts_names_like_javascript_regexes() {
    assert_eq!(snake_to_camel("hello_world"), "helloWorld");
    assert_eq!(snake_to_camel("hello__world"), "hello_World");
    assert_eq!(camel_to_snake("HTMLValue"), "-h-t-m-l-value");
  }

  #[test]
  fn preserves_closed_interval_conflicts() {
    assert!(conflict([0, 2], [2, 4]));
    assert!(!conflict([0, 1], [2, 3]));
  }

  #[test]
  fn intersects_ranges_like_muya() {
    let local = ActiveRange {
      start: 2,
      end: 7,
      active: true,
    };
    assert_eq!(
      union(Range { start: 4, end: 9 }, local),
      Some(ActiveRange {
        start: 4,
        end: 7,
        active: true,
      })
    );
    assert_eq!(
      union(
        Range { start: 7, end: 9 },
        ActiveRange {
          start: 2,
          end: 7,
          active: true,
        },
      ),
      None
    );
  }
}

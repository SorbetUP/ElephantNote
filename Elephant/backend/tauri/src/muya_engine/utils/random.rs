use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

const ID_PREFIX: &str = "ag-";
static ID: AtomicU64 = AtomicU64::new(0);

pub fn get_unique_id() -> String {
  format!("{ID_PREFIX}{}", ID.fetch_add(1, Ordering::Relaxed))
}

pub fn get_long_unique_id() -> String {
  let milliseconds = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .unwrap_or_default()
    .as_millis();
  format!("{}-{}", get_unique_id(), radix32(milliseconds))
}

fn radix32(mut value: u128) -> String {
  const DIGITS: &[u8; 32] = b"0123456789abcdefghijklmnopqrstuv";
  if value == 0 {
    return "0".to_string();
  }
  let mut output = Vec::new();
  while value > 0 {
    output.push(DIGITS[(value % 32) as usize] as char);
    value /= 32;
  }
  output.iter().rev().collect()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn unique_ids_keep_the_javascript_prefix_and_sequence() {
    let first = get_unique_id();
    let second = get_unique_id();
    assert!(first.starts_with(ID_PREFIX));
    let first_number = first.trim_start_matches(ID_PREFIX).parse::<u64>().unwrap();
    let second_number = second.trim_start_matches(ID_PREFIX).parse::<u64>().unwrap();
    assert_eq!(second_number, first_number + 1);
  }

  #[test]
  fn long_ids_append_a_base_32_timestamp() {
    let id = get_long_unique_id();
    let (_, timestamp) = id.rsplit_once('-').unwrap();
    assert!(!timestamp.is_empty());
    assert!(timestamp.chars().all(|character| character.is_ascii_digit() || ('a'..='v').contains(&character)));
  }

  #[test]
  fn base_32_matches_javascript_number_format() {
    assert_eq!(radix32(0), "0");
    assert_eq!(radix32(31), "v");
    assert_eq!(radix32(32), "10");
    assert_eq!(radix32(1024), "100");
  }
}

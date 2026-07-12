use std::sync::atomic::{AtomicU64, Ordering};

static UNIQUE_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

pub fn get_unique_id() -> u64 {
  UNIQUE_ID_COUNTER.fetch_add(1, Ordering::Relaxed) + 1
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ids_are_strictly_monotonic() {
    let first = get_unique_id();
    let second = get_unique_id();
    assert_eq!(second, first + 1);
  }
}

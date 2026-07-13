use crate::model::InlineMarkKind;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct CrossingMark {
  pub base: String,
  pub mark: InlineMarkKind,
  pub start_utf16: u32,
  pub end_utf16: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Token {
  start: usize,
  delimiter: &'static str,
  mark: InlineMarkKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct Interval {
  open: usize,
  close: usize,
  delimiter: &'static str,
  mark: InlineMarkKind,
}

pub(super) fn detect(source: &str) -> Option<CrossingMark> {
  if source.contains("***") || source.contains("___") {
    return None;
  }

  let tokens = tokens(source);
  let intervals = intervals(&tokens);
  let target = intervals
    .iter()
    .filter_map(|candidate| {
      let crossings = intervals
        .iter()
        .filter(|other| candidate != *other && crosses(*candidate, **other))
        .count();
      (crossings > 0).then_some((*candidate, crossings))
    })
    .max_by(|(left, left_count), (right, right_count)| {
      left_count
        .cmp(right_count)
        .then_with(|| right.open.cmp(&left.open))
    })?
    .0;

  let delimiter_len = target.delimiter.len();
  let base = format!(
    "{}{}{}",
    &source[..target.open],
    &source[target.open + delimiter_len..target.close],
    &source[target.close + delimiter_len..]
  );
  let start_utf16 = utf16_len(&source[..target.open]);
  let end_utf16 = utf16_len(&source[..target.close]) - utf16_len(target.delimiter);

  Some(CrossingMark {
    base,
    mark: target.mark,
    start_utf16,
    end_utf16,
  })
}

fn tokens(source: &str) -> Vec<Token> {
  let mut output = Vec::new();
  let mut offset = 0usize;

  while offset < source.len() {
    let remaining = &source[offset..];
    if remaining.starts_with('\\') {
      offset += remaining.chars().take(2).map(char::len_utf8).sum::<usize>();
      continue;
    }
    if remaining.starts_with('`') {
      let run = remaining.chars().take_while(|character| *character == '`').count();
      let delimiter = "`".repeat(run);
      if let Some(closing) = remaining[run..].find(&delimiter) {
        offset += run + closing + delimiter.len();
      } else {
        offset += run;
      }
      continue;
    }

    let matched = [
      ("~~", InlineMarkKind::Strike),
      ("**", InlineMarkKind::Strong),
      ("__", InlineMarkKind::Strong),
      ("*", InlineMarkKind::Emphasis),
      ("_", InlineMarkKind::Emphasis),
    ]
    .into_iter()
    .find(|(delimiter, _)| remaining.starts_with(delimiter));

    if let Some((delimiter, mark)) = matched {
      output.push(Token {
        start: offset,
        delimiter,
        mark,
      });
      offset += delimiter.len();
    } else {
      offset += remaining.chars().next().map(char::len_utf8).unwrap_or(1);
    }
  }

  output
}

fn intervals(tokens: &[Token]) -> Vec<Interval> {
  let mut output = Vec::new();
  for delimiter in ["~~", "**", "__", "*", "_"] {
    let matching = tokens
      .iter()
      .filter(|token| token.delimiter == delimiter)
      .copied()
      .collect::<Vec<_>>();
    for pair in matching.chunks_exact(2) {
      output.push(Interval {
        open: pair[0].start,
        close: pair[1].start,
        delimiter,
        mark: pair[0].mark,
      });
    }
  }
  output
}

fn crosses(left: Interval, right: Interval) -> bool {
  (left.open < right.open && right.open < left.close && left.close < right.close)
    || (right.open < left.open && left.open < right.close && right.close < left.close)
}

fn utf16_len(value: &str) -> u32 {
  value.encode_utf16().count() as u32
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn chooses_the_mark_crossing_the_most_other_intervals() {
    assert_eq!(
      detect("**al~~pha** beta *gam~~ma*"),
      Some(CrossingMark {
        base: "**alpha** beta *gamma*".to_string(),
        mark: InlineMarkKind::Strike,
        start_utf16: 4,
        end_utf16: 19,
      })
    );
  }

  #[test]
  fn prefers_the_earlier_opening_interval_when_cross_counts_match() {
    assert_eq!(
      detect("al*pha **be*ta** gamma"),
      Some(CrossingMark {
        base: "alpha **beta** gamma".to_string(),
        mark: InlineMarkKind::Emphasis,
        start_utf16: 2,
        end_utf16: 10,
      })
    );
  }

  #[test]
  fn ignores_nested_and_code_delimiters() {
    assert_eq!(detect("**bold *soft***"), None);
    assert_eq!(detect("`**not a mark**`"), None);
  }
}

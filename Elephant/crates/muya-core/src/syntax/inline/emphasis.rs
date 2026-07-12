#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EmphasisKind {
  Emphasis,
  Strong,
  Strike,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EmphasisMatch<'a> {
  pub consumed: usize,
  pub content: &'a str,
  pub kind: EmphasisKind,
}

pub fn parse(source: &str) -> Option<EmphasisMatch<'_>> {
  for (delimiter, kind) in [
    ("**", EmphasisKind::Strong),
    ("__", EmphasisKind::Strong),
    ("~~", EmphasisKind::Strike),
    ("*", EmphasisKind::Emphasis),
    ("_", EmphasisKind::Emphasis),
  ] {
    let Some(rest) = source.strip_prefix(delimiter) else {
      continue;
    };
    let closing = rest.find(delimiter)?;
    if closing == 0 {
      return None;
    }
    return Some(EmphasisMatch {
      consumed: delimiter.len() + closing + delimiter.len(),
      content: &rest[..closing],
      kind,
    });
  }
  None
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_basic_emphasis_forms() {
    assert_eq!(
      parse("**bold**"),
      Some(EmphasisMatch {
        consumed: 8,
        content: "bold",
        kind: EmphasisKind::Strong,
      })
    );
    assert_eq!(
      parse("*soft*"),
      Some(EmphasisMatch {
        consumed: 6,
        content: "soft",
        kind: EmphasisKind::Emphasis,
      })
    );
    assert_eq!(
      parse("~~gone~~"),
      Some(EmphasisMatch {
        consumed: 8,
        content: "gone",
        kind: EmphasisKind::Strike,
      })
    );
  }
}

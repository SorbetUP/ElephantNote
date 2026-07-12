#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct HeadingMatch<'a> {
  pub level: u8,
  pub text: &'a str,
}

pub fn parse_atx(line: &str) -> Option<HeadingMatch<'_>> {
  let hashes = line.chars().take_while(|character| *character == '#').count();
  if hashes == 0 || hashes > 6 {
    return None;
  }
  let text = line.get(hashes..)?.strip_prefix(' ')?;
  Some(HeadingMatch {
    level: hashes as u8,
    text: text.trim_end_matches('#').trim_end(),
  })
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn parses_atx_headings_only() {
    assert_eq!(parse_atx("## Title"), Some(HeadingMatch { level: 2, text: "Title" }));
    assert_eq!(parse_atx("####### Too deep"), None);
    assert_eq!(parse_atx("#missing-space"), None);
  }
}

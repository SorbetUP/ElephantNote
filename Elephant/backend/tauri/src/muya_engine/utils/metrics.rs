use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct WordCount {
  pub word: usize,
  pub paragraph: usize,
  pub character: usize,
  pub all: usize,
}

pub fn word_count(markdown: &str) -> WordCount {
  let paragraph = split_paragraphs(markdown);
  let removed_chinese = markdown
    .chars()
    .filter(|character| !is_counted_chinese(*character))
    .collect::<String>();
  let chinese_word_length = utf16_len(markdown).saturating_sub(utf16_len(&removed_chinese));
  let tokens = split_js_whitespace(&removed_chinese);
  let token_characters = tokens.iter().map(|token| utf16_len(token)).sum::<usize>();

  WordCount {
    word: chinese_word_length + tokens.len(),
    paragraph,
    character: token_characters + chinese_word_length,
    all: utf16_len(markdown),
  }
}

fn split_paragraphs(markdown: &str) -> usize {
  let bytes = markdown.as_bytes();
  let mut count = 0usize;
  let mut segment_start = 0usize;
  let mut index = 0usize;

  while index < bytes.len() {
    if bytes[index] == b'\n' {
      let run_start = index;
      while index < bytes.len() && bytes[index] == b'\n' {
        index += 1;
      }
      if index - run_start >= 2 {
        if run_start > segment_start {
          count += 1;
        }
        segment_start = index;
        continue;
      }
    }
    index += 1;
  }
  if segment_start < bytes.len() {
    count += 1;
  }
  count
}

fn split_js_whitespace(value: &str) -> Vec<&str> {
  value
    .split(|character: char| character.is_whitespace() || character == '\u{feff}')
    .filter(|token| !token.is_empty())
    .collect()
}

fn is_counted_chinese(character: char) -> bool {
  ('\u{4e00}'..='\u{9fa5}').contains(&character)
}

fn utf16_len(value: &str) -> usize {
  value.encode_utf16().count()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn counts_words_and_characters_like_javascript() {
    assert_eq!(word_count("hello world"), WordCount { word: 2, paragraph: 1, character: 10, all: 11 });
    assert_eq!(word_count("一二三"), WordCount { word: 3, paragraph: 1, character: 3, all: 3 });
    assert_eq!(word_count("A😀 B"), WordCount { word: 2, paragraph: 1, character: 4, all: 5 });
  }

  #[test]
  fn counts_paragraphs_and_javascript_whitespace() {
    assert_eq!(word_count("a\n\nb\n\n").paragraph, 2);
    assert_eq!(word_count("\u{feff}a b"), WordCount { word: 2, paragraph: 1, character: 2, all: 4 });
  }
}

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum InlineKind {
  Text { value: String },
  Escaped { value: char },
  Emphasis,
  Strong,
  Strike,
  CodeSpan { code: String },
  Link { destination: String, title: Option<String> },
  Image { source: String, title: Option<String>, alt: String },
  AutoLink { destination: String },
  InlineHtml { raw: String },
  InlineMath { source: String },
  Emoji { shortcode: String, value: String },
  Superscript,
  Subscript,
  FootnoteReference { label: String },
  SoftBreak,
  HardBreak,
}

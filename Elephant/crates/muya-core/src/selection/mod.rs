use serde::{Deserialize, Serialize};

use crate::model::NodeId;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct SelectionPoint {
  pub node: NodeId,
  pub offset_utf16: u32,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Selection {
  pub anchor: SelectionPoint,
  pub focus: SelectionPoint,
}

impl Selection {
  pub fn collapsed(point: SelectionPoint) -> Self {
    Self {
      anchor: point,
      focus: point,
    }
  }

  pub fn is_collapsed(self) -> bool {
    self.anchor == self.focus
  }

  pub fn caret(self) -> Option<SelectionPoint> {
    self.is_collapsed().then_some(self.focus)
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn exposes_collapsed_carets() {
    let point = SelectionPoint {
      node: NodeId(4),
      offset_utf16: 3,
    };
    let selection = Selection::collapsed(point);
    assert!(selection.is_collapsed());
    assert_eq!(selection.caret(), Some(point));
  }
}

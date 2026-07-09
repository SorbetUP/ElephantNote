use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelSelection {
  pub provider: String,
  pub model_id: String,
  pub local: bool,
}

impl ModelSelection {
  pub fn disabled() -> Self {
    Self { provider: "none".to_string(), model_id: String::new(), local: false }
  }

  pub fn is_enabled(&self) -> bool {
    self.provider != "none" && !self.model_id.trim().is_empty()
  }
}

pub fn model_cache_key(provider: &str, model_id: &str) -> String {
  format!("{}:{}", provider.trim(), model_id.trim())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn disabled_model_is_not_enabled() {
    assert!(!ModelSelection::disabled().is_enabled());
  }

  #[test]
  fn configured_model_is_enabled() {
    let model = ModelSelection { provider: "local".into(), model_id: "tiny".into(), local: true };
    assert!(model.is_enabled());
  }

  #[test]
  fn creates_model_cache_keys() {
    assert_eq!(model_cache_key("local", "tiny"), "local:tiny");
  }
}

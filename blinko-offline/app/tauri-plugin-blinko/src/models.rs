use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetColorRequest {
  pub hex: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresentShareSheetRequest {
  pub path: String,
  pub mime: Option<String>,
  pub filename: Option<String>,
}

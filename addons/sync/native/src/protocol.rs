use iroh::endpoint::{RecvStream, SendStream};
use iroh::EndpointAddr;
use serde::{Deserialize, Serialize};

use crate::manifest::VaultManifest;
use crate::plan::SyncPlan;

pub const ALPN: &[u8] = b"elephantnote/vault-sync/1";
pub const PROTOCOL_NAME: &str = "elephantnote-iroh-sync-v1";
pub const FILE_CHUNK_SIZE: usize = 256 * 1024;
const MAX_CONTROL_FRAME: usize = 16 * 1024 * 1024;
const MAX_FILE_HEADER: usize = 64 * 1024;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairRequest {
  pub invite_id: String,
  pub invite_token: String,
  pub folder_id: String,
  pub device_name: String,
  pub endpoint_addr: EndpointAddr,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairAccepted {
  pub folder_id: String,
  pub folder_label: String,
  pub device_name: String,
  pub endpoint_addr: EndpointAddr,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncOpen {
  pub folder_id: String,
  pub device_name: String,
  pub manifest: VaultManifest,
  pub baseline: VaultManifest,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncHello {
  pub device_name: String,
  pub manifest: VaultManifest,
  pub baseline: VaultManifest,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHeader {
  pub transfer_id: String,
  pub source_path: String,
  pub target_path: String,
  pub size: u64,
  pub hash: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload", rename_all = "camelCase")]
pub enum ControlMessage {
  PairRequest(PairRequest),
  PairAccepted(PairAccepted),
  SyncOpen(SyncOpen),
  SyncHello(SyncHello),
  SyncPlan(SyncPlan),
  ReadyForUploads { count: usize },
  UploadsApplied { count: usize },
  TransfersComplete { count: usize },
  SyncFinish { manifest: VaultManifest },
  SyncComplete {
    manifest: VaultManifest,
    acknowledged: bool,
  },
  Error { message: String },
}

pub fn message_name(message: &ControlMessage) -> &'static str {
  match message {
    ControlMessage::PairRequest(_) => "pairRequest",
    ControlMessage::PairAccepted(_) => "pairAccepted",
    ControlMessage::SyncOpen(_) => "syncOpen",
    ControlMessage::SyncHello(_) => "syncHello",
    ControlMessage::SyncPlan(_) => "syncPlan",
    ControlMessage::ReadyForUploads { .. } => "readyForUploads",
    ControlMessage::UploadsApplied { .. } => "uploadsApplied",
    ControlMessage::TransfersComplete { .. } => "transfersComplete",
    ControlMessage::SyncFinish { .. } => "syncFinish",
    ControlMessage::SyncComplete { .. } => "syncComplete",
    ControlMessage::Error { .. } => "error",
  }
}

pub fn expect_control(message: ControlMessage, expected: &str) -> Result<ControlMessage, String> {
  if let ControlMessage::Error { message } = message {
    return Err(message);
  }
  let actual = message_name(&message);
  if actual != expected {
    return Err(format!("unexpected sync message: expected {expected}, received {actual}"));
  }
  Ok(message)
}

pub async fn write_control(send: &mut SendStream, message: &ControlMessage) -> Result<(), String> {
  let bytes = serde_json::to_vec(message).map_err(|error| error.to_string())?;
  if bytes.len() > MAX_CONTROL_FRAME {
    return Err("sync control frame is too large".to_string());
  }
  send
    .write_all(&(bytes.len() as u32).to_be_bytes())
    .await
    .map_err(|error| error.to_string())?;
  send.write_all(&bytes).await.map_err(|error| error.to_string())
}

pub async fn read_control(recv: &mut RecvStream) -> Result<ControlMessage, String> {
  let mut length = [0_u8; 4];
  recv.read_exact(&mut length).await.map_err(|error| error.to_string())?;
  let length = u32::from_be_bytes(length) as usize;
  if length == 0 || length > MAX_CONTROL_FRAME {
    return Err(format!("invalid sync control frame length: {length}"));
  }
  let mut bytes = vec![0_u8; length];
  recv.read_exact(&mut bytes).await.map_err(|error| error.to_string())?;
  serde_json::from_slice(&bytes).map_err(|error| format!("invalid sync control frame: {error}"))
}

pub async fn write_file_header(send: &mut SendStream, header: &FileHeader) -> Result<(), String> {
  let bytes = serde_json::to_vec(header).map_err(|error| error.to_string())?;
  if bytes.len() > MAX_FILE_HEADER {
    return Err("file header is too large".to_string());
  }
  send
    .write_all(&(bytes.len() as u32).to_be_bytes())
    .await
    .map_err(|error| error.to_string())?;
  send.write_all(&bytes).await.map_err(|error| error.to_string())
}

pub async fn read_file_header(recv: &mut RecvStream) -> Result<FileHeader, String> {
  let mut length = [0_u8; 4];
  recv.read_exact(&mut length).await.map_err(|error| error.to_string())?;
  let length = u32::from_be_bytes(length) as usize;
  if length == 0 || length > MAX_FILE_HEADER {
    return Err(format!("invalid file header length: {length}"));
  }
  let mut bytes = vec![0_u8; length];
  recv
    .read_exact(&mut bytes)
    .await
    .map_err(|error| format!("invalid file header: {error}"))?;
  serde_json::from_slice(&bytes).map_err(|error| format!("invalid file header: {error}"))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn control_message_names_are_stable() {
    let message = ControlMessage::ReadyForUploads { count: 3 };
    assert_eq!(message_name(&message), "readyForUploads");
    assert!(expect_control(message, "readyForUploads").is_ok());
  }

  #[test]
  fn unexpected_control_messages_are_rejected() {
    let message = ControlMessage::UploadsApplied { count: 1 };
    let error = expect_control(message, "readyForUploads").unwrap_err();
    assert!(error.contains("expected readyForUploads"));
  }
}

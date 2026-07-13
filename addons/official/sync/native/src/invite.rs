use iroh::{EndpointAddr, SecretKey};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::protocol::PROTOCOL_NAME;

pub const INVITE_LIFETIME_SECONDS: u64 = 10 * 60;
pub const BACKEND_IROH: &str = "iroh";
pub const TRANSPORT_IROH_MDNS: &str = "iroh-quic-mdns";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingInvite {
  pub id: String,
  pub token_hash: String,
  pub expires_at: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PairingInvite {
  pub protocol: String,
  pub version: u8,
  pub backend: String,
  pub transport: String,
  pub invite_id: String,
  pub invite_token: String,
  pub expires_at: u64,
  pub folder_id: String,
  pub folder_label: String,
  pub device_name: String,
  pub endpoint_addr: EndpointAddr,
  pub security: Value,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NewInvite {
  pub invite: PairingInvite,
  pub pending: PendingInvite,
}

impl PairingInvite {
  pub fn create(
    now: u64,
    expires_at: Option<u64>,
    folder_id: String,
    folder_label: String,
    device_name: String,
    endpoint_addr: EndpointAddr,
  ) -> Result<NewInvite, String> {
    let expires_at = expires_at.unwrap_or(now.saturating_add(INVITE_LIFETIME_SECONDS));
    if expires_at <= now {
      return Err("Pairing invite expiration must be in the future".to_string());
    }
    require_non_empty("folder id", &folder_id)?;
    require_non_empty("folder label", &folder_label)?;
    require_non_empty("device name", &device_name)?;

    let invite_id = format!("invite-{}", random_hex(8));
    let invite_token = random_hex(32);
    let pending = PendingInvite {
      id: invite_id.clone(),
      token_hash: token_hash(&invite_token),
      expires_at,
    };
    let invite = Self {
      protocol: PROTOCOL_NAME.to_string(),
      version: 1,
      backend: BACKEND_IROH.to_string(),
      transport: TRANSPORT_IROH_MDNS.to_string(),
      invite_id,
      invite_token,
      expires_at,
      folder_id,
      folder_label,
      device_name,
      endpoint_addr,
      security: security_value(),
    };
    Ok(NewInvite { invite, pending })
  }

  pub fn parse(payload: Value) -> Result<Self, String> {
    let value = normalize_payload(payload)?;
    serde_json::from_value(value).map_err(|error| format!("Invalid Elephant Iroh invite: {error}"))
  }

  pub fn validate(&self, now: u64) -> Result<(), String> {
    if self.protocol != PROTOCOL_NAME {
      return Err("This is not an Elephant Iroh sync invite".to_string());
    }
    if self.version != 1 {
      return Err(format!("Unsupported Elephant Sync invite version: {}", self.version));
    }
    if self.backend != BACKEND_IROH || self.transport != TRANSPORT_IROH_MDNS {
      return Err("Pairing invite uses an unsupported Sync transport".to_string());
    }
    if self.expires_at <= now {
      return Err("This Elephant pairing invite has expired".to_string());
    }
    require_non_empty("invite id", &self.invite_id)?;
    require_non_empty("one-time token", &self.invite_token)?;
    require_non_empty("folder id", &self.folder_id)?;
    require_non_empty("device name", &self.device_name)?;
    Ok(())
  }

  pub fn qr_payload(&self) -> Result<String, String> {
    serde_json::to_string(self).map_err(|error| error.to_string())
  }
}

pub fn token_hash(token: &str) -> String {
  blake3::hash(token.as_bytes()).to_hex().to_string()
}

pub fn verify_pending_invite(pending: &PendingInvite, invite: &PairingInvite, now: u64) -> Result<(), String> {
  invite.validate(now)?;
  if pending.expires_at <= now || invite.expires_at != pending.expires_at {
    return Err("Pairing invite has expired or its expiration changed".to_string());
  }
  if pending.id != invite.invite_id {
    return Err("Pairing invite id does not match the pending invitation".to_string());
  }
  if pending.token_hash != token_hash(&invite.invite_token) {
    return Err("Pairing invite token is invalid".to_string());
  }
  Ok(())
}

fn normalize_payload(payload: Value) -> Result<Value, String> {
  if let Some(raw) = payload
    .get("qrPayload")
    .or_else(|| payload.get("manualCode"))
    .and_then(Value::as_str)
  {
    return serde_json::from_str(raw).map_err(|error| format!("Invalid Elephant Iroh invite: {error}"));
  }
  if let Some(invite) = payload.get("invite") {
    return Ok(invite.clone());
  }
  Ok(payload)
}

fn random_hex(bytes: usize) -> String {
  SecretKey::generate().to_bytes()[..bytes]
    .iter()
    .map(|byte| format!("{byte:02x}"))
    .collect()
}

fn require_non_empty(label: &str, value: &str) -> Result<(), String> {
  if value.trim().is_empty() {
    Err(format!("Pairing invite has no {label}"))
  } else {
    Ok(())
  }
}

fn security_value() -> Value {
  json!({
    "transport": "iroh-quic",
    "authenticatedEncryption": true,
    "identity": "iroh-endpoint-id",
    "cloudRequired": false,
    "storesPlaintextCredentials": false,
    "storesPairingMaterial": false,
    "preservesConflicts": true,
    "requiresExternalBinary": false
  })
}

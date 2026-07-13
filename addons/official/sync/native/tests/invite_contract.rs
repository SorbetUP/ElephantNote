use elephant_sync_service::invite::{
  token_hash, verify_pending_invite, PairingInvite, INVITE_LIFETIME_SECONDS,
};
use elephant_sync_service::protocol::PROTOCOL_NAME;
use iroh::{EndpointAddr, SecretKey};
use serde_json::json;

fn endpoint_addr() -> EndpointAddr {
  EndpointAddr::from(SecretKey::generate().public())
}

#[test]
fn generated_invite_preserves_the_existing_pairing_contract() {
  let now = 1_000;
  let created = PairingInvite::create(
    now,
    None,
    "vault-1".to_string(),
    "Personal".to_string(),
    "Laptop".to_string(),
    endpoint_addr(),
  )
  .unwrap();

  assert_eq!(created.invite.protocol, PROTOCOL_NAME);
  assert_eq!(created.invite.version, 1);
  assert_eq!(created.invite.backend, "iroh");
  assert_eq!(created.invite.transport, "iroh-quic-mdns");
  assert_eq!(created.invite.expires_at, now + INVITE_LIFETIME_SECONDS);
  assert_eq!(created.pending.id, created.invite.invite_id);
  assert_eq!(created.pending.expires_at, created.invite.expires_at);
  assert_eq!(created.pending.token_hash, token_hash(&created.invite.invite_token));
  assert_ne!(created.pending.token_hash, created.invite.invite_token);
  created.invite.validate(now).unwrap();
  verify_pending_invite(&created.pending, &created.invite, now).unwrap();
}

#[test]
fn qr_and_manual_payloads_parse_to_the_same_invite() {
  let created = PairingInvite::create(
    10,
    Some(100),
    "vault-1".to_string(),
    "Personal".to_string(),
    "Laptop".to_string(),
    endpoint_addr(),
  )
  .unwrap();
  let raw = created.invite.qr_payload().unwrap();

  let qr = PairingInvite::parse(json!({ "qrPayload": raw })).unwrap();
  let manual = PairingInvite::parse(json!({ "manualCode": created.invite.qr_payload().unwrap() })).unwrap();
  let nested = PairingInvite::parse(json!({ "invite": created.invite })).unwrap();

  assert_eq!(qr.invite_id, manual.invite_id);
  assert_eq!(manual.invite_id, nested.invite_id);
  assert_eq!(qr.folder_id, "vault-1");
}

#[test]
fn expired_and_tampered_invitations_are_rejected() {
  let created = PairingInvite::create(
    10,
    Some(20),
    "vault-1".to_string(),
    "Personal".to_string(),
    "Laptop".to_string(),
    endpoint_addr(),
  )
  .unwrap();

  assert!(created.invite.validate(20).unwrap_err().contains("expired"));

  let mut tampered = created.invite;
  tampered.invite_token.push('x');
  assert!(verify_pending_invite(&created.pending, &tampered, 15)
    .unwrap_err()
    .contains("token"));
}

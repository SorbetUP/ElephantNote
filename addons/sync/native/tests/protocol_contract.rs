use elephant_sync_service::protocol::{
  ControlMessage, PairRequest, ALPN, FILE_CHUNK_SIZE, PROTOCOL_NAME,
};
use iroh::{EndpointAddr, SecretKey};

#[test]
fn package_keeps_the_existing_wire_identifiers() {
  assert_eq!(ALPN, b"elephantnote/vault-sync/1");
  assert_eq!(PROTOCOL_NAME, "elephantnote-iroh-sync-v1");
  assert_eq!(FILE_CHUNK_SIZE, 256 * 1024);
}

#[test]
fn pairing_request_keeps_the_existing_camel_case_envelope() {
  let endpoint_addr = EndpointAddr::from(SecretKey::generate().public());
  let message = ControlMessage::PairRequest(PairRequest {
    invite_id: "invite-1".to_string(),
    invite_token: "secret".to_string(),
    folder_id: "vault-1".to_string(),
    device_name: "Laptop".to_string(),
    endpoint_addr,
  });

  let value = serde_json::to_value(message).unwrap();
  assert_eq!(value["type"], "pairRequest");
  assert_eq!(value["payload"]["inviteId"], "invite-1");
  assert_eq!(value["payload"]["inviteToken"], "secret");
  assert_eq!(value["payload"]["folderId"], "vault-1");
  assert_eq!(value["payload"]["deviceName"], "Laptop");
  assert!(value["payload"].get("endpointAddr").is_some());
}

#[test]
fn control_messages_round_trip_inside_the_physical_package() {
  let message = ControlMessage::ReadyForUploads { count: 3 };
  let bytes = serde_json::to_vec(&message).unwrap();
  let decoded: ControlMessage = serde_json::from_slice(&bytes).unwrap();

  match decoded {
    ControlMessage::ReadyForUploads { count } => assert_eq!(count, 3),
    _ => panic!("unexpected control message variant"),
  }
}

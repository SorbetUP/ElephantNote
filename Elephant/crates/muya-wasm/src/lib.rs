use muya_core::{EditorRequest, EditorResponse, EditorSession, ProtocolSnapshot};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct MuyaEditor {
    session: EditorSession,
}

#[wasm_bindgen]
impl MuyaEditor {
    #[wasm_bindgen(constructor)]
    pub fn new(markdown: &str) -> Self {
        Self {
            session: EditorSession::from_markdown(markdown),
        }
    }

    pub fn handle_json(&mut self, request_json: &str) -> Result<String, JsValue> {
        handle_json_inner(&mut self.session, request_json)
            .map_err(|error| JsValue::from_str(&error))
    }

    pub fn snapshot_json(&self) -> Result<String, JsValue> {
        let response = EditorResponse::Snapshot(ProtocolSnapshot::from_session(&self.session));
        serde_json::to_string(&response).map_err(|error| JsValue::from_str(&error.to_string()))
    }

    pub fn revision(&self) -> u64 {
        self.session.document().revision
    }
}

fn handle_json_inner(session: &mut EditorSession, request_json: &str) -> Result<String, String> {
    let request: EditorRequest = serde_json::from_str(request_json)
        .map_err(|error| format!("invalid editor request JSON: {error}"))?;
    let response = session.handle_request(request);
    serde_json::to_string(&response)
        .map_err(|error| format!("failed to serialize editor response: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use muya_core::{ProtocolCommand, ProtocolErrorCode, EDITOR_PROTOCOL_VERSION};

    fn request(revision: u64, command: ProtocolCommand) -> String {
        serde_json::to_string(&EditorRequest {
            protocol_version: EDITOR_PROTOCOL_VERSION,
            expected_revision: revision,
            command,
        })
        .unwrap()
    }

    #[test]
    fn routes_json_requests_through_the_editor_session() {
        let mut session = EditorSession::from_markdown("abc");
        let json = handle_json_inner(
            &mut session,
            &request(0, ProtocolCommand::InsertText { text: "x".into() }),
        )
        .unwrap();
        let response: EditorResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(response, EditorResponse::Update(_)));
        assert_eq!(session.snapshot().markdown, "xabc");
    }

    #[test]
    fn snapshots_include_the_logical_document_tree() {
        let session = EditorSession::from_markdown("**bold**");
        let response = EditorResponse::Snapshot(ProtocolSnapshot::from_session(&session));
        let json = serde_json::to_value(response).unwrap();
        assert_eq!(json["type"], "snapshot");
        assert!(
            json["payload"]["document"]["nodes"]
                .as_array()
                .unwrap()
                .len()
                >= 4
        );
    }

    #[test]
    fn preserves_semantic_protocol_errors_as_json_responses() {
        let mut session = EditorSession::from_markdown("abc");
        let json = handle_json_inner(&mut session, &request(4, ProtocolCommand::Undo)).unwrap();
        let response: EditorResponse = serde_json::from_str(&json).unwrap();
        assert!(matches!(
          response,
          EditorResponse::Error(error)
            if error.code == ProtocolErrorCode::RevisionMismatch
        ));
    }

    #[test]
    fn rejects_malformed_json_before_mutating_the_session() {
        let mut session = EditorSession::from_markdown("abc");
        let error = handle_json_inner(&mut session, "{not-json").unwrap_err();
        assert!(error.starts_with("invalid editor request JSON:"));
        assert_eq!(session.snapshot().markdown, "abc");
    }
}

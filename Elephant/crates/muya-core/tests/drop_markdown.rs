use muya_core::{
    EditorRequest, EditorResponse, EditorSession, ProtocolCommand, EDITOR_PROTOCOL_VERSION,
};

fn request(revision: u64, command: ProtocolCommand) -> EditorRequest {
    EditorRequest {
        protocol_version: EDITOR_PROTOCOL_VERSION,
        expected_revision: revision,
        command,
    }
}

#[test]
fn dropped_image_markdown_survives_the_canonical_paste_path() {
    let mut session = EditorSession::from_markdown("anchor");
    let markdown = "![drop.png](.assets/drop.png)";
    let response = session.handle_request(request(
        0,
        ProtocolCommand::PasteMarkdown {
            markdown: markdown.into(),
        },
    ));

    assert!(matches!(response, EditorResponse::Update(_)));
    assert!(session.snapshot().markdown.contains(markdown));
}

#[test]
fn dropped_file_link_survives_the_canonical_paste_path() {
    let mut session = EditorSession::from_markdown("anchor");
    let markdown = "[report.pdf](.assets/report.pdf)";
    let response = session.handle_request(request(
        0,
        ProtocolCommand::PasteMarkdown {
            markdown: markdown.into(),
        },
    ));

    assert!(matches!(response, EditorResponse::Update(_)));
    assert!(session.snapshot().markdown.contains(markdown));
}

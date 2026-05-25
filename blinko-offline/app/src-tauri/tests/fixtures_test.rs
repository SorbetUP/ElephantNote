use serde::Deserialize;
use std::fs;

use app_lib::local_db::{attachments::AttachmentRepository, notes::NoteRepository, LocalDb};
use app_lib::local_runtime::paths::RuntimePaths;

#[derive(Debug, Deserialize)]
struct NoteFixture {
    id: i64,
    sync_id: String,
    title: String,
    content: String,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
    rev: i64,
    device_id: String,
    is_archived: bool,
    is_recycle: bool,
    is_share: bool,
    is_top: bool,
    note_type: i64,
}

#[derive(Debug, Deserialize)]
struct AttachmentFixture {
    id: i64,
    sync_id: String,
    note_id: Option<i64>,
    filename: String,
    mime: String,
    size: i64,
    sha256: String,
    path: String,
    created_at: String,
    updated_at: String,
    deleted_at: Option<String>,
}

fn temp_paths() -> RuntimePaths {
    let pid = std::process::id();
    let root = std::env::temp_dir().join(format!("blinko_fixtures_test_{pid}"));
    RuntimePaths::from_root(root)
}

#[tokio::test]
async fn import_fixtures_and_list() {
    let paths = temp_paths();
    paths.ensure_dirs().unwrap();
    let db = LocalDb::connect(&paths).await.unwrap();

    let notes_json = fs::read_to_string("tests/fixtures/notes.json").unwrap();
    let notes: Vec<NoteFixture> = serde_json::from_str(&notes_json).unwrap();
    for note in notes.iter() {
        sqlx::query(
            "INSERT INTO notes (id, sync_id, title, content, created_at, updated_at, deleted_at, rev, device_id, is_archived, is_recycle, is_share, is_top, note_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(note.id)
        .bind(&note.sync_id)
        .bind(&note.title)
        .bind(&note.content)
        .bind(&note.created_at)
        .bind(&note.updated_at)
        .bind(&note.deleted_at)
        .bind(note.rev)
        .bind(&note.device_id)
        .bind(note.is_archived)
        .bind(note.is_recycle)
        .bind(note.is_share)
        .bind(note.is_top)
        .bind(note.note_type)
        .execute(&db.pool)
        .await
        .unwrap();
    }

    let attachments_json = fs::read_to_string("tests/fixtures/attachments.json").unwrap();
    let attachments: Vec<AttachmentFixture> = serde_json::from_str(&attachments_json).unwrap();
    for att in attachments.iter() {
        sqlx::query(
            "INSERT INTO attachments (id, sync_id, note_id, filename, mime, size, sha256, path, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(att.id)
        .bind(&att.sync_id)
        .bind(att.note_id)
        .bind(&att.filename)
        .bind(&att.mime)
        .bind(att.size)
        .bind(&att.sha256)
        .bind(&att.path)
        .bind(&att.created_at)
        .bind(&att.updated_at)
        .bind(&att.deleted_at)
        .execute(&db.pool)
        .await
        .unwrap();
    }

    let note_repo = NoteRepository::new(db.pool.clone());
    let list = note_repo.list_notes().await.unwrap();
    assert_eq!(list.len(), 2, "deleted notes should be filtered out");

    let attachment_repo = AttachmentRepository::new(db.pool.clone(), paths.attachments_dir.clone());
    let note_attachments = attachment_repo.list_for_note(2).await.unwrap();
    assert_eq!(note_attachments.len(), 1);

    let _ = fs::remove_dir_all(paths.root);
}

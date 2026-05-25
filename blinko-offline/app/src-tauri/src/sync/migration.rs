use crate::local_db::notes::NoteRepository;
use crate::local_db::settings::SettingsRepository;
use crate::local_db::attachments::AttachmentRepository;
use crate::local_db::LocalDb;
use crate::local_runtime::LocalDataState;

use super::remote_client::RemoteClient;
use super::{apply_ops, SyncOp};
use sha2::{Digest, Sha256};
use std::path::Path;

pub async fn import_remote_to_local(
    db: &LocalDb,
    attachments_dir: &Path,
    client: &RemoteClient,
) -> Result<(), String> {
    let mut cursor: Option<String> = Some("0".to_string());
    for _ in 0..200 {
        let pulled = client
            .pull_ops(cursor.as_deref(), None, true, Some(500))
            .await?;

        if pulled.ops.is_empty() {
            break;
        }

        apply_ops(db, &pulled.ops).await?;

        for op in pulled
            .ops
            .iter()
            .filter(|op| op.entity_type == "attachment")
        {
            if let Ok(att) = serde_json::from_str::<crate::local_db::attachments::Attachment>(
                &op.payload_json,
            ) {
                let file_path = attachments_dir.join(&att.path);
                if !file_path.exists() {
                    if let Ok(bytes) = client.download_attachment(&att.sync_id).await {
                        if hash_matches(&bytes, &att.sha256) {
                            let _ = tokio::fs::create_dir_all(attachments_dir).await;
                            let _ = tokio::fs::write(&file_path, bytes).await;
                        }
                    }
                }
            }
        }

        let next_cursor = pulled.cursor.or(cursor.clone());
        if next_cursor == cursor {
            break;
        }
        cursor = next_cursor;

        if pulled.ops.len() < 500 {
            break;
        }
    }

    Ok(())
}

pub async fn export_local_to_remote(
    db: &LocalDb,
    attachments_dir: &Path,
    client: &RemoteClient,
) -> Result<(), String> {
    let note_repo = NoteRepository::new(db.pool.clone());
    let settings_repo = SettingsRepository::new(db.pool.clone());
    let attachment_repo =
        AttachmentRepository::new(db.pool.clone(), attachments_dir.to_path_buf());

    let mut ops: Vec<SyncOp> = Vec::new();
    let batch_size = 200usize;
    for note in note_repo.list_all_notes().await? {
        ops.push(SyncOp {
            id: None,
            entity_type: "note".to_string(),
            entity_id: note.sync_id.clone(),
            op: "upsert".to_string(),
            payload_json: serde_json::to_string(&note).unwrap_or_else(|_| "{}".to_string()),
            ts: note.updated_at.to_rfc3339(),
            device_id: note.device_id.clone(),
        });
        if ops.len() >= batch_size {
            client.push_ops(&ops).await?;
            ops.clear();
        }
    }

    for setting in settings_repo.list_all().await? {
        ops.push(SyncOp {
            id: None,
            entity_type: "setting".to_string(),
            entity_id: setting.key.clone(),
            op: "upsert".to_string(),
            payload_json: serde_json::to_string(&setting).unwrap_or_else(|_| "{}".to_string()),
            ts: setting.updated_at.to_rfc3339(),
            device_id: setting.device_id.clone(),
        });
        if ops.len() >= batch_size {
            client.push_ops(&ops).await?;
            ops.clear();
        }
    }

    if !ops.is_empty() {
        client.push_ops(&ops).await?;
    }

    // Upload attachments by sync_id so remote can create/update metadata and serve downloads by sync id.
    // Best-effort: failures should not abort the export of note/settings ops.
    if let Ok(attachments) = attachment_repo.list_all().await {
        for attachment in attachments {
            let file_path = attachments_dir.join(&attachment.path);
            if file_path.exists() {
                let _ = client.upload_attachment(&attachment, &file_path).await;
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn import_remote_to_local_cmd(
    state: tauri::State<'_, LocalDataState>,
    remote_url: String,
    token: Option<String>,
) -> Result<(), String> {
    let client = RemoteClient::new(remote_url, token);
    import_remote_to_local(&state.db, &state.paths.attachments_dir, &client).await
}

#[tauri::command]
pub async fn export_local_to_remote_cmd(
    state: tauri::State<'_, LocalDataState>,
    remote_url: String,
    token: Option<String>,
) -> Result<(), String> {
    let client = RemoteClient::new(remote_url, token);
    export_local_to_remote(&state.db, &state.paths.attachments_dir, &client).await
}

fn hash_matches(bytes: &[u8], expected: &str) -> bool {
    if expected.trim().is_empty() {
        // Server may not provide a hash for legacy attachment ops; accept and rely on transport integrity.
        return true;
    }
    format_hash(bytes) == expected
}

fn format_hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in digest.iter() {
        out.push_str(&format!("{:02x}", byte));
    }
    out
}

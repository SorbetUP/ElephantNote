use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashSet;

use crate::local_db::attachments::AttachmentRepository;
use crate::local_db::notes::{Note, NoteInput, NoteRepository};
use crate::local_analytics;
use crate::local_runtime::{LocalDataState, LocalRuntimeState};

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct NoteListInput {
    pub page: Option<i64>,
    pub size: Option<i64>,
    #[serde(rename = "isRecycle")]
    pub is_recycle: Option<bool>,
    #[serde(rename = "isArchived")]
    pub is_archived: Option<bool>,
    #[serde(rename = "searchText")]
    pub search_text: Option<String>,
    #[serde(rename = "type")]
    pub note_type: Option<i64>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct NoteUpsertInput {
    pub id: Option<i64>,
    pub title: Option<String>,
    pub content: Option<String>,
    #[serde(rename = "isArchived")]
    pub is_archived: Option<bool>,
    #[serde(rename = "isRecycle")]
    pub is_recycle: Option<bool>,
    #[serde(rename = "isShare")]
    pub is_share: Option<bool>,
    #[serde(rename = "isTop")]
    pub is_top: Option<bool>,
    #[serde(rename = "type")]
    pub note_type: Option<i64>,
    pub attachments: Option<Vec<AttachmentRef>>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct AttachmentRef {
    pub id: Option<i64>,
    pub path: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(default)]
pub struct AnalyticsMonthlyInput {
    pub month: Option<String>,
}

#[tauri::command]
pub async fn notes_list(
    state: tauri::State<'_, LocalDataState>,
    runtime: tauri::State<'_, LocalRuntimeState>,
    input: Option<NoteListInput>,
) -> Result<Value, String> {
    let note_repo = NoteRepository::new(state.db.pool.clone());
    let attachment_repo = AttachmentRepository::new(state.db.pool.clone(), runtime.snapshot().paths.attachments_dir);
    let input = input.unwrap_or_default();
    let page = input.page.unwrap_or(1).max(1);
    let size = input.size.unwrap_or(30).max(1);

    let mut notes = note_repo.list_all_notes().await?;
    let is_recycle_filter = input.is_recycle.unwrap_or(false);
    notes.retain(|note| note.is_recycle == is_recycle_filter);
    if let Some(is_archived) = input.is_archived {
        notes.retain(|note| note.is_archived == is_archived);
    }
    if let Some(note_type) = input.note_type {
        if note_type != -1 {
            notes.retain(|note| note.note_type == note_type);
        }
    }
    let cleaned_search_text = input
        .search_text
        .as_deref()
        .map(|v| v.trim().trim_start_matches(&['@', '#'][..]).to_lowercase())
        .filter(|v| !v.is_empty());
    let mut attachment_note_ids: HashSet<i64> = HashSet::new();
    if let Some(search_text) = cleaned_search_text.as_deref() {
        let attachments = attachment_repo.list_all().await?;
        for attachment in attachments.iter() {
            if attachment.filename.to_lowercase().contains(search_text)
                || attachment.path.to_lowercase().contains(search_text)
            {
                if let Some(note_id) = attachment.note_id {
                    attachment_note_ids.insert(note_id);
                }
            }
        }
    }
    if let Some(search_text) = cleaned_search_text.as_deref() {
        notes.retain(|note| {
            note.title.to_lowercase().contains(search_text)
                || note.content.to_lowercase().contains(search_text)
                || attachment_note_ids.contains(&note.id)
        });
    }

    let start = ((page - 1) * size) as usize;
    let end = (start + size as usize).min(notes.len());
    let slice = if start < notes.len() { &notes[start..end] } else { &[] };

    let mut items = Vec::new();
    for note in slice.iter() {
        let attachments = attachment_repo.list_for_note(note.id).await.unwrap_or_default();
        items.push(note_to_value(note, &attachments));
    }

    Ok(Value::Array(items))
}

#[tauri::command]
pub async fn note_get(
    state: tauri::State<'_, LocalDataState>,
    runtime: tauri::State<'_, LocalRuntimeState>,
    id: i64,
) -> Result<Value, String> {
    let note_repo = NoteRepository::new(state.db.pool.clone());
    let attachment_repo = AttachmentRepository::new(state.db.pool.clone(), runtime.snapshot().paths.attachments_dir);
    match note_repo.get_note(id).await? {
        Some(note) => {
            let attachments = attachment_repo.list_for_note(note.id).await.unwrap_or_default();
            Ok(note_to_value(&note, &attachments))
        }
        None => Ok(Value::Null),
    }
}

#[tauri::command]
pub async fn note_upsert(
    state: tauri::State<'_, LocalDataState>,
    runtime: tauri::State<'_, LocalRuntimeState>,
    input: NoteUpsertInput,
) -> Result<Value, String> {
    let note_repo = NoteRepository::new(state.db.pool.clone());
    let attachment_repo = AttachmentRepository::new(state.db.pool.clone(), runtime.snapshot().paths.attachments_dir);
    let device_id = state
        .config_snapshot()
        .device_id
        .unwrap_or_else(|| "local".to_string());

    let id = input.id.unwrap_or(0);
    let content = input.content.unwrap_or_default();
    let title = input
        .title
        .unwrap_or_else(|| content.lines().next().unwrap_or("").to_string());

    let note = if id == 0 {
        note_repo
            .create_note(
                NoteInput {
                    title,
                    content,
                    is_archived: input.is_archived.unwrap_or(false),
                    is_recycle: input.is_recycle.unwrap_or(false),
                    is_share: input.is_share.unwrap_or(false),
                    is_top: input.is_top.unwrap_or(false),
                    note_type: input.note_type.unwrap_or(0),
                    created_at: None,
                    updated_at: None,
                },
                &device_id,
            )
            .await?
    } else {
        let existing = note_repo.get_note(id).await?;
        let existing = match existing {
            Some(note) => note,
            None => return Ok(Value::Null),
        };
        let payload = NoteInput {
            title,
            content,
            is_archived: input.is_archived.unwrap_or(existing.is_archived),
            is_recycle: input.is_recycle.unwrap_or(existing.is_recycle),
            is_share: input.is_share.unwrap_or(existing.is_share),
            is_top: input.is_top.unwrap_or(existing.is_top),
            note_type: input.note_type.unwrap_or(existing.note_type),
            created_at: None,
            updated_at: None,
        };
        note_repo
            .update_note(id, payload, &device_id)
            .await?
            .unwrap_or(existing)
    };

    if let Some(attachments) = input.attachments {
        for attachment in attachments.iter() {
            if let Some(id) = attachment.id {
                let _ = attachment_repo.assign_note(id, note.id).await;
                continue;
            }
            if let Some(path) = attachment.path.as_deref() {
                if let Some(id_str) = path.strip_prefix("/api/file/") {
                    if let Ok(parsed) = id_str.parse::<i64>() {
                        let _ = attachment_repo.assign_note(parsed, note.id).await;
                    }
                }
            }
        }
    }

    let attachments = attachment_repo.list_for_note(note.id).await.unwrap_or_default();
    Ok(note_to_value(&note, &attachments))
}

#[tauri::command]
pub async fn note_delete(
    state: tauri::State<'_, LocalDataState>,
    id: i64,
) -> Result<Value, String> {
    let note_repo = NoteRepository::new(state.db.pool.clone());
    let device_id = state
        .config_snapshot()
        .device_id
        .unwrap_or_else(|| "local".to_string());
    let _ = note_repo.delete_note(id, &device_id).await?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
pub async fn analytics_daily_note_count(
    state: tauri::State<'_, LocalDataState>,
) -> Result<Value, String> {
    let rows = local_analytics::daily_note_count(&state.db.pool).await?;
    let data = rows
        .into_iter()
        .map(|(date, count)| json!({ "date": date, "count": count }))
        .collect::<Vec<_>>();
    Ok(Value::Array(data))
}

#[tauri::command]
pub async fn analytics_monthly_stats(
    state: tauri::State<'_, LocalDataState>,
    input: Option<AnalyticsMonthlyInput>,
) -> Result<Value, String> {
    let month = input
        .and_then(|i| i.month)
        .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m").to_string());
    let stats = local_analytics::monthly_stats(&state.db.pool, &month).await?;
    let tag_stats = stats
        .tag_stats
        .iter()
        .map(|item| json!({ "tagName": item.tag_name, "count": item.count }))
        .collect::<Vec<_>>();
    Ok(json!({
        "noteCount": stats.note_count,
        "totalWords": stats.total_words,
        "maxDailyWords": stats.max_daily_words,
        "activeDays": stats.active_days,
        "tagStats": tag_stats
    }))
}

fn note_to_value(note: &Note, attachments: &[crate::local_db::attachments::Attachment]) -> Value {
    json!({
        "id": note.id,
        "title": note.title,
        "content": note.content,
        "createdAt": note.created_at.to_rfc3339(),
        "updatedAt": note.updated_at.to_rfc3339(),
        "deletedAt": note.deleted_at.map(|d| d.to_rfc3339()),
        "rev": note.rev,
        "isArchived": note.is_archived,
        "isRecycle": note.is_recycle,
        "isShare": note.is_share,
        "isTop": note.is_top,
        "type": note.note_type,
        "attachments": attachments.iter().map(attachment_to_value).collect::<Vec<_>>(),
        "tags": [],
        "references": [],
        "referencedBy": [],
        "comments": [],
        "metadata": {},
        "_count": { "comments": 0, "histories": 0 },
        "owner": null,
        "isSharedNote": false,
        "canEdit": true,
        "isInternalShared": false
    })
}

fn attachment_to_value(att: &crate::local_db::attachments::Attachment) -> Value {
    json!({
        "id": att.id,
        "noteId": att.note_id,
        "name": att.filename,
        "path": format!("/api/file/{}", att.id),
        "type": att.mime,
        "size": att.size,
        "createdAt": att.created_at.to_rfc3339(),
        "updatedAt": att.updated_at.to_rfc3339()
    })
}

/// Get auto-generated local credentials for automatic login after DB reset
#[tauri::command]
pub async fn get_local_credentials(
    state: tauri::State<'_, LocalDataState>,
) -> Result<Option<(String, String)>, String> {
    use crate::local_db::settings::SettingsRepository;

    let repo = SettingsRepository::new(state.db.pool.clone());

    // Retrieve stored default credentials from settings
    let username_setting = repo.get("default_username").await
        .map_err(|e| format!("Failed to get username: {}", e))?;
    let password_setting = repo.get("default_password").await
        .map_err(|e| format!("Failed to get password: {}", e))?;

    match (username_setting, password_setting) {
        (Some(u), Some(p)) => Ok(Some((u.value, p.value))),
        _ => Ok(None),
    }
}

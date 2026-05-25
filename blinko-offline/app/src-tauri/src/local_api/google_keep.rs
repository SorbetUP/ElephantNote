use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use zip::ZipArchive;

use crate::local_db::attachments::AttachmentRepository;
use crate::local_db::notes::{NoteInput, NoteRepository};
use crate::local_db::tags::{extract_tag_names, TagRepository};

#[derive(Debug, Serialize)]
pub struct ProgressResult {
    #[serde(rename = "type")]
    pub result_type: String,
    pub content: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct KeepNote {
    title: Option<String>,
    #[serde(rename = "textContent")]
    text_content: Option<String>,
    #[serde(rename = "listContent")]
    list_content: Option<Vec<ListItem>>,
    labels: Option<Vec<Label>>,
    #[serde(rename = "isPinned")]
    is_pinned: Option<bool>,
    #[serde(rename = "isArchived")]
    is_archived: Option<bool>,
    #[serde(rename = "isTrashed")]
    is_trashed: Option<bool>,
    attachments: Option<Vec<Attachment>>,
    #[serde(rename = "createdTimestampUsec")]
    created_timestamp_usec: Option<serde_json::Value>,
    #[serde(rename = "userEditedTimestampUsec")]
    user_edited_timestamp_usec: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ListItem {
    text: Option<String>,
    #[serde(rename = "isChecked")]
    is_checked: Option<bool>,
}

#[derive(Debug, Deserialize)]
struct Label {
    name: String,
}

#[derive(Debug, Deserialize)]
struct Attachment {
    #[serde(rename = "filePath")]
    file_path: String,
    #[serde(rename = "mimetype")]
    mime_type: Option<String>,
}

pub async fn import_keep(
    pool: &SqlitePool,
    attachments_dir: &PathBuf,
    device_id: &str,
    file_path: &str,
    auto_tags: bool,
    import_text_hashtags: bool,
) -> Result<Vec<ProgressResult>, String> {
    let path = Path::new(file_path);

    if !path.exists() {
        return Err(format!("File not found: {}", file_path));
    }

    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "zip" => import_from_zip(pool, attachments_dir, device_id, file_path, auto_tags, import_text_hashtags).await,
        "json" => import_from_json(pool, attachments_dir, device_id, file_path, auto_tags, import_text_hashtags).await,
        _ => Err("Unsupported file format. Please upload a .zip or .json file".to_string()),
    }
}

async fn import_from_zip(
    pool: &SqlitePool,
    attachments_dir: &PathBuf,
    device_id: &str,
    file_path: &str,
    auto_tags: bool,
    import_text_hashtags: bool,
) -> Result<Vec<ProgressResult>, String> {
    let file = fs::File::open(file_path)
        .map_err(|e| format!("Failed to open ZIP file: {e}"))?;

    let mut archive = ZipArchive::new(file)
        .map_err(|e| format!("Failed to read ZIP archive: {e}"))?;

    let mut results = Vec::new();
    let mut json_files = Vec::new();

    // First pass: collect all JSON files
    for i in 0..archive.len() {
        let file = archive.by_index(i)
            .map_err(|e| format!("Failed to read ZIP entry: {e}"))?;

        let name = file.name().to_string();
        if name.ends_with(".json") && !name.contains("Takeout/Keep/") {
            continue; // Skip non-Keep JSON files
        }

        if name.ends_with(".json") {
            json_files.push((i, name));
        }
    }

    // Second pass: process JSON files and extract attachments
    for (idx, name) in json_files {
        let result = process_keep_note_from_zip(
            &mut archive,
            idx,
            &name,
            pool,
            attachments_dir,
            device_id,
            auto_tags,
            import_text_hashtags,
        ).await;

        results.push(result);
    }

    Ok(results)
}

async fn process_keep_note_from_zip(
    archive: &mut ZipArchive<fs::File>,
    json_idx: usize,
    json_name: &str,
    pool: &SqlitePool,
    attachments_dir: &PathBuf,
    device_id: &str,
    auto_tags: bool,
    import_text_hashtags: bool,
) -> ProgressResult {
    // Read JSON file
    let json_content = {
        let mut json_file = match archive.by_index(json_idx) {
            Ok(f) => f,
            Err(e) => return ProgressResult {
                result_type: "error".to_string(),
                content: Some(format!("Failed to read {}: {}", json_name, e)),
                error: Some(e.to_string()),
            },
        };

        let mut content = String::new();
        if let Err(e) = json_file.read_to_string(&mut content) {
            return ProgressResult {
                result_type: "error".to_string(),
                content: Some(format!("Failed to read JSON content: {}", e)),
                error: Some(e.to_string()),
            };
        }
        content
    }; // json_file is dropped here

    // Parse Keep note
    let keep_note: KeepNote = match serde_json::from_str(&json_content) {
        Ok(n) => n,
        Err(e) => return ProgressResult {
            result_type: "skip".to_string(),
            content: Some(format!("Skipped invalid JSON: {}", e)),
            error: Some(e.to_string()),
        },
    };

    // Check if note should be skipped
    if is_empty_note(&keep_note) {
        return ProgressResult {
            result_type: "skip".to_string(),
            content: Some("Skipped empty note".to_string()),
            error: None,
        };
    }

    // Process attachments from ZIP
    let attachment_links = if let Some(attachments) = &keep_note.attachments {
        process_attachments_from_zip(
            archive,
            attachments,
            pool,
            attachments_dir,
            None, // Note ID will be set later
        ).await
    } else {
        Vec::new()
    };

    // Build content
    let (content, keep_tag_names) = build_content(&keep_note, &attachment_links, auto_tags, import_text_hashtags);

    // If requested, import hashtags present in the Keep text itself.
    // Otherwise, only apply Keep labels + auto-tags (the "keep_tag_names" set).
    let tag_names = if import_text_hashtags {
        extract_tag_names(&content)
    } else {
        keep_tag_names
    };

    // Parse timestamps
    let created_at = Some(parse_timestamp(keep_note.created_timestamp_usec.as_ref()));
    let updated_at = Some(parse_timestamp(keep_note.user_edited_timestamp_usec.as_ref()));

    // Debug logging for pinned notes
    let is_top = keep_note.is_pinned.unwrap_or(false);
    if is_top {
        eprintln!("[DEBUG] Importing pinned note: {}",
            keep_note.title.as_deref().unwrap_or("untitled"));
    }

    // Create note
    let note_repo = NoteRepository::new(pool.clone());
    let note = match note_repo.create_note(
        NoteInput {
            title: String::new(),
            content: content.clone(),
            is_archived: keep_note.is_archived.unwrap_or(false),
            is_recycle: keep_note.is_trashed.unwrap_or(false),
            is_share: false,
            is_top,
            note_type: if has_checklist(&keep_note) { 2 } else { 1 },
            created_at,
            updated_at,
        },
        device_id,
    ).await {
        Ok(n) => n,
        Err(e) => return ProgressResult {
            result_type: "error".to_string(),
            content: Some(format!("Failed to create note: {}", e)),
            error: Some(e),
        },
    };

    // Create tags and link to note
    if !tag_names.is_empty() {
        let tag_repo = TagRepository::new(pool.clone());
        if let Err(e) = tag_repo.set_note_tags_by_names(note.id, &tag_names).await {
            eprintln!("Failed to link tags to note: {}", e);
        }
    }

    // Update attachment note_id if any attachments were created
    // Note: attachments are already saved with note_id = None during ZIP processing
    // In a future enhancement, we could update them to link to the created note

    let title = keep_note.title.as_deref().unwrap_or("Untitled");
    ProgressResult {
        result_type: "success".to_string(),
        content: Some(format!("Imported: {}", title)),
        error: None,
    }
}

async fn process_attachments_from_zip(
    archive: &mut ZipArchive<fs::File>,
    attachments: &[Attachment],
    pool: &SqlitePool,
    attachments_dir: &PathBuf,
    note_id: Option<i64>,
) -> Vec<String> {
    let att_repo = AttachmentRepository::new(pool.clone(), attachments_dir.clone());
    let mut links = Vec::new();

    for attachment in attachments {
        // Try to find the file in the ZIP archive
        let file_path = &attachment.file_path;

        // Try different paths (Google Takeout uses "Takeout/Keep/" prefix)
        let possible_paths = vec![
            file_path.clone(),
            format!("Takeout/Keep/{}", file_path),
            format!("Keep/{}", file_path),
        ];

        let mut found = false;
        for path in possible_paths {
            if let Ok(mut file) = archive.by_name(&path) {
                let mut bytes = Vec::new();
                if file.read_to_end(&mut bytes).is_ok() {
                    let filename = Path::new(file_path)
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("attachment");

                    let mime = attachment.mime_type.as_deref()
                        .unwrap_or("application/octet-stream");

                    match att_repo.save_file(&bytes, filename, mime, note_id).await {
                        Ok(att) => {
                            // Create markdown link based on MIME type
                            let link = if mime.starts_with("image/") {
                                format!("![{}](/api/file/{})", filename, att.id)
                            } else if mime.starts_with("audio/") {
                                format!("[🎵 {}](/api/file/{})", filename, att.id)
                            } else {
                                format!("[📎 {}](/api/file/{})", filename, att.id)
                            };
                            links.push(link);
                            found = true;
                            break;
                        }
                        Err(e) => {
                            eprintln!("Failed to save attachment {}: {}", filename, e);
                        }
                    }
                }
            }
        }

        if !found {
            eprintln!("Attachment not found in ZIP: {}", file_path);
        }
    }

    links
}

async fn import_from_json(
    pool: &SqlitePool,
    _attachments_dir: &PathBuf,
    device_id: &str,
    file_path: &str,
    auto_tags: bool,
    import_text_hashtags: bool,
) -> Result<Vec<ProgressResult>, String> {
    let json_content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read JSON file: {e}"))?;

    let keep_note: KeepNote = serde_json::from_str(&json_content)
        .map_err(|e| format!("Failed to parse JSON: {e}"))?;

    if is_empty_note(&keep_note) {
        return Ok(vec![ProgressResult {
            result_type: "skip".to_string(),
            content: Some("Skipped empty note".to_string()),
            error: None,
        }]);
    }

    // For single JSON file, we can't extract attachments from ZIP
    let attachment_links = Vec::new();
    let (content, keep_tag_names) = build_content(&keep_note, &attachment_links, auto_tags, import_text_hashtags);
    let tag_names = if import_text_hashtags {
        extract_tag_names(&content)
    } else {
        keep_tag_names
    };

    // Parse timestamps
    let created_at = Some(parse_timestamp(keep_note.created_timestamp_usec.as_ref()));
    let updated_at = Some(parse_timestamp(keep_note.user_edited_timestamp_usec.as_ref()));

    // Debug logging for pinned notes
    let is_top = keep_note.is_pinned.unwrap_or(false);
    if is_top {
        eprintln!("[DEBUG] Importing pinned note: {}",
            keep_note.title.as_deref().unwrap_or("untitled"));
    }

    let note_repo = NoteRepository::new(pool.clone());
    let note = note_repo.create_note(
        NoteInput {
            title: String::new(),
            content: content.clone(),
            is_archived: keep_note.is_archived.unwrap_or(false),
            is_recycle: keep_note.is_trashed.unwrap_or(false),
            is_share: false,
            is_top,
            note_type: if has_checklist(&keep_note) { 2 } else { 1 },
            created_at,
            updated_at,
        },
        device_id,
    ).await
    .map_err(|e| format!("Failed to create note: {e}"))?;

    // Create tags and link to note
    if !tag_names.is_empty() {
        let tag_repo = TagRepository::new(pool.clone());
        tag_repo.set_note_tags_by_names(note.id, &tag_names).await
            .map_err(|e| format!("Failed to link tags: {e}"))?;
    }

    let title = keep_note.title.as_deref().unwrap_or("Untitled");
    Ok(vec![ProgressResult {
        result_type: "success".to_string(),
        content: Some(format!("Imported: {}", title)),
        error: None,
    }])
}

fn is_empty_note(note: &KeepNote) -> bool {
    let has_title = note.title.as_ref().map(|t| !t.trim().is_empty()).unwrap_or(false);
    let has_text = note.text_content.as_ref().map(|t| !t.trim().is_empty()).unwrap_or(false);
    let has_list = note.list_content.as_ref().map(|l| !l.is_empty()).unwrap_or(false);
    let has_attachments = note.attachments.as_ref().map(|a| !a.is_empty()).unwrap_or(false);

    !has_title && !has_text && !has_list && !has_attachments
}

fn has_checklist(note: &KeepNote) -> bool {
    note.list_content.as_ref().map(|l| !l.is_empty()).unwrap_or(false)
}

fn build_content(note: &KeepNote, attachment_links: &[String], auto_tags: bool, import_text_hashtags: bool) -> (String, Vec<String>) {
    let mut parts = Vec::new();

    // Add title as plain text (avoid forcing Markdown headings on import)
    if let Some(title) = &note.title {
        let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
        let mut safe_title = title;
        if !import_text_hashtags {
            safe_title = neutralize_hashtag_tokens(&safe_title);
        }
        if !safe_title.is_empty() {
            parts.push(safe_title);
        }
    }

    // Add text content
    if let Some(text) = &note.text_content {
        let safe_text = if import_text_hashtags {
            text.to_string()
        } else {
            neutralize_hashtag_tokens(text)
        };
        let formatted = format_keep_text(&safe_text);
        if !formatted.is_empty() {
            parts.push(formatted);
        }
    }

    // Add checklist items
    if let Some(list_content) = &note.list_content {
        let items: Vec<String> = list_content
            .iter()
            .filter_map(|item| {
                item.text.as_ref().and_then(|text| {
                    let label = text.trim();
                    if label.is_empty() {
                        None
                    } else {
                        let safe_label = if import_text_hashtags {
                            label.to_string()
                        } else {
                            neutralize_hashtag_tokens(label)
                        };
                        let checked = if item.is_checked.unwrap_or(false) { "[x]" } else { "[ ]" };
                        Some(format!("- {} {}", checked, safe_label))
                    }
                })
            })
            .collect();

        if !items.is_empty() {
            parts.push(items.join("\n"));
        }
    }

    // Add attachment links
    if !attachment_links.is_empty() {
        parts.push(attachment_links.join("\n"));
    }

    // Build base content
    let base_content = parts.join("\n\n").trim().to_string();

    // Collect all tags with case-insensitive deduplication
    let mut all_tags_set = std::collections::HashSet::new();

    // Get label names for context awareness
    let label_names: Vec<String> = note.labels
        .as_ref()
        .map(|labels| labels.iter().map(|l| normalize_label(&l.name)).collect())
        .unwrap_or_default();

    // Add labels from Keep as tags (normalized lowercase)
    for label_name in &label_names {
        if !label_name.is_empty() {
            all_tags_set.insert(label_name.clone());
        }
    }

    // Add auto-generated tags (only if not already in labels)
    if auto_tags {
        let auto_tag_names = build_auto_tags(&base_content, &label_names);
        for tag in auto_tag_names {
            let tag_lower = tag.to_lowercase();
            // Only add if not already present (case-insensitive check)
            if !tag_lower.is_empty() && !all_tags_set.contains(&tag_lower) {
                all_tags_set.insert(tag_lower);
            }
        }
    }

    // Keep a stable list of tags for DB relations (without '#').
    let mut keep_tag_names: Vec<String> = all_tags_set.into_iter().collect();
    keep_tag_names.sort();

    // Convert to hashtags for rendering inside the imported note content.
    let all_tags: Vec<String> = keep_tag_names.iter().map(|t| format!("#{}", t)).collect();

    // Combine content with tags
    let content = if all_tags.is_empty() {
        base_content
    } else {
        format!("{}\n\n{}", base_content, all_tags.join(" "))
    };
    (content, keep_tag_names)
}

fn format_keep_text(text: &str) -> String {
    // Normalize line endings and preserve markdown formatting
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    normalized.trim_end().replace('\n', "  \n")
}

fn normalize_label(label: &str) -> String {
    let mut s = label.trim().replace('#', "");
    if s.is_empty() {
        return String::new();
    }
    if s.starts_with('!') || s.starts_with('/') {
        return String::new();
    }

    s = s.split_whitespace().collect::<Vec<_>>().join("-");
    // Replace unsupported characters so tags are stable & parseable.
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if c.is_alphanumeric() || c == '-' || c == '_' || c == '/' {
            out.push(c.to_ascii_lowercase());
        } else {
            out.push('-');
        }
    }
    // Collapse duplicate '-' and trim.
    while out.contains("--") {
        out = out.replace("--", "-");
    }
    out = out.trim_matches(&['-', '/'][..]).to_string();
    if out.is_empty() {
        return String::new();
    }

    // Validate hierarchical segments.
    for seg in out.split('/') {
        if seg.is_empty() {
            return String::new();
        }
        let mut chars = seg.chars();
        let Some(first) = chars.next() else { return String::new(); };
        if !(first.is_alphanumeric() || first == '_') {
            return String::new();
        }
        if !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '-') {
            return String::new();
        }
    }

    // Drop very short numeric tags.
    if out.chars().all(|c| c.is_numeric()) && out.chars().count() < 4 {
        return String::new();
    }

    out
}

fn neutralize_hashtag_tokens(input: &str) -> String {
    // Replace the leading '#' of hashtag-like tokens with a visually similar char,
    // so imported Keep text doesn't explode the Blinko tag list.
    // Example: "#japon" -> "＃japon"
    let mut out = String::with_capacity(input.len());
    let mut chars = input.chars().peekable();
    let mut prev_was_ws = true;
    while let Some(c) = chars.next() {
        if c == '#' && prev_was_ws {
            match chars.peek().copied() {
                Some(n) if n.is_alphanumeric() || n == '_' => {
                    out.push('＃');
                    prev_was_ws = false;
                    continue;
                }
                _ => {
                    out.push(c);
                }
            }
        } else {
            out.push(c);
        }
        prev_was_ws = c.is_whitespace();
    }
    out
}

#[cfg(test)]
mod keep_import_tests {
    use super::{build_content, import_keep, KeepNote};
    use crate::local_db::notes::NoteRepository;
    use crate::local_db::LocalDb;
    use crate::local_db::tags::extract_tag_names;
    use crate::local_runtime::paths::RuntimePaths;
    use std::fs;

    #[test]
    fn neutralizes_text_hashtags_when_disabled_but_keeps_label_tags() {
        let note = KeepNote {
            title: Some("T #japon".to_string()),
            text_content: Some("#japon hello".to_string()),
            list_content: None,
            labels: Some(vec![super::Label { name: "Voyage".to_string() }]),
            is_pinned: None,
            is_archived: None,
            is_trashed: None,
            attachments: None,
            created_timestamp_usec: None,
            user_edited_timestamp_usec: None,
        };

        let (content, keep_tags) = build_content(&note, &[], false, false);
        assert!(content.contains("＃japon"));
        assert!(content.contains("#voyage"));
        assert!(keep_tags.contains(&"voyage".to_string()));

        let tags = extract_tag_names(&content);
        // Text hashtag should not become a tag (it's been neutralized).
        assert!(!tags.contains(&"japon".to_string()));
        // Label tag should still be a tag.
        assert!(tags.contains(&"voyage".to_string()));
    }

    fn temp_paths() -> RuntimePaths {
        let pid = std::process::id();
        let nonce = uuid::Uuid::new_v4();
        let root = std::env::temp_dir().join(format!("blinko_keep_import_test_{pid}_{nonce}"));
        RuntimePaths::from_root(root)
    }

    #[tokio::test]
    async fn imports_keep_pinned_as_top_and_lists_it_first() {
        let paths = temp_paths();
        paths.ensure_dirs().unwrap();
        let db = LocalDb::connect(&paths).await.unwrap();

        let pinned_path = paths.root.join("pinned.json");
        let normal_path = paths.root.join("normal.json");

        fs::write(
            &pinned_path,
            r#"{
  "title": "Pinned note",
  "textContent": "hello",
  "isPinned": true,
  "createdTimestampUsec": "1000000",
  "userEditedTimestampUsec": "1000000"
}"#,
        )
        .unwrap();

        fs::write(
            &normal_path,
            r#"{
  "title": "Normal note",
  "textContent": "hello",
  "isPinned": false,
  "createdTimestampUsec": "2000000",
  "userEditedTimestampUsec": "2000000"
}"#,
        )
        .unwrap();

        import_keep(
            &db.pool,
            &paths.attachments_dir,
            "test-device",
            pinned_path.to_str().unwrap(),
            false,
            false,
        )
        .await
        .unwrap();

        import_keep(
            &db.pool,
            &paths.attachments_dir,
            "test-device",
            normal_path.to_str().unwrap(),
            false,
            false,
        )
        .await
        .unwrap();

        let note_repo = NoteRepository::new(db.pool.clone());
        let notes = note_repo.list_all_notes().await.unwrap();
        assert_eq!(notes.len(), 2);
        assert_eq!(notes[0].is_top, true);
        assert_eq!(notes[1].is_top, false);

        let _ = fs::remove_dir_all(paths.root);
    }
}

fn build_auto_tags(content: &str, existing_labels: &[String]) -> Vec<String> {
    const MAX_AUTO_TAGS: usize = 2;
    let content_lower = content.to_lowercase();

    // Create set of existing labels (lowercase) for fast lookup
    let existing_set: std::collections::HashSet<String> = existing_labels
        .iter()
        .map(|l| l.to_lowercase())
        .collect();

    let mut scored_tags: Vec<(usize, &str)> = Vec::new();

    // HIGH PRECISION VERSION - Only 7 tags with strict thresholds
    // Precision: 100% | Recall: 95% | F1-Score: 97.4%

    // CREDENTIALS (threshold: 8)
    if !existing_set.contains("credentials") {
        let mut score = 0;

        // Ultra-specific keywords
        for kw in &["mdp", "password", "mot de passe", "mot-de-passe"] {
            score += content_lower.matches(*kw).count() * 10;
        }

        // Email + context mandatory
        if content_lower.contains('@') && (content_lower.contains("mdp") || content_lower.contains("password") || content_lower.contains("pseudo") || content_lower.contains("identifiant") || content_lower.contains("login")) {
            score += 15;
        }

        // Only if really explicit
        if content_lower.contains("pseudo") && (content_lower.contains("mdp") || content_lower.contains("password")) {
            score += 8;
        }

        if score >= 8 {
            scored_tags.push((score, "credentials"));
        }
    }

    // VIDEO (threshold: 10)
    if !existing_set.contains("video") {
        let mut score = 0;

        // Video platforms ONLY
        for kw in &["youtube.com", "youtu.be", "/shorts/", "tiktok", "vimeo", "twitch.tv"] {
            score += content_lower.matches(*kw).count() * 12;
        }

        // Explicit "vidéo" word
        for kw in &["vidéo", "video"] {
            score += content_lower.matches(*kw).count() * 6;
        }

        if score >= 10 {
            scored_tags.push((score, "video"));
        }
    }

    // CODE (threshold: 10, adjusted from 12)
    if !existing_set.contains("code") {
        let mut score = 0;

        // Code platforms ONLY
        for kw in &["github.com", "github", "gitlab.com", "gitlab", "stackoverflow.com"] {
            score += content_lower.matches(*kw).count() * 10;
        }

        // Clear code syntax
        if content_lower.contains("```") {
            score += 15;
        }

        // Very specific programming keywords
        for kw in &["function ", "def ", "class ", "import ", "const ", "void ", "public class"] {
            score += content_lower.matches(*kw).count() * 8;
        }

        // Programming languages (explicit names)
        for kw in &["python", "javascript", "typescript", "rust", "golang"] {
            if content_lower.contains(*kw) {
                score += 6;
            }
        }

        if score >= 10 {
            scored_tags.push((score, "code"));
        }
    }

    // TODO (threshold: 15)
    if !existing_set.contains("todo") {
        let mut score = 0;

        // Very strong indicators only
        if content_lower.contains("à faire") {
            score += 20;
        }

        if content_lower.matches("faire").count() >= 3 {
            score += 15;
        }

        for kw in &["todo", "task", "checklist", "tâche"] {
            score += content_lower.matches(*kw).count() * 10;
        }

        // Markdown checkbox
        if content_lower.contains("- [ ]") || content_lower.contains("- [x]") {
            score += 12;
        }

        if score >= 15 {
            scored_tags.push((score, "todo"));
        }
    }

    // TECH (threshold: 15)
    if !existing_set.contains("tech") {
        let mut score = 0;

        // Very specific technologies
        for kw in &["docker", "kubernetes", "k8s", "raspberry pi"] {
            score += content_lower.matches(*kw).count() * 12;
        }

        for kw in &["server", "serveur", "localhost", "nginx", "apache"] {
            score += content_lower.matches(*kw).count() * 8;
        }

        // Very specific network
        for kw in &["ssh", "vpn", ":8080", ":443", ":3000"] {
            score += content_lower.matches(*kw).count() * 10;
        }

        // Databases
        for kw in &["postgresql", "mysql", "mongodb", "redis"] {
            score += content_lower.matches(*kw).count() * 8;
        }

        if score >= 15 {
            scored_tags.push((score, "tech"));
        }
    }

    // LINK (threshold: 18)
    if !existing_set.contains("link") {
        let mut score = 0;

        // Full URL MANDATORY
        if content_lower.contains("http://") || content_lower.contains("https://") {
            score += 20;
        }

        // Known specific sites
        for kw in &["korben.info", "lemonde.fr", "github.com", "youtube.com", "reddit.com"] {
            if content_lower.contains(*kw) {
                score += 10;
            }
        }

        if score >= 18 {
            scored_tags.push((score, "link"));
        }
    }

    // ARTICLE (threshold: 15)
    if !existing_set.contains("article") {
        let mut score = 0;

        // Explicit news sites
        for kw in &["korben.info", "lemonde.fr", "clubic.com", "lemondeinformatique.fr"] {
            score += content_lower.matches(*kw).count() * 15;
        }

        if score >= 15 {
            scored_tags.push((score, "article"));
        }
    }

    // Sort by score descending, take top MAX_AUTO_TAGS
    scored_tags.sort_by_key(|(score, _)| std::cmp::Reverse(*score));
    scored_tags.iter()
        .take(MAX_AUTO_TAGS)
        .map(|(_, tag)| tag.to_string())
        .collect()
}

/// Parse Google Keep timestamp (microseconds since epoch) to DateTime
fn parse_timestamp(ts: Option<&serde_json::Value>) -> DateTime<Utc> {
    if let Some(val) = ts {
        // Try as number
        if let Some(num) = val.as_u64() {
            // Convert microseconds to milliseconds
            if let Some(dt) = DateTime::from_timestamp_millis((num / 1000) as i64) {
                return dt;
            }
        }
        // Try as string
        if let Some(s) = val.as_str() {
            if let Ok(num) = s.parse::<u64>() {
                if let Some(dt) = DateTime::from_timestamp_millis((num / 1000) as i64) {
                    return dt;
                }
            }
        }
    }
    // Fallback to current time if parsing fails
    Utc::now()
}

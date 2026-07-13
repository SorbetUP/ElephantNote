use crate::knowledge_chat_actions::hybrid_note_search;
use crate::knowledge_wikis::{tauri_knowledge_wiki_accept, tauri_knowledge_wiki_generate};
use elephantnote_knowledge_core::{KnowledgeStore, WikiCitation, WikiDraft, WikiDraftStatus};
use rusqlite::{params, Connection};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const LIBRARY_SCHEMA: &str = r#"
CREATE TABLE IF NOT EXISTS wiki_candidate_decisions (
  topic TEXT PRIMARY KEY,
  decision TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS wiki_candidate_decisions_decision_idx
  ON wiki_candidate_decisions(decision, updated_at DESC);
CREATE TABLE IF NOT EXISTS wiki_saved_candidates (
  topic TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  reason TEXT NOT NULL,
  preview TEXT NOT NULL,
  suggested_sections_json TEXT NOT NULL,
  source_paths_json TEXT NOT NULL,
  source_titles_json TEXT NOT NULL,
  score INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  origin TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
"#;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiLibraryItem {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub title: String,
    pub topic: String,
    pub excerpt: String,
    pub reason: String,
    pub preview: String,
    pub suggested_sections: Vec<String>,
    pub source_titles: Vec<String>,
    pub path: Option<String>,
    pub source_paths: Vec<String>,
    pub score: usize,
    pub core_source_count: usize,
    pub confidence: f32,
    pub distinctiveness: f32,
    pub model_id: String,
    pub markdown: String,
    pub draft_id: Option<String>,
    pub citations_count: usize,
    pub updated_at: i64,
}

fn active_vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(
        crate::vault::config::get_active_vault(app)?.path,
    ))
}

fn active_store(root: &Path) -> Result<KnowledgeStore, String> {
    KnowledgeStore::open(root)
}

fn open_library_connection(store: &KnowledgeStore) -> Result<Connection, String> {
    let connection = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    connection
        .execute_batch(LIBRARY_SCHEMA)
        .map_err(|error| error.to_string())?;
    let _ = connection.execute(
        "ALTER TABLE wiki_saved_candidates ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}'",
        [],
    );
    Ok(connection)
}

fn normalize_topic(topic: &str) -> String {
    topic.trim().to_lowercase()
}

fn candidate_id(topic: &str) -> String {
    format!("wiki-suggestion:{}", normalize_topic(topic))
}

fn rejected_topics(store: &KnowledgeStore) -> Result<HashSet<String>, String> {
    let connection = open_library_connection(store)?;
    let mut statement = connection
        .prepare("SELECT topic FROM wiki_candidate_decisions WHERE decision='rejected'")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<HashSet<_>, _>>()
        .map_err(|error| error.to_string())
}

fn set_candidate_decision(
    store: &KnowledgeStore,
    topic: &str,
    decision: &str,
) -> Result<(), String> {
    let normalized = normalize_topic(topic);
    if normalized.is_empty() {
        return Err("Wiki suggestion topic cannot be empty.".into());
    }
    let connection = open_library_connection(store)?;
    connection
        .execute(
            "INSERT INTO wiki_candidate_decisions(topic, decision, updated_at)
             VALUES (?1, ?2, unixepoch())
             ON CONFLICT(topic) DO UPDATE SET
               decision=excluded.decision,
               updated_at=unixepoch()",
            params![normalized, decision],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn clear_candidate_decision(store: &KnowledgeStore, topic: &str) -> Result<(), String> {
    let connection = open_library_connection(store)?;
    connection
        .execute(
            "DELETE FROM wiki_candidate_decisions WHERE topic=?1",
            params![normalize_topic(topic)],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn plain_excerpt(markdown: &str) -> String {
    let mut output = String::new();
    let mut frontmatter = false;
    let mut first_nonempty = true;
    for line in markdown.lines() {
        let trimmed = line.trim();
        if first_nonempty && trimmed.is_empty() {
            continue;
        }
        if first_nonempty {
            first_nonempty = false;
            if trimmed == "---" {
                frontmatter = true;
                continue;
            }
        }
        if frontmatter {
            if trimmed == "---" {
                frontmatter = false;
            }
            continue;
        }
        if trimmed.is_empty() || trimmed.starts_with('#') || trimmed.starts_with("<!--") {
            continue;
        }
        for character in trimmed.chars() {
            if matches!(character, '*' | '_' | '`' | '[' | ']' | '>' | '|') {
                continue;
            }
            output.push(character);
            if output.chars().count() >= 220 {
                return format!("{}…", output.trim());
            }
        }
        output.push(' ');
    }
    output.trim().to_string()
}

fn saved_candidate_items(store: &KnowledgeStore) -> Result<Vec<WikiLibraryItem>, String> {
    let connection = open_library_connection(store)?;
    let mut statement = connection
        .prepare(
            "SELECT topic, title, reason, preview, suggested_sections_json,
                    source_paths_json, source_titles_json, score, metadata_json, origin, updated_at
             FROM wiki_saved_candidates ORDER BY score DESC, updated_at DESC",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let topic = row.get::<_, String>(0)?;
            let title = row.get::<_, String>(1)?;
            let reason = row.get::<_, String>(2)?;
            let preview = row.get::<_, String>(3)?;
            let sections =
                serde_json::from_str::<Vec<String>>(&row.get::<_, String>(4)?).unwrap_or_default();
            let paths =
                serde_json::from_str::<Vec<String>>(&row.get::<_, String>(5)?).unwrap_or_default();
            let titles =
                serde_json::from_str::<Vec<String>>(&row.get::<_, String>(6)?).unwrap_or_default();
            let score = row.get::<_, i64>(7)?.max(0) as usize;
            let metadata =
                serde_json::from_str::<Value>(&row.get::<_, String>(8)?).unwrap_or(Value::Null);
            let core_source_count = metadata
                .get("coreSourceCount")
                .and_then(Value::as_u64)
                .unwrap_or(0) as usize;
            let confidence = metadata
                .get("confidence")
                .and_then(Value::as_f64)
                .unwrap_or(0.0) as f32;
            let distinctiveness = metadata
                .get("distinctiveness")
                .and_then(Value::as_f64)
                .unwrap_or(0.0) as f32;
            let origin = row.get::<_, String>(9)?;
            let updated_at = row.get::<_, i64>(10)?;
            Ok(WikiLibraryItem {
                id: candidate_id(&topic),
                kind: "suggestion".into(),
                status: origin,
                title,
                topic,
                excerpt: preview.clone(),
                reason,
                preview,
                suggested_sections: sections,
                source_titles: titles,
                path: None,
                source_paths: paths,
                score,
                core_source_count,
                confidence,
                distinctiveness,
                model_id: String::new(),
                markdown: String::new(),
                draft_id: None,
                citations_count: 0,
                updated_at,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn persist_saved_candidate(
    store: &KnowledgeStore,
    item: &WikiLibraryItem,
    origin: &str,
) -> Result<(), String> {
    let connection = open_library_connection(store)?;
    connection
        .execute(
            "INSERT INTO wiki_saved_candidates(topic, title, reason, preview, suggested_sections_json,
                                                source_paths_json, source_titles_json, score, metadata_json, origin, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, unixepoch())
             ON CONFLICT(topic) DO UPDATE SET
               title=excluded.title,
               reason=excluded.reason,
               preview=excluded.preview,
               suggested_sections_json=excluded.suggested_sections_json,
               source_paths_json=excluded.source_paths_json,
               source_titles_json=excluded.source_titles_json,
               score=excluded.score,
               origin=excluded.origin,
               updated_at=unixepoch()",
            params![
                normalize_topic(&item.topic),
                item.title,
                item.reason,
                item.preview,
                serde_json::to_string(&item.suggested_sections).map_err(|error| error.to_string())?,
                serde_json::to_string(&item.source_paths).map_err(|error| error.to_string())?,
                serde_json::to_string(&item.source_titles).map_err(|error| error.to_string())?,
                item.score as i64,
                serde_json::to_string(&serde_json::json!({
                    "coreSourceCount": item.core_source_count,
                    "confidence": item.confidence,
                    "distinctiveness": item.distinctiveness,
                }))
                .map_err(|error| error.to_string())?,
                origin,
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn disk_markdown(root: &Path, draft: &WikiDraft) -> (Option<String>, String) {
    if !matches!(
        draft.status,
        WikiDraftStatus::Accepted | WikiDraftStatus::Outdated
    ) {
        return (None, draft.markdown.clone());
    }
    let relative = format!(".elephantnote/wiki/{}.md", draft.slug);
    let target = root.join(&relative);
    let markdown = fs::read_to_string(target).unwrap_or_else(|_| draft.markdown.clone());
    (Some(relative), markdown)
}

fn markdown_link_component(value: &str) -> String {
    let mut output = String::new();
    for character in value.chars() {
        match character {
            ' ' => output.push_str("%20"),
            '(' => output.push_str("%28"),
            ')' => output.push_str("%29"),
            '#' => output.push_str("%23"),
            '%' => output.push_str("%25"),
            '?' => output.push_str("%3F"),
            _ => output.push(character),
        }
    }
    output
}

fn markdown_heading_anchor(value: &str) -> String {
    let mut output = String::new();
    let mut pending_dash = false;
    for character in value.trim().to_lowercase().chars() {
        if character.is_alphanumeric() {
            if pending_dash && !output.is_empty() {
                output.push('-');
            }
            output.push(character);
            pending_dash = false;
        } else if !output.is_empty() {
            pending_dash = true;
        }
    }
    output
}

fn markdown_note_target(citation: &WikiCitation) -> String {
    let path = markdown_link_component(&citation.document_path);
    let anchor = markdown_heading_anchor(&citation.heading);
    if anchor.is_empty() {
        format!("../../{path}")
    } else {
        format!("../../{path}#{anchor}")
    }
}

fn wiki_slug(value: &str) -> String {
    let mut slug = String::new();
    let mut pending_dash = false;
    for character in value.trim().chars() {
        if character.is_alphanumeric() {
            if pending_dash && !slug.is_empty() {
                slug.push('-');
            }
            slug.extend(character.to_lowercase());
            pending_dash = false;
        } else if !slug.is_empty() {
            pending_dash = true;
        }
    }
    let slug = slug.trim_matches('-');
    if slug.is_empty() {
        "wiki".into()
    } else {
        slug.chars().take(120).collect()
    }
}

fn citation_number(citation: &WikiCitation, fallback: usize) -> usize {
    citation
        .key
        .strip_prefix("source-")
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(fallback)
}

fn citation_display_label(citation: &WikiCitation) -> String {
    let heading = citation.heading.trim();
    let title = citation.document_title.trim();
    let value = if !heading.is_empty() && !heading.eq_ignore_ascii_case(title) {
        heading
    } else if !title.is_empty() {
        title
    } else {
        "Source"
    };
    value.chars().take(72).collect()
}

fn migrate_related_wikilinks(markdown: &str) -> String {
    let mut in_related_section = false;
    markdown
        .lines()
        .map(|line| {
            let trimmed = line.trim();
            if let Some(heading) = trimmed.strip_prefix("## ") {
                in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");
                return line.to_string();
            }
            if !in_related_section {
                return line.to_string();
            }
            let label = if trimmed.starts_with("- [[") && trimmed.ends_with("]]") {
                let raw = &trimmed[4..trimmed.len() - 2];
                let mut parts = raw.splitn(2, '|');
                let target = parts
                    .next()
                    .unwrap_or("")
                    .split('#')
                    .next()
                    .unwrap_or("")
                    .trim();
                parts.next().unwrap_or(target).trim().to_string()
            } else if let Some(rest) = trimmed.strip_prefix("- [") {
                rest.find("](")
                    .map(|end| rest[..end].trim().to_string())
                    .unwrap_or_default()
            } else {
                String::new()
            };
            if label.is_empty() {
                return line.to_string();
            }
            let indentation = &line[..line.len() - line.trim_start().len()];
            format!("{indentation}- {label}")
        })
        .collect::<Vec<_>>()
        .join(
            "
",
        )
}

fn migrate_legacy_generated_markdown(draft: &WikiDraft, markdown: &str) -> Option<String> {
    let has_legacy_citation = draft
        .citations
        .iter()
        .any(|citation| markdown.contains(&format!("[^{}]", citation.key)));
    let mut in_related_section = false;
    let has_legacy_related = markdown.lines().any(|line| {
        let trimmed = line.trim();
        if let Some(heading) = trimmed.strip_prefix("## ") {
            in_related_section = heading.trim().eq_ignore_ascii_case("related wikis");
            return false;
        }
        in_related_section
            && ((trimmed.starts_with("- [[") && trimmed.ends_with("]]"))
                || (trimmed.starts_with("- [") && trimmed.contains("](./")))
    });
    let has_numeric_citation = draft.citations.iter().enumerate().any(|(index, citation)| {
        let number = citation_number(citation, index + 1);
        markdown.contains(&format!("[{number}]({})", markdown_note_target(citation)))
    });
    if !has_legacy_citation && !has_legacy_related && !has_numeric_citation {
        return None;
    }

    let source_heading = "\n## Sources\n";
    let mut body = markdown
        .find(source_heading)
        .map(|index| markdown[..index].trim_end().to_string())
        .unwrap_or_else(|| markdown.trim_end().to_string());
    body = migrate_related_wikilinks(&body);

    let mut citations = draft.citations.iter().enumerate().collect::<Vec<_>>();
    citations.sort_by_key(|(index, citation)| citation_number(citation, index + 1));
    for (index, citation) in &citations {
        let number = citation_number(citation, index + 1);
        let target = markdown_note_target(citation);
        let label = citation_display_label(citation);
        body = body.replace(
            &format!("[^{}]", citation.key),
            &format!("[{label}]({target})"),
        );
        body = body.replace(
            &format!("[{number}]({target})"),
            &format!("[{label}]({target})"),
        );
    }

    body.push_str("\n\n## Sources\n\n");
    for (index, citation) in citations {
        body.push_str(&format!(
            "- [{} — {}]({})\n",
            citation.document_title,
            citation.heading,
            markdown_note_target(citation)
        ));
    }
    Some(body)
}

fn atomic_write_migrated_wiki(target: &Path, markdown: &str) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "Generated Wiki path has no parent directory.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    let temporary = target.with_extension(format!("md.{}.migration.tmp", std::process::id()));
    fs::write(&temporary, markdown).map_err(|error| error.to_string())?;
    if let Err(error) = fs::rename(&temporary, target) {
        let _ = fs::remove_file(&temporary);
        return Err(error.to_string());
    }
    Ok(())
}

fn migrate_wiki_draft(
    root: &Path,
    store: &KnowledgeStore,
    mut draft: WikiDraft,
) -> Result<WikiDraft, String> {
    let (relative_path, current_markdown) = disk_markdown(root, &draft);
    let Some(migrated) = migrate_legacy_generated_markdown(&draft, &current_markdown) else {
        return Ok(draft);
    };

    if let Some(relative_path) = &relative_path {
        atomic_write_migrated_wiki(&root.join(relative_path), &migrated)?;
    }
    draft.markdown = migrated;
    store.save_wiki_draft(&draft)?;
    eprintln!(
        "[knowledge] wiki-library:migrated-links draft={} path={}",
        draft.id,
        relative_path.as_deref().unwrap_or("database-only")
    );
    Ok(draft)
}

fn draft_item(root: &Path, draft: WikiDraft) -> WikiLibraryItem {
    let (path, markdown) = disk_markdown(root, &draft);
    let status = match draft.status {
        WikiDraftStatus::Accepted => "ready",
        WikiDraftStatus::Outdated => "outdated",
        WikiDraftStatus::Proposed => "draft",
        WikiDraftStatus::Rejected => "rejected",
    };
    let excerpt = plain_excerpt(&markdown);
    let source_titles = draft
        .source_paths
        .iter()
        .map(|path| {
            Path::new(path)
                .file_stem()
                .and_then(|name| name.to_str())
                .unwrap_or(path)
                .to_string()
        })
        .collect::<Vec<_>>();
    WikiLibraryItem {
        id: format!("wiki:{}", draft.id),
        kind: "wiki".into(),
        status: status.into(),
        title: draft.title,
        topic: draft.topic,
        excerpt: excerpt.clone(),
        reason: String::new(),
        preview: excerpt,
        suggested_sections: Vec::new(),
        source_titles,
        path,
        source_paths: draft.source_paths,
        score: 0,
        core_source_count: 0,
        confidence: 0.0,
        distinctiveness: 0.0,
        model_id: draft.model_id,
        markdown,
        draft_id: Some(draft.id),
        citations_count: draft.citations.len(),
        updated_at: draft.updated_at,
    }
}

fn sanitize_generation_payload(mut payload: Value) -> Value {
    if let Some(object) = payload.as_object_mut() {
        object.remove("modelSelection");
        if let Some(ai_config) = object.get_mut("aiConfig").and_then(Value::as_object_mut) {
            ai_config.remove("localModelSelection");
        }
        if let Some(config) = object.get_mut("config").and_then(Value::as_object_mut) {
            config.remove("localModelSelection");
        }
    }
    payload
}

#[tauri::command]
pub fn tauri_knowledge_wiki_library_list(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<WikiLibraryItem>, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let limit = limit.unwrap_or(500).clamp(1, 1_000);
    let rejected = rejected_topics(&store)?;

    let mut suggestions = saved_candidate_items(&store)?
        .into_iter()
        .filter(|candidate| !rejected.contains(&normalize_topic(&candidate.topic)))
        .collect::<Vec<_>>();
    suggestions.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then(left.title.cmp(&right.title))
    });

    let mut wikis = store
        .list_wiki_drafts(None, limit)?
        .into_iter()
        .filter(|draft| !matches!(draft.status, WikiDraftStatus::Rejected))
        .map(|draft| migrate_wiki_draft(&root, &store, draft))
        .collect::<Result<Vec<_>, _>>()?
        .into_iter()
        .map(|draft| draft_item(&root, draft))
        .collect::<Vec<_>>();
    wikis.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));

    suggestions.extend(wikis);
    suggestions.truncate(limit);
    Ok(suggestions)
}

#[tauri::command]
pub fn tauri_knowledge_wiki_library_add_candidate(
    app: AppHandle,
    topic: String,
    title: Option<String>,
    source_paths: Option<Vec<String>>,
) -> Result<WikiLibraryItem, String> {
    let topic = topic.trim().to_string();
    if topic.is_empty() {
        return Err("Wiki suggestion topic cannot be empty.".into());
    }
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    clear_candidate_decision(&store, &topic)?;
    let mut paths = source_paths.unwrap_or_default();
    if paths.is_empty() {
        paths = hybrid_note_search(&store, &topic, 400)?
            .into_iter()
            .map(|hit| hit.relative_path)
            .collect::<Vec<_>>();
    }
    let mut seen_paths = HashSet::new();
    paths.retain(|path| seen_paths.insert(path.clone()));
    paths.truncate(400);
    let source_titles = paths
        .iter()
        .map(|path| {
            Path::new(path)
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or(path)
                .to_string()
        })
        .collect::<Vec<_>>();
    let title = title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| {
            let mut characters = topic.chars();
            characters
                .next()
                .map(|first| first.to_uppercase().collect::<String>() + characters.as_str())
                .unwrap_or_else(|| "Wiki".into())
        });
    let preview = if paths.is_empty() {
        format!("Sujet ajouté manuellement. ElephantNote recherchera les sources pertinentes lors de la génération de « {title} ».")
    } else {
        format!(
            "Sujet ajouté manuellement avec {} note(s) déjà retrouvée(s).",
            paths.len()
        )
    };
    let item = WikiLibraryItem {
        id: candidate_id(&topic),
        kind: "suggestion".into(),
        status: "manual".into(),
        title,
        topic,
        excerpt: preview.clone(),
        reason: "Proposition ajoutée explicitement par l’utilisateur.".into(),
        preview,
        suggested_sections: vec!["Vue d’ensemble".into(), "Concepts et références".into()],
        source_titles,
        path: None,
        source_paths: paths,
        score: 100_000,
        core_source_count: 0,
        confidence: 0.0,
        distinctiveness: 0.0,
        model_id: String::new(),
        markdown: String::new(),
        draft_id: None,
        citations_count: 0,
        updated_at: unix_timestamp(),
    };
    persist_saved_candidate(&store, &item, "manual")?;
    eprintln!(
        "[knowledge] wiki-library:manual-candidate topic={} sources={}",
        item.topic,
        item.source_paths.len()
    );
    Ok(item)
}

fn rewrite_generated_wiki_identity(markdown: &str, topic: &str, title: &str) -> String {
    let encoded_topic = serde_json::to_string(topic).unwrap_or_else(|_| "\"wiki\"".into());
    let mut replaced_title = false;
    markdown
        .lines()
        .map(|line| {
            if line.starts_with("topic: ") {
                return format!("topic: {encoded_topic}");
            }
            if !replaced_title && line.starts_with("# ") {
                replaced_title = true;
                return format!("# {}", title.trim());
            }
            line.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn matching_existing_wiki(
    store: &KnowledgeStore,
    title: &str,
    topic: &str,
) -> Result<Option<WikiDraft>, String> {
    let title_key = wiki_slug(title);
    let topic_key = normalize_topic(topic);
    Ok(store
        .list_wiki_drafts(None, 1_000)?
        .into_iter()
        .filter(|draft| {
            matches!(
                draft.status,
                WikiDraftStatus::Accepted | WikiDraftStatus::Outdated
            )
        })
        .find(|draft| {
            let draft_title = wiki_slug(&draft.title);
            let related_title = draft_title.chars().count().min(title_key.chars().count()) >= 5
                && (draft_title.contains(&title_key) || title_key.contains(&draft_title));
            draft_title == title_key
                || related_title
                || (!topic_key.is_empty() && normalize_topic(&draft.topic) == topic_key)
        }))
}

pub async fn tauri_knowledge_wiki_library_add_or_update(
    app: AppHandle,
    title: String,
    instruction: String,
    source_paths: Vec<String>,
    payload: Value,
) -> Result<WikiLibraryItem, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let Some(existing) = matching_existing_wiki(&store, &title, &instruction)? else {
        return tauri_knowledge_wiki_library_add_candidate(
            app,
            instruction,
            Some(title),
            Some(source_paths),
        );
    };

    let mut combined_paths = existing.source_paths.clone();
    combined_paths.extend(source_paths);
    if combined_paths.is_empty() {
        combined_paths.extend(
            store
                .search(&instruction, 24)?
                .into_iter()
                .map(|hit| hit.relative_path),
        );
    }
    combined_paths.sort();
    combined_paths.dedup();
    combined_paths.truncate(24);

    let current_context = existing.markdown.chars().take(6_000).collect::<String>();
    let generation_topic = format!(
        "Mets à jour le Wiki existant « {} ». Demande utilisateur : {}. Préserve les informations utiles, améliore la structure et intègre la demande sans créer un nouveau Wiki. Contenu actuel :\n{}",
        existing.title,
        instruction.trim(),
        current_context
    );
    eprintln!(
        "[knowledge] wiki-library:update existing={} title={} sources={}",
        existing.id,
        existing.title,
        combined_paths.len()
    );
    let generated = tauri_knowledge_wiki_generate(
        app.clone(),
        generation_topic,
        Some(existing.title.clone()),
        Some(combined_paths),
        sanitize_generation_payload(payload),
        Some(80),
        Some(220),
        Some(22),
    )
    .await?;

    let temporary_id = generated.draft.id.clone();
    let mut revised = generated.draft;
    if temporary_id != existing.id {
        let _ = store.set_wiki_draft_status(&temporary_id, WikiDraftStatus::Rejected);
    }
    revised.id = existing.id.clone();
    revised.topic = existing.topic.clone();
    revised.title = existing.title.clone();
    revised.slug = existing.slug.clone();
    revised.created_at = existing.created_at;
    revised.updated_at = unix_timestamp();
    revised.status = WikiDraftStatus::Proposed;
    revised.markdown =
        rewrite_generated_wiki_identity(&revised.markdown, &existing.topic, &existing.title);
    store.save_wiki_draft(&revised)?;
    let accepted = tauri_knowledge_wiki_accept(app, revised.id)?;
    eprintln!(
        "[knowledge] wiki-library:updated draft={} path=.elephantnote/wiki/{}.md",
        accepted.id, accepted.slug
    );
    Ok(draft_item(&root, accepted))
}

#[tauri::command]
pub async fn tauri_knowledge_wiki_library_generate(
    app: AppHandle,
    topic: String,
    title: Option<String>,
    source_paths: Vec<String>,
    payload: Value,
) -> Result<WikiLibraryItem, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    clear_candidate_decision(&store, &topic)?;

    eprintln!(
        "[knowledge] wiki-library:generate topic={} sources={}",
        topic,
        source_paths.len()
    );
    let generated = tauri_knowledge_wiki_generate(
        app.clone(),
        topic,
        title,
        Some(source_paths),
        sanitize_generation_payload(payload),
        Some(80),
        Some(220),
        Some(22),
    )
    .await?;
    let accepted = tauri_knowledge_wiki_accept(app, generated.draft.id)?;
    eprintln!(
        "[knowledge] wiki-library:ready draft={} path=.elephantnote/wiki/{}.md",
        accepted.id, accepted.slug
    );
    Ok(draft_item(&root, accepted))
}

#[tauri::command]
pub fn tauri_knowledge_wiki_library_reject(app: AppHandle, topic: String) -> Result<(), String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    set_candidate_decision(&store, &topic, "rejected")?;
    eprintln!("[knowledge] wiki-library:rejected topic={}", topic);
    Ok(())
}

#[tauri::command]
pub fn tauri_knowledge_wiki_library_delete(
    app: AppHandle,
    draft_id: String,
    suppress_future: Option<bool>,
) -> Result<(), String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let draft = store
        .wiki_draft(&draft_id)?
        .ok_or_else(|| format!("Unknown wiki draft: {draft_id}"))?;

    let target = root
        .join(".elephantnote")
        .join("wiki")
        .join(format!("{}.md", draft.slug));
    if target.exists() {
        fs::remove_file(&target).map_err(|error| error.to_string())?;
    }

    let connection = open_library_connection(&store)?;
    connection
        .execute("DELETE FROM wiki_drafts WHERE id=?1", params![draft_id])
        .map_err(|error| error.to_string())?;
    drop(connection);
    if suppress_future.unwrap_or(true) {
        set_candidate_decision(&store, &draft.topic, "rejected")?;
    }
    eprintln!(
        "[knowledge] wiki-library:deleted topic={} file={}",
        draft.topic,
        target.display()
    );
    Ok(())
}

fn unix_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_vault(name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!(
            "elephantnote-wiki-library-{name}-{}-{nonce}",
            std::process::id()
        ))
    }

    #[test]
    fn legacy_generated_markdown_is_upgraded_to_navigable_links() {
        let draft = WikiDraft {
            id: "wiki-legacy".into(),
            topic: "Iroh".into(),
            title: "Iroh".into(),
            slug: "iroh".into(),
            markdown: String::new(),
            citations: vec![WikiCitation {
                key: "source-1".into(),
                document_path: "Notes/Iroh guide.md".into(),
                document_title: "Iroh guide".into(),
                chunk_id: "chunk-1".into(),
                heading: "Direct connections".into(),
                start_offset: 0,
                end_offset: 20,
            }],
            source_paths: vec!["Notes/Iroh guide.md".into()],
            source_hash: "hash".into(),
            model_id: "model".into(),
            status: WikiDraftStatus::Accepted,
            created_at: 1,
            updated_at: 1,
        };
        let legacy = "# Iroh\n\nIroh connects peers. [^source-1]\n\n## Related wikis\n\n- [[Peer networking]]\n\n## Sources\n\n[^source-1]: [[Notes/Iroh guide.md#Direct connections|Iroh guide — Direct connections]] (bytes 0–20)";
        let migrated = migrate_legacy_generated_markdown(&draft, legacy).expect("migration");
        assert!(migrated
            .contains("[Direct connections](../../Notes/Iroh%20guide.md#direct-connections)"));
        assert!(migrated.contains("- Peer networking"));
        assert!(!migrated.contains("./peer-networking.md"));
        assert!(migrated.contains(
            "- [Iroh guide — Direct connections](../../Notes/Iroh%20guide.md#direct-connections)"
        ));
        assert!(!migrated.contains("[^source-1]"));
    }

    #[test]
    fn candidate_ids_are_stable_and_normalized() {
        assert_eq!(candidate_id("  Minecraft "), "wiki-suggestion:minecraft");
    }

    #[test]
    fn candidate_rejection_is_persisted_and_can_be_cleared() {
        let root = temporary_vault("decisions");
        fs::create_dir_all(&root).expect("create temporary vault");
        let store = KnowledgeStore::open(&root).expect("open knowledge store");

        set_candidate_decision(&store, " Minecraft ", "rejected").expect("reject candidate");
        assert!(rejected_topics(&store)
            .expect("read rejected topics")
            .contains("minecraft"));

        clear_candidate_decision(&store, "MINECRAFT").expect("clear decision");
        assert!(!rejected_topics(&store)
            .expect("read cleared topics")
            .contains("minecraft"));

        drop(store);
        fs::remove_dir_all(root).expect("remove temporary vault");
    }

    #[test]
    fn generation_payload_drops_stale_local_model_selection() {
        let cleaned = sanitize_generation_payload(json!({
            "modelSelection": { "wiki": "old.gguf" },
            "aiConfig": {
                "localModelSelection": { "wiki": "old.gguf" },
                "routes": { "chat": { "source": "codex", "model": "gpt-5.4-mini" } }
            }
        }));
        assert!(cleaned.get("modelSelection").is_none());
        assert!(cleaned.pointer("/aiConfig/localModelSelection").is_none());
        assert_eq!(
            cleaned
                .pointer("/aiConfig/routes/chat/source")
                .and_then(Value::as_str),
            Some("codex")
        );
    }

    #[test]
    fn excerpt_removes_markdown_noise() {
        assert_eq!(plain_excerpt("# Title\n\n**Useful** [text]"), "Useful text");
    }
}

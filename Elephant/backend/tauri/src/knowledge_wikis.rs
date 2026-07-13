use crate::knowledge_chat_actions::hybrid_note_search;
use elephantnote_knowledge_core::{
    build_wiki_synthesis_request, collect_wiki_sources, parse_and_render_wiki,
    wiki_draft_from_rendered, DocumentSnapshot, KnowledgeStore, StructuredModelRequest, WikiDraft,
    WikiDraftStatus, WikiSourceChunk,
};
use rusqlite::Connection;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::AppHandle;

const DEFAULT_MAX_DOCUMENTS: usize = 64;
const DEFAULT_MAX_CHUNKS: usize = 192;
const DEFAULT_MAX_SECTIONS: usize = 20;

static ACTIVE_WIKI_GENERATIONS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

struct WikiGenerationGuard {
    key: String,
}

impl Drop for WikiGenerationGuard {
    fn drop(&mut self) {
        if let Ok(mut active) = ACTIVE_WIKI_GENERATIONS
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
        {
            active.remove(&self.key);
        }
    }
}

fn acquire_wiki_generation(topic: &str) -> Result<WikiGenerationGuard, String> {
    let key = topic.trim().to_lowercase();
    let mut active = ACTIVE_WIKI_GENERATIONS
        .get_or_init(|| Mutex::new(HashSet::new()))
        .lock()
        .map_err(|_| "Wiki generation lock is poisoned.".to_string())?;
    if !active.insert(key.clone()) {
        return Err(format!(
            "A wiki generation is already running for topic `{}`.",
            topic.trim()
        ));
    }
    Ok(WikiGenerationGuard { key })
}

fn active_vault_root(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(PathBuf::from(
        crate::vault::config::get_active_vault(app)?.path,
    ))
}

fn active_store(root: &Path) -> Result<KnowledgeStore, String> {
    KnowledgeStore::open(root)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiGenerationResult {
    pub draft: WikiDraft,
    pub provider: String,
    pub model: String,
    pub source_count: usize,
    pub chunk_count: usize,
    pub raw_response: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct WikiModelRoute {
    provider: String,
    model: String,
    reasoning_effort: Option<String>,
}

#[tauri::command]
pub async fn tauri_knowledge_wiki_generate(
    app: AppHandle,
    topic: String,
    title: Option<String>,
    source_paths: Option<Vec<String>>,
    payload: Value,
    max_documents: Option<usize>,
    max_chunks: Option<usize>,
    max_sections: Option<usize>,
) -> Result<WikiGenerationResult, String> {
    if topic.trim().is_empty() {
        return Err("Wiki topic cannot be empty.".into());
    }
    let _generation_guard = acquire_wiki_generation(&topic)?;
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let documents = select_documents(
        &store,
        &topic,
        source_paths.unwrap_or_default(),
        max_documents.unwrap_or(DEFAULT_MAX_DOCUMENTS).clamp(1, 240),
    )?;
    let sources = select_source_chunks(
        collect_wiki_sources(&documents),
        max_chunks.unwrap_or(DEFAULT_MAX_CHUNKS).clamp(1, 800),
    );
    if sources.is_empty() {
        return Err("No indexed source chunks are available for this wiki.".into());
    }
    let max_sections = max_sections.unwrap_or(DEFAULT_MAX_SECTIONS).clamp(1, 36);
    let request = build_wiki_synthesis_request(&topic, title.as_deref(), &sources, max_sections);
    let payload = with_saved_ai_config(&app, payload);
    let route = selected_wiki_route(&payload)?;

    eprintln!(
        "[knowledge] wiki:start topic={} provider={} model={} documents={} chunks={}",
        topic,
        route.provider,
        route.model,
        documents.len(),
        sources.len()
    );

    let raw_response = generate_structured_response(&app, &route, &request, &payload).await?;
    let response_json = extract_json_payload(&raw_response)?;
    let rendered = parse_and_render_wiki(&response_json, &topic, &sources, max_sections)?;
    let draft = wiki_draft_from_rendered(&topic, rendered, &route.model, unix_timestamp());
    store.save_wiki_draft(&draft)?;

    eprintln!(
        "[knowledge] wiki:complete topic={} draft={} citations={}",
        topic,
        draft.id,
        draft.citations.len()
    );

    Ok(WikiGenerationResult {
        draft,
        provider: route.provider,
        model: route.model,
        source_count: documents.len(),
        chunk_count: sources.len(),
        raw_response,
    })
}

#[tauri::command]
pub fn tauri_knowledge_wiki_get(
    app: AppHandle,
    draft_id: String,
) -> Result<Option<WikiDraft>, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.wiki_draft(&draft_id)
}

#[tauri::command]
pub fn tauri_knowledge_wikis_list(
    app: AppHandle,
    status: Option<WikiDraftStatus>,
    limit: Option<usize>,
) -> Result<Vec<WikiDraft>, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.list_wiki_drafts(status, limit.unwrap_or(100))
}

#[tauri::command]
pub fn tauri_knowledge_wiki_accept(app: AppHandle, draft_id: String) -> Result<WikiDraft, String> {
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let (draft, path) = store.accept_wiki_draft(&root, &draft_id)?;
    eprintln!(
        "[knowledge] wiki:accepted draft={} path={}",
        draft_id,
        path.display()
    );
    Ok(draft)
}

#[tauri::command]
pub fn tauri_knowledge_wiki_reject(app: AppHandle, draft_id: String) -> Result<WikiDraft, String> {
    let root = active_vault_root(&app)?;
    active_store(&root)?.set_wiki_draft_status(&draft_id, WikiDraftStatus::Rejected)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiCandidate {
    pub topic: String,
    pub title: String,
    pub source_paths: Vec<String>,
    pub reason: String,
    pub preview: String,
    pub suggested_sections: Vec<String>,
    pub source_titles: Vec<String>,
    pub score: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WikiAutoProposalResult {
    pub candidates_considered: usize,
    pub generated: Vec<WikiDraft>,
    pub skipped: Vec<String>,
    pub errors: Vec<String>,
    pub already_ran: bool,
}

#[derive(Default)]
struct CandidateAccumulator {
    paths: HashSet<String>,
    hashtag_hits: usize,
    folder_hits: usize,
    title_hits: usize,
}

static AUTO_PROPOSED_VAULTS: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();

fn normalized_candidate_word(raw: &str) -> Option<String> {
    let value = raw
        .trim_start_matches('#')
        .trim_matches(|character: char| {
            !character.is_alphanumeric() && character != '-' && character != '_'
        })
        .to_lowercase();
    let length = value.chars().count();
    if !(4..=48).contains(&length) || value.chars().all(|character| character.is_numeric()) {
        return None;
    }
    const STOP_WORDS: &[&str] = &[
        "avec",
        "dans",
        "pour",
        "sans",
        "sous",
        "entre",
        "cette",
        "comme",
        "plus",
        "note",
        "notes",
        "untitled",
        "daily",
        "inbox",
        "test_keep",
        "pourtoi",
        "viral",
        "shorts",
        "video",
        "fyp",
        "fypsh",
        "reels",
        "edit",
        "funny",
        "humour",
        "drole",
        "million",
        "today",
        "from",
        "that",
        "this",
        "with",
        "your",
        "have",
        "about",
        "into",
        "when",
        "what",
        "just",
        "new",
        "folder",
        "getting",
        "started",
        "elle",
        "elles",
        "il",
        "ils",
        "lui",
        "eux",
        "votre",
        "vos",
        "notre",
        "nos",
        "leur",
        "leurs",
        "celui",
        "celle",
        "ceux",
        "celles",
        "quel",
        "quelle",
        "quels",
        "quelles",
        "tout",
        "tous",
        "toute",
        "toutes",
        "cours",
        "article",
        "page",
        "document",
        "contenu",
        "misc",
        "other",
        "general",
        "untitled",
        "mine",
        "yours",
        "ours",
        "theirs",
        "some",
        "each",
        "every",
    ];
    (!STOP_WORDS.contains(&value.as_str())).then_some(value)
}

fn title_for_topic(topic: &str) -> String {
    let mut characters = topic.chars();
    match characters.next() {
        Some(first) => first.to_uppercase().collect::<String>() + characters.as_str(),
        None => String::new(),
    }
}

fn add_candidate_signal(
    groups: &mut HashMap<String, CandidateAccumulator>,
    topic: String,
    path: &str,
    signal: &str,
) {
    let entry = groups.entry(topic).or_default();
    entry.paths.insert(path.to_string());
    match signal {
        "hashtag" => entry.hashtag_hits += 1,
        "folder" => entry.folder_hits += 1,
        "title_phrase" => entry.title_hits += 2,
        _ => entry.title_hits += 1,
    }
}

fn discover_wiki_candidates(
    store: &KnowledgeStore,
    max_candidates: usize,
) -> Result<Vec<WikiCandidate>, String> {
    let connection = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT d.relative_path, d.title,
                    COALESCE((SELECT c.text FROM chunks c WHERE c.document_path=d.relative_path ORDER BY c.ordinal LIMIT 1), '')
             FROM documents d ORDER BY d.relative_path",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?;

    let existing_topics = store
        .list_wiki_drafts(None, 1_000)?
        .into_iter()
        .map(|draft| draft.topic.trim().to_lowercase())
        .collect::<HashSet<_>>();
    let mut groups = HashMap::<String, CandidateAccumulator>::new();
    let mut document_titles = HashMap::<String, String>::new();

    for row in rows {
        let (path, title, first_chunk) = row.map_err(|error| error.to_string())?;
        document_titles.insert(path.clone(), title.clone());
        let mut seen_in_document = HashSet::new();
        let mut title_topics = Vec::new();
        for token in title.split_whitespace() {
            let signal = if token.starts_with('#') {
                "hashtag"
            } else {
                "title"
            };
            if let Some(topic) = normalized_candidate_word(token) {
                if seen_in_document.insert(topic.clone()) {
                    add_candidate_signal(&mut groups, topic.clone(), &path, signal);
                }
                if signal == "title" {
                    title_topics.push(topic);
                }
            }
        }
        for pair in title_topics.windows(2) {
            if pair[0] == pair[1] {
                continue;
            }
            let phrase = format!("{} {}", pair[0], pair[1]);
            if seen_in_document.insert(phrase.clone()) {
                add_candidate_signal(&mut groups, phrase, &path, "title_phrase");
            }
        }
        for token in first_chunk
            .split_whitespace()
            .filter(|token| token.starts_with('#'))
        {
            if let Some(topic) = normalized_candidate_word(token) {
                if seen_in_document.insert(topic.clone()) {
                    add_candidate_signal(&mut groups, topic, &path, "hashtag");
                }
            }
        }
        if let Some((parent, _)) = path.rsplit_once('/') {
            let folder = parent.rsplit('/').next().unwrap_or(parent);
            if let Some(topic) = normalized_candidate_word(folder) {
                add_candidate_signal(&mut groups, topic, &path, "folder");
            }
        }
    }

    let mut candidates = groups
        .into_iter()
        .filter_map(|(topic, group)| {
            if existing_topics.contains(&topic) || group.paths.len() < 3 {
                return None;
            }
            let score = group.hashtag_hits * 4 + group.folder_hits * 2 + group.title_hits;
            let phrase_topic = topic.contains(' ');
            if score < 6
                || (!phrase_topic
                    && group.hashtag_hits == 0
                    && group.folder_hits == 0
                    && group.title_hits < 5)
            {
                return None;
            }
            let source_count = group.paths.len();
            let mut source_paths = group.paths.into_iter().collect::<Vec<_>>();
            source_paths.sort();
            source_paths.truncate(400);
            let source_titles = source_paths
                .iter()
                .filter_map(|path| document_titles.get(path))
                .cloned()
                .collect::<Vec<_>>();
            let topic_terms = topic.split_whitespace().collect::<HashSet<_>>();
            let mut section_counts = HashMap::<String, usize>::new();
            for title in &source_titles {
                let mut seen = HashSet::new();
                for token in title
                    .split_whitespace()
                    .filter_map(normalized_candidate_word)
                {
                    if topic_terms.contains(token.as_str()) || !seen.insert(token.clone()) {
                        continue;
                    }
                    *section_counts.entry(token).or_default() += 1;
                }
            }
            let mut section_scores = section_counts.into_iter().collect::<Vec<_>>();
            section_scores.sort_by(|left, right| right.1.cmp(&left.1).then(left.0.cmp(&right.0)));
            let mut suggested_sections = section_scores
                .into_iter()
                .filter(|(_, count)| *count >= 2)
                .take(4)
                .map(|(value, _)| title_for_topic(&value))
                .collect::<Vec<_>>();
            if suggested_sections.is_empty() {
                suggested_sections = vec!["Vue d’ensemble".into(), "Références principales".into()];
            }
            let reason = if group.hashtag_hits >= group.folder_hits
                && group.hashtag_hits >= group.title_hits
            {
                format!("{} notes partagent le thème #{}", source_count, topic)
            } else if group.folder_hits >= group.title_hits {
                format!(
                    "{} notes forment un groupe de dossier cohérent",
                    source_count
                )
            } else if phrase_topic {
                format!(
                    "{} notes partagent le concept spécifique « {} »",
                    source_count, topic
                )
            } else {
                format!("{} notes répètent ce concept dans leur titre", source_count)
            };
            let preview = format!(
                "Synthèse de {} notes autour de {}. Axes probables : {}.",
                source_count,
                title_for_topic(&topic),
                suggested_sections.join(", ")
            );
            Some(WikiCandidate {
                title: title_for_topic(&topic),
                topic,
                source_paths,
                reason,
                preview,
                suggested_sections,
                source_titles,
                score,
            })
        })
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then(right.source_paths.len().cmp(&left.source_paths.len()))
            .then(left.topic.cmp(&right.topic))
    });
    candidates.truncate(max_candidates.clamp(1, 50));
    Ok(candidates)
}

#[tauri::command]
pub fn tauri_knowledge_wiki_candidates(
    app: AppHandle,
    limit: Option<usize>,
) -> Result<Vec<WikiCandidate>, String> {
    let root = active_vault_root(&app)?;
    discover_wiki_candidates(&active_store(&root)?, limit.unwrap_or(12))
}

#[tauri::command]
pub async fn tauri_knowledge_wikis_auto_propose(
    app: AppHandle,
    payload: Value,
    max_proposals: Option<usize>,
    force: Option<bool>,
) -> Result<WikiAutoProposalResult, String> {
    selected_wiki_route(&payload)?;
    let root = active_vault_root(&app)?;
    let vault_key = root.to_string_lossy().to_string();
    if !force.unwrap_or(false) {
        let mut completed = AUTO_PROPOSED_VAULTS
            .get_or_init(|| Mutex::new(HashSet::new()))
            .lock()
            .map_err(|_| "Automatic wiki proposal lock is poisoned.".to_string())?;
        if !completed.insert(vault_key) {
            return Ok(WikiAutoProposalResult {
                candidates_considered: 0,
                generated: Vec::new(),
                skipped: Vec::new(),
                errors: Vec::new(),
                already_ran: true,
            });
        }
    }

    let candidates = discover_wiki_candidates(&active_store(&root)?, 24)?;
    let limit = max_proposals.unwrap_or(2).clamp(1, 4);
    let considered = candidates.len();
    let mut generated = Vec::new();
    let mut errors = Vec::new();

    for candidate in candidates.into_iter().take(limit) {
        eprintln!(
            "[knowledge] wiki:auto-propose topic={} sources={} score={}",
            candidate.topic,
            candidate.source_paths.len(),
            candidate.score
        );
        match tauri_knowledge_wiki_generate(
            app.clone(),
            candidate.topic.clone(),
            Some(candidate.title),
            Some(candidate.source_paths),
            payload.clone(),
            Some(DEFAULT_MAX_DOCUMENTS),
            Some(DEFAULT_MAX_CHUNKS),
            Some(DEFAULT_MAX_SECTIONS),
        )
        .await
        {
            Ok(result) => generated.push(result.draft),
            Err(error) => {
                errors.push(format!("{}: {}", candidate.topic, error));
                break;
            }
        }
    }

    let skipped = if considered > limit {
        vec![format!(
            "{} candidats différés par la limite de session",
            considered - limit
        )]
    } else {
        Vec::new()
    };
    Ok(WikiAutoProposalResult {
        candidates_considered: considered,
        generated,
        skipped,
        errors,
        already_ran: false,
    })
}

fn select_documents(
    store: &KnowledgeStore,
    topic: &str,
    source_paths: Vec<String>,
    max_documents: usize,
) -> Result<Vec<DocumentSnapshot>, String> {
    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    for path in source_paths {
        let normalized = path.replace('\\', "/");
        if seen.insert(normalized.clone()) {
            paths.push(normalized);
        }
    }

    if paths.is_empty() {
        for hit in hybrid_note_search(store, topic, max_documents.saturating_mul(6).clamp(24, 500))?
        {
            if seen.insert(hit.relative_path.clone()) {
                paths.push(hit.relative_path);
                if paths.len() >= max_documents {
                    break;
                }
            }
        }
    }

    let mut documents = Vec::new();
    for path in paths.into_iter().take(max_documents) {
        let document = store
            .inspect_document(&path)?
            .ok_or_else(|| format!("Wiki source is not indexed: {path}"))?;
        documents.push(document);
    }
    if documents.is_empty() {
        return Err(format!(
            "No indexed notes matched the wiki topic `{}`.",
            topic.trim()
        ));
    }
    Ok(documents)
}

fn compact_wiki_source_text(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut output = value.chars().take(max_chars).collect::<String>();
    output.push('…');
    output
}

fn select_source_chunks(
    mut sources: Vec<WikiSourceChunk>,
    max_chunks: usize,
) -> Vec<WikiSourceChunk> {
    for source in &mut sources {
        source.text = compact_wiki_source_text(&source.text, 1_400);
    }
    sources.sort_by(|left, right| {
        left.document_path
            .cmp(&right.document_path)
            .then(left.start_offset.cmp(&right.start_offset))
    });
    if sources.len() <= max_chunks {
        return sources;
    }

    let mut selected = Vec::new();
    let mut used = HashSet::new();
    for source in &sources {
        if used.insert(source.document_path.clone()) {
            selected.push(source.clone());
            if selected.len() >= max_chunks {
                return selected;
            }
        }
    }
    for source in sources {
        if selected
            .iter()
            .any(|current| current.chunk_id == source.chunk_id)
        {
            continue;
        }
        selected.push(source);
        if selected.len() >= max_chunks {
            break;
        }
    }
    selected
}

fn with_saved_ai_config(app: &AppHandle, payload: Value) -> Value {
    let mut payload = if payload.is_object() {
        payload
    } else {
        json!({})
    };
    let has_route = payload.pointer("/aiConfig/routes/chat").is_some()
        || payload.pointer("/config/routes/chat").is_some();
    if !has_route {
        if let Ok(config) = crate::tauri_extra_commands::load_ai_config(app) {
            if let Some(object) = payload.as_object_mut() {
                object.insert("aiConfig".into(), config);
            }
        }
    }
    payload
}

fn selected_wiki_route(payload: &Value) -> Result<WikiModelRoute, String> {
    const ROUTE_POINTERS: &[&str] = &[
        "/aiConfig/routes/wiki",
        "/aiConfig/routes/wikiWriting",
        "/config/routes/wiki",
        "/config/routes/wikiWriting",
        "/aiConfig/routes/chat",
        "/config/routes/chat",
        "/modelSelection/wiki",
        "/modelSelection/wikiWriting",
        "/aiConfig/localModelSelection/wiki",
        "/aiConfig/localModelSelection/wikiWriting",
        "/modelSelection/chat",
    ];

    for pointer in ROUTE_POINTERS {
        let Some(value) = payload.pointer(pointer) else {
            continue;
        };
        if let Some(model) = value
            .as_str()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            return Ok(WikiModelRoute {
                provider: "local-llama.cpp".into(),
                model: model.to_string(),
                reasoning_effort: None,
            });
        }
        if let Some(object) = value.as_object() {
            let model = ["model", "modelId", "id", "name"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str))
                .map(str::trim)
                .unwrap_or("");
            if model.is_empty() {
                continue;
            }
            let provider = ["source", "provider", "runtime", "type"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str))
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("local-llama.cpp");
            let reasoning_effort = ["reasoningEffort", "reasoning_effort", "effort"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str))
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            return Ok(WikiModelRoute {
                provider: provider.to_string(),
                model: model.to_string(),
                reasoning_effort,
            });
        }
    }

    Err("No model is selected for wiki generation or chat.".into())
}

fn is_codex_provider(provider: &str) -> bool {
    matches!(
        provider,
        "codex" | "chatgpt" | "codex-app-server" | "openai-codex"
    )
}

fn is_bundled_local_provider(provider: &str) -> bool {
    matches!(
        provider,
        "" | "app-local"
            | "local"
            | "tauri-rust"
            | "tauri-rust-local-bundled"
            | "llama.cpp"
            | "local-llama.cpp"
            | "node-llama-cpp"
    )
}

async fn generate_structured_response(
    app: &AppHandle,
    route: &WikiModelRoute,
    request: &StructuredModelRequest,
    payload: &Value,
) -> Result<String, String> {
    let provider = route.provider.trim().to_ascii_lowercase();
    if matches!(provider.as_str(), "ollama" | "local-ollama") {
        let prompt = format!(
            "{}\n\n{}\n\nReturn one JSON object only. Schema name: {}",
            request.system_prompt, request.user_prompt, request.json_schema_name
        );
        return crate::ollama::OllamaRuntime::generate(&route.model, &prompt).await;
    }

    if is_codex_provider(&provider) {
        #[cfg(mobile)]
        {
            let _ = (app, request, payload);
            return Err("Codex wiki generation is unavailable on mobile in this build.".into());
        }

        #[cfg(not(mobile))]
        {
            let prompt = format!(
                "{}\n\n{}\n\nReturn exactly one JSON object. Schema name: {}",
                request.system_prompt, request.user_prompt, request.json_schema_name
            );
            return crate::chat_runtime::codex_app_server::chat_with_effort(
                app,
                &route.model,
                &prompt,
                route.reasoning_effort.as_deref(),
            )
            .await
            .map(|result| result.answer);
        }
    }

    if is_bundled_local_provider(&provider) {
        #[cfg(mobile)]
        {
            let _ = (app, request, payload);
            return Err(
                "Bundled GGUF wiki generation is unavailable on mobile in this build.".into(),
            );
        }

        #[cfg(not(mobile))]
        {
            let messages = vec![
                json!({ "role": "system", "content": request.system_prompt }),
                json!({ "role": "user", "content": request.user_prompt }),
            ];
            let mut generation_payload = payload.clone();
            if let Some(object) = generation_payload.as_object_mut() {
                object.insert("temperature".into(), json!(0.1));
                object.insert("maxTokens".into(), json!(request.max_output_tokens));
            }
            return crate::local_llama_runtime::chat_with_selected_model(
                app,
                &route.model,
                &messages,
                &generation_payload,
            )
            .await?
            .map(|result| result.answer)
            .ok_or_else(|| {
                format!(
                    "Selected local model could not be resolved: {}",
                    route.model
                )
            });
        }
    }

    Err(format!(
        "Wiki generation provider `{}` is not implemented in the Rust runtime yet.",
        route.provider
    ))
}

fn extract_json_payload(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Model returned an empty wiki response.".into());
    }
    if serde_json::from_str::<Value>(trimmed).is_ok() {
        return Ok(trimmed.to_string());
    }
    let without_fence = if trimmed.starts_with("```") {
        let after_first_line = trimmed
            .split_once('\n')
            .map(|(_, rest)| rest)
            .unwrap_or(trimmed);
        after_first_line
            .strip_suffix("```")
            .unwrap_or(after_first_line)
            .trim()
    } else {
        trimmed
    };
    if serde_json::from_str::<Value>(without_fence).is_ok() {
        return Ok(without_fence.to_string());
    }
    let start = without_fence
        .find('{')
        .ok_or_else(|| "Model response does not contain a JSON object.".to_string())?;
    let end = without_fence
        .rfind('}')
        .ok_or_else(|| "Model response contains an incomplete JSON object.".to_string())?;
    if end < start {
        return Err("Model response contains an invalid JSON range.".into());
    }
    let candidate = &without_fence[start..=end];
    serde_json::from_str::<Value>(candidate)
        .map_err(|error| format!("Model response JSON is invalid: {error}"))?;
    Ok(candidate.to_string())
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
    use elephantnote_knowledge_core::analyze_markdown;

    #[test]
    fn source_selection_preserves_at_least_one_chunk_per_document() {
        let documents = vec![
            analyze_markdown("A.md", "# A\nOne\n\nTwo", 1),
            analyze_markdown("B.md", "# B\nThree", 1),
        ];
        let selected = select_source_chunks(collect_wiki_sources(&documents), 2);
        let paths = selected
            .iter()
            .map(|source| source.document_path.as_str())
            .collect::<HashSet<_>>();
        assert_eq!(paths.len(), 2);
    }

    #[test]
    fn wiki_route_accepts_app_local_source() {
        let payload = json!({
            "aiConfig": {
                "routes": {
                    "chat": { "source": "app-local", "model": "tiny.gguf" }
                }
            }
        });
        let route = selected_wiki_route(&payload).unwrap();
        assert_eq!(route.provider, "app-local");
        assert_eq!(route.model, "tiny.gguf");
        assert!(is_bundled_local_provider(&route.provider));
    }

    #[test]
    fn wiki_route_prefers_dedicated_model() {
        let payload = json!({
            "aiConfig": {
                "routes": {
                    "wiki": { "provider": "ollama", "model": "qwen3" },
                    "chat": { "provider": "local", "model": "chat.gguf" }
                }
            }
        });
        let route = selected_wiki_route(&payload).unwrap();
        assert_eq!(route.provider, "ollama");
        assert_eq!(route.model, "qwen3");
    }
    #[test]
    fn wiki_route_accepts_codex_subscription_provider() {
        let payload = json!({
            "aiConfig": {
                "routes": {
                    "chat": { "provider": "codex", "model": "gpt-5.4-mini" }
                }
            }
        });
        let route = selected_wiki_route(&payload).unwrap();
        assert_eq!(route.provider, "codex");
        assert_eq!(route.model, "gpt-5.4-mini");
        assert_eq!(route.reasoning_effort, None);
        assert!(is_codex_provider(&route.provider));
    }

    #[test]
    fn duplicate_topic_generation_is_rejected_until_guard_drops() {
        let first = acquire_wiki_generation("Minecraft").unwrap();
        assert!(acquire_wiki_generation(" minecraft ").is_err());
        drop(first);
        assert!(acquire_wiki_generation("Minecraft").is_ok());
    }
}

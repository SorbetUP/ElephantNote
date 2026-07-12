from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected exactly one match in {path}, found {count}: {old[:100]!r}")
    write(path, content.replace(old, new, 1))


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"Expected exactly one regex match in {path}, found {count}: {pattern[:100]!r}")
    write(path, updated)


# 1. Hybrid retrieval: literal exact search for counting and one result per note.
hybrid = "Elephant/backend/tauri/src/knowledge_chat_actions/hybrid_search.rs"
replace_once(
    hybrid,
    "pub(crate) fn hybrid_note_search(\n",
    r'''pub(crate) fn exact_note_search(
    store: &KnowledgeStore,
    query: &str,
    limit: usize,
) -> Result<Vec<KnowledgeSearchHit>, String> {
    let needle = query.trim();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let limit = limit.clamp(1, 100);
    let candidate_limit = (limit * 12).clamp(48, 1_200) as i64;
    let conn = Connection::open(store.database_path()).map_err(|error| error.to_string())?;
    let mut statement = conn
        .prepare(
            "SELECT c.id, d.relative_path, d.title, s.heading, c.text,
                    c.start_offset, c.end_offset,
                    CASE WHEN instr(lower(d.title), lower(?1)) > 0 THEN 2 ELSE 1 END AS exact_rank
             FROM chunks c
             JOIN documents d ON d.relative_path=c.document_path
             JOIN sections s ON s.id=c.section_id
             WHERE instr(lower(d.title), lower(?1)) > 0
                OR instr(lower(c.text), lower(?1)) > 0
             ORDER BY exact_rank DESC, d.relative_path, c.ordinal
             LIMIT ?2",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map(params![needle, candidate_limit], |row| {
            let text = row.get::<_, String>(4)?;
            Ok(KnowledgeSearchHit {
                chunk_id: row.get(0)?,
                relative_path: row.get(1)?,
                title: row.get(2)?,
                heading: row.get(3)?,
                excerpt: excerpt(&text, 360),
                score: row.get::<_, i64>(7)? as f64,
                start_offset: row.get::<_, i64>(5)?.max(0) as usize,
                end_offset: row.get::<_, i64>(6)?.max(0) as usize,
            })
        })
        .map_err(|error| error.to_string())?;
    let mut seen_paths = HashSet::new();
    let mut output = Vec::new();
    for row in rows {
        let hit = row.map_err(|error| error.to_string())?;
        if seen_paths.insert(hit.relative_path.clone()) {
            output.push(hit);
            if output.len() >= limit {
                break;
            }
        }
    }
    Ok(output)
}

pub(crate) fn hybrid_note_search(
''',
)
regex_once(
    hybrid,
    r'''    // Avoid returning ten chunks from the same note when several notes are relevant\.\n    let mut per_document = HashMap::<String, usize>::new\(\);\n    output\.retain\(\|hit\| \{\n        let count = per_document\.entry\(hit\.relative_path\.clone\(\)\)\.or_default\(\);\n        if \*count >= 3 \{\n            return false;\n        \}\n        \*count \+= 1;\n        true\n    \}\);''',
    '''    // Search results represent distinct notes, not repeated chunks from one note.
    let mut seen_documents = HashSet::<String>::new();
    output.retain(|hit| seen_documents.insert(hit.relative_path.clone()));''',
)

# 2. Route literal queries to exact search and make approved Wiki improvements update in place.
actions = "Elephant/backend/tauri/src/knowledge_chat_actions.rs"
replace_once(
    actions,
    "pub(crate) use hybrid_search::hybrid_note_search;",
    "pub(crate) use hybrid_search::{exact_note_search, hybrid_note_search};",
)
replace_once(
    actions,
    '''    if let ChatKnowledgeAction::SearchNotes { query, limit } = &proposal.action {
        let hits = hybrid_note_search(store, query, *limit)?;
        eprintln!(
            "[Knowledge][ChatSearch] query={:?} results={} strategy=hybrid",
            query,
            hits.len()
        );''',
    '''    if let ChatKnowledgeAction::SearchNotes { query, limit } = &proposal.action {
        let trimmed = query.trim();
        let exact_query = trimmed
            .strip_prefix("exact:")
            .or_else(|| trimmed.strip_prefix('='))
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let (hits, strategy) = if let Some(exact_query) = exact_query {
            (exact_note_search(store, exact_query, *limit)?, "exact")
        } else {
            (hybrid_note_search(store, query, *limit)?, "hybrid")
        };
        eprintln!(
            "[Knowledge][ChatSearch] query={:?} results={} strategy={}",
            query,
            hits.len(),
            strategy
        );''',
)
replace_once(
    actions,
    '''        ChatKnowledgeAction::AddWikiSuggestion {
            title,
            topic,
            source_paths,
        } => {
            let item = crate::knowledge_wiki_library::tauri_knowledge_wiki_library_add_candidate(
                app.clone(),
                topic.clone(),
                Some(title.clone()),
                Some(source_paths.clone()),
            )?;
            serde_json::to_value(item).map_err(|error| error.to_string())?
        }''',
    '''        ChatKnowledgeAction::AddWikiSuggestion {
            title,
            topic,
            source_paths,
        } => {
            let config = crate::tauri_extra_commands::load_ai_config(&app)?;
            let item = crate::knowledge_wiki_library::tauri_knowledge_wiki_library_add_or_update(
                app.clone(),
                title.clone(),
                topic.clone(),
                source_paths.clone(),
                json!({ "aiConfig": config }),
            )
            .await?;
            serde_json::to_value(item).map_err(|error| error.to_string())?
        }''',
)

# 3. Chat grounding: exact counts, distinct citations, and awareness of existing Wikis.
chat = "Elephant/backend/tauri/src/chat_runtime.rs"
replace_once(
    chat,
    '''fn knowledge_hits(app: &AppHandle, query: &str, limit: usize) -> Vec<KnowledgeSearchHit> {
    let Ok(vault) = crate::vault::config::get_active_vault(app) else {
        return Vec::new();
    };
    let Ok(store) = KnowledgeStore::open(Path::new(&vault.path)) else {
        return Vec::new();
    };
    crate::knowledge_chat_actions::hybrid_note_search(&store, query, limit).unwrap_or_default()
}''',
    '''fn looks_like_exact_count_request(query: &str) -> bool {
    let normalized = query.to_lowercase();
    [
        "combien de note",
        "combien de notes",
        "nombre de note",
        "nombre de notes",
        "compte les note",
        "compte le nombre",
        "count notes",
        "how many notes",
    ]
    .iter()
    .any(|needle| normalized.contains(needle))
}

#[cfg(not(mobile))]
fn knowledge_hits(app: &AppHandle, query: &str, limit: usize) -> Vec<KnowledgeSearchHit> {
    let Ok(vault) = crate::vault::config::get_active_vault(app) else {
        return Vec::new();
    };
    let Ok(store) = KnowledgeStore::open(Path::new(&vault.path)) else {
        return Vec::new();
    };
    if looks_like_exact_count_request(query) {
        let literal = query
            .split_whitespace()
            .rev()
            .find(|value| value.chars().any(char::is_alphanumeric))
            .unwrap_or(query)
            .trim_matches(|character: char| !character.is_alphanumeric());
        crate::knowledge_chat_actions::exact_note_search(&store, literal, 100).unwrap_or_default()
    } else {
        crate::knowledge_chat_actions::hybrid_note_search(&store, query, limit).unwrap_or_default()
    }
}''',
)
replace_once(
    chat,
    '''fn grounded_messages(
    app: &AppHandle,''',
    '''fn existing_wiki_catalog(app: &AppHandle) -> String {
    let Ok(vault) = crate::vault::config::get_active_vault(app) else {
        return String::new();
    };
    let Ok(store) = KnowledgeStore::open(Path::new(&vault.path)) else {
        return String::new();
    };
    store
        .list_wiki_drafts(None, 100)
        .unwrap_or_default()
        .into_iter()
        .filter(|draft| {
            matches!(
                draft.status,
                elephantnote_knowledge_core::WikiDraftStatus::Accepted
                    | elephantnote_knowledge_core::WikiDraftStatus::Outdated
            )
        })
        .map(|draft| {
            format!(
                "- draft_id={} | title={} | topic={}",
                draft.id, draft.title, draft.topic
            )
        })
        .collect::<Vec<_>>()
        .join("\\n")
}

#[cfg(not(mobile))]
fn grounded_messages(
    app: &AppHandle,''',
)
replace_once(
    chat,
    '''    let custom = configured_system_prompt(payload);''',
    '''    let mut access_contract = access_contract;
    let wiki_catalog = existing_wiki_catalog(app);
    if !wiki_catalog.is_empty() {
        access_contract.push_str(
            "\\n\\nWikis existants dans la vault :\\n",
        );
        access_contract.push_str(&wiki_catalog);
        access_contract.push_str(
            "\\nLorsqu’un utilisateur demande de modifier ou d’améliorer un Wiki existant, conserve exactement son titre dans add_wiki_suggestion. Elephant mettra ce Wiki à jour sur place après approbation ; ne crée jamais un second Wiki concurrent.",
        );
    }
    let custom = configured_system_prompt(payload);''',
)
regex_once(
    chat,
    r'''fn citations_from_hits\(hits: &\[KnowledgeSearchHit\]\) -> Vec<Value> \{\n    hits\.iter\(\)\n        \.map\(\|hit\| \{\n            json!\(\{\n                "path": hit\.relative_path,\n                "relativePath": hit\.relative_path,\n                "title": hit\.title,\n                "heading": hit\.heading,\n                "chunkId": hit\.chunk_id,\n                "excerpt": hit\.excerpt,\n                "score": hit\.score,\n                "startOffset": hit\.start_offset,\n                "endOffset": hit\.end_offset\n            \}\)\n        \}\)\n        \.collect\(\)\n\}''',
    '''fn citations_from_hits(hits: &[KnowledgeSearchHit]) -> Vec<Value> {
    let mut seen_paths = HashSet::new();
    hits.iter()
        .filter(|hit| seen_paths.insert(hit.relative_path.clone()))
        .map(|hit| {
            json!({
                "path": hit.relative_path,
                "relativePath": hit.relative_path,
                "title": hit.title,
                "heading": hit.heading,
                "chunkId": hit.chunk_id,
                "excerpt": hit.excerpt,
                "score": hit.score,
                "startOffset": hit.start_offset,
                "endOffset": hit.end_offset
            })
        })
        .collect()
}''',
)
replace_once(
    chat,
    '''- search_notes: query, limit''',
    '''- search_notes: query, limit. Prefix query with exact: for literal occurrence counting, for example exact:serpent.''',
)
replace_once(
    chat,
    '''- add_wiki_suggestion: title, topic, source_paths''',
    '''- add_wiki_suggestion: title, topic, source_paths. If a Wiki with that exact title already exists, this is an in-place improvement request, not a new Wiki.''',
)
replace_once(
    chat,
    '''        .map(|hit| hit.chunk_id.clone())''',
    '''        .map(|hit| hit.relative_path.clone())''',
)
replace_once(
    chat,
    '''        if known.insert(hit.chunk_id.clone()) {''',
    '''        if known.insert(hit.relative_path.clone()) {''',
)

# 4. A Wiki suggestion with an existing exact title regenerates and overwrites that Wiki.
library = "Elephant/backend/tauri/src/knowledge_wiki_library.rs"
insert_marker = '''#[tauri::command]
pub async fn tauri_knowledge_wiki_library_generate('''
update_impl = r'''fn rewrite_generated_wiki_identity(markdown: &str, topic: &str, title: &str) -> String {
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
            wiki_slug(&draft.title) == title_key
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
        Some(16),
        Some(80),
        Some(12),
    )
    .await?;

    let mut revised = generated.draft;
    revised.id = existing.id.clone();
    revised.topic = existing.topic.clone();
    revised.title = existing.title.clone();
    revised.slug = existing.slug.clone();
    revised.created_at = existing.created_at;
    revised.updated_at = unix_timestamp();
    revised.status = WikiDraftStatus::Proposed;
    revised.markdown = rewrite_generated_wiki_identity(
        &revised.markdown,
        &existing.topic,
        &existing.title,
    );
    store.save_wiki_draft(&revised)?;
    let accepted = tauri_knowledge_wiki_accept(app, revised.id)?;
    eprintln!(
        "[knowledge] wiki-library:updated draft={} path=.elephantnote/wiki/{}.md",
        accepted.id, accepted.slug
    );
    Ok(draft_item(&root, accepted))
}

#[tauri::command]
pub async fn tauri_knowledge_wiki_library_generate('''
replace_once(library, insert_marker, update_impl)

# 5. Repair only clearly recoverable hallucinated chunk IDs before strict validation.
wiki_core = "Elephant/backend/knowledge-core/src/wiki_core.rs"
replace_once(
    wiki_core,
    '''pub fn parse_and_render_wiki(
''',
    r'''fn shared_prefix_length(left: &str, right: &str) -> usize {
    left.bytes()
        .zip(right.bytes())
        .take_while(|(left, right)| left == right)
        .count()
}

fn recover_chunk_id(candidate: &str, allowed: &[String]) -> Option<String> {
    if allowed.iter().any(|value| value == candidate) {
        return Some(candidate.to_string());
    }
    if let Some(value) = allowed
        .iter()
        .find(|value| candidate.contains(value.as_str()) || value.contains(candidate))
    {
        return Some(value.clone());
    }
    allowed
        .iter()
        .map(|value| (shared_prefix_length(candidate, value), value))
        .max_by_key(|(prefix, _)| *prefix)
        .filter(|(prefix, _)| *prefix >= 18)
        .map(|(_, value)| value.clone())
}

fn normalize_claim_citations(claims: &mut [WikiClaim], allowed: &[String]) {
    for claim in claims {
        let mut normalized = Vec::new();
        for candidate in &claim.citation_chunk_ids {
            if let Some(chunk_id) = recover_chunk_id(candidate, allowed) {
                if !normalized.contains(&chunk_id) {
                    normalized.push(chunk_id);
                }
            } else {
                normalized.push(candidate.clone());
            }
        }
        claim.citation_chunk_ids = normalized;
    }
}

fn normalize_synthesis_citations(synthesis: &mut WikiSynthesis, sources: &[WikiSourceChunk]) {
    let allowed = sources
        .iter()
        .map(|source| source.chunk_id.clone())
        .collect::<Vec<_>>();
    normalize_claim_citations(&mut synthesis.summary, &allowed);
    for section in &mut synthesis.sections {
        normalize_claim_citations(&mut section.claims, &allowed);
    }
}

pub fn parse_and_render_wiki(
''',
)
replace_once(
    wiki_core,
    '''    let synthesis: WikiSynthesis = serde_json::from_str(response_json)
        .map_err(|error| format!("Invalid wiki synthesis JSON: {error}"))?;
    let validation = synthesis.validate(sources, max_sections);''',
    '''    let mut synthesis: WikiSynthesis = serde_json::from_str(response_json)
        .map_err(|error| format!("Invalid wiki synthesis JSON: {error}"))?;
    normalize_synthesis_citations(&mut synthesis, sources);
    let validation = synthesis.validate(sources, max_sections);''',
)

# 6. Local embedding runtime must respect the model's physical 512-token context.
llama = "Elephant/backend/tauri/src/local_llama_runtime.rs"
replace_once(
    llama,
    '''    let context = context_size_from_payload(payload);''',
    '''    let context = if embedding {
        "512".to_string()
    } else {
        context_size_from_payload(payload)
    };''',
)
replace_once(
    llama,
    '''pub async fn embed_with_selected_model(
''',
    '''fn truncate_embedding_input(text: &str) -> String {
    const MAX_BYTES: usize = 900;
    if text.len() <= MAX_BYTES {
        return text.to_string();
    }
    let mut end = MAX_BYTES;
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_string()
}

pub async fn embed_with_selected_model(
''',
)
replace_once(
    llama,
    '''    let response = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?
        .post(format!("{}/embeddings", base_url))
        .json(&json!({ "model": model_name, "input": text }))''',
    '''    let input = truncate_embedding_input(text);
    let response = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|error| error.to_string())?
        .post(format!("{}/embeddings", base_url))
        .json(&json!({ "model": model_name, "input": input }))''',
)

# 7. Semantic Wiki discovery starts the bundled app-local embedding endpoint itself.
discovery = "Elephant/backend/tauri/src/knowledge_wiki_discovery.rs"
replace_once(
    discovery,
    '''        .or_else(|| {
            if source == "app-local" {
                let value = string_at(config, "/localRuntime/llamaBaseUrl");
                (!value.is_empty()).then_some(value)
            } else {
                None
            }
        })
        .ok_or_else(|| "The selected embedding route has no endpoint. ElephantNote will not fake semantic discovery with lexical matching.".to_string())?;''',
    '''        .or_else(|| {
            if source == "app-local" {
                let value = string_at(config, "/localRuntime/llamaBaseUrl");
                (!value.is_empty()).then_some(value)
            } else {
                None
            }
        })
        .or_else(|| {
            (source == "app-local").then_some("http://127.0.0.1:39282/v1".to_string())
        })
        .ok_or_else(|| "The selected embedding route has no endpoint. Elephant will not replace semantic discovery with lexical matching.".to_string())?;''',
)
replace_once(
    discovery,
    '''async fn embed_batch(route: &EmbeddingRoute, inputs: &[String]) -> Result<Vec<Vec<f32>>, String> {
    let client = reqwest::Client::new();''',
    '''async fn embed_batch(
    app: &AppHandle,
    route: &EmbeddingRoute,
    inputs: &[String],
) -> Result<Vec<Vec<f32>>, String> {
    if route.source == "app-local" {
        let config = crate::tauri_extra_commands::load_ai_config(app)?;
        let payload = json!({ "aiConfig": config });
        let mut vectors = Vec::with_capacity(inputs.len());
        for input in inputs {
            let vector = crate::local_llama_runtime::embed_with_selected_model(
                app,
                &route.model,
                input,
                &payload,
            )
            .await?;
            vectors.push(normalize_vector(vector)?);
        }
        return Ok(vectors);
    }
    let client = reqwest::Client::new();''',
)
replace_once(
    discovery,
    '''async fn document_vectors(
    root: &Path,
    route: &EmbeddingRoute,
)''',
    '''async fn document_vectors(
    app: &AppHandle,
    root: &Path,
    route: &EmbeddingRoute,
)''',
)
replace_once(
    discovery,
    '''        let vectors = embed_batch(route, &inputs).await?;''',
    '''        let vectors = embed_batch(app, route, &inputs).await?;''',
)
replace_once(
    discovery,
    '''    let documents = document_vectors(&root, &route).await?;''',
    '''    let documents = document_vectors(app, &root, &route).await?;''',
)

# 8. Frontend uses the atomic execute endpoint once and trusts backend Auto mode.
chat_view = "Elephant/frontend/app/components/views/ChatView.vue"
replace_once(
    chat_view,
    '''    add_wiki_suggestion: 'Ajouter une proposition de Wiki',''',
    '''    add_wiki_suggestion: 'Améliorer ou proposer un Wiki',''',
)
replace_once(
    chat_view,
    '''    await invokeProposal('tauri_knowledge_chat_action_approve', id)
    const execution = await invokeProposal('tauri_knowledge_chat_action_execute', id)''',
    '''    const execution = await invokeProposal('tauri_knowledge_chat_action_execute', id)''',
)
replace_once(
    chat_view,
    '''    if (autoApproveTools.value) {
      const message = chatStore.activeMessages.find((entry) => entry.id === assistantMessage.id)
      for (const action of message?.actions || []) {
        if (action?.proposal?.status === 'proposed') await executeAction(message, action)
      }
    }
''',
    '''    // Auto mode is executed atomically by the Rust backend before this response arrives.
''',
)
replace_once(
    chat_view,
    ''':key="citation.path"''',
    ''':key="`${citation.path || citation.relativePath}:${citation.chunkId || index}`"''',
)

# 9. Remove a warning exposed by the user's real build.
embeddings = "Elephant/backend/tauri/src/knowledge_embeddings.rs"
content = read(embeddings)
content = content.replace("use std::collections::HashSet;\n", "")
write(embeddings, content)

print("Applied Chat/Wiki acceptance fixes successfully.")

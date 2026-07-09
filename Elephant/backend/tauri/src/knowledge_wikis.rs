use elephantnote_knowledge_core::{
    build_wiki_synthesis_request, collect_wiki_sources, parse_and_render_wiki,
    wiki_draft_from_rendered, DocumentSnapshot, KnowledgeStore, StructuredModelRequest, WikiDraft,
    WikiDraftStatus, WikiSourceChunk,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

const DEFAULT_MAX_DOCUMENTS: usize = 12;
const DEFAULT_MAX_CHUNKS: usize = 64;
const DEFAULT_MAX_SECTIONS: usize = 10;

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
    let root = active_vault_root(&app)?;
    let store = active_store(&root)?;
    let documents = select_documents(
        &store,
        &topic,
        source_paths.unwrap_or_default(),
        max_documents.unwrap_or(DEFAULT_MAX_DOCUMENTS).clamp(1, 50),
    )?;
    let sources = select_source_chunks(
        collect_wiki_sources(&documents),
        max_chunks.unwrap_or(DEFAULT_MAX_CHUNKS).clamp(1, 256),
    );
    if sources.is_empty() {
        return Err("No indexed source chunks are available for this wiki.".into());
    }
    let max_sections = max_sections.unwrap_or(DEFAULT_MAX_SECTIONS).clamp(1, 30);
    let request = build_wiki_synthesis_request(&topic, title.as_deref(), &sources, max_sections);
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
        for hit in store.search(topic, max_documents.saturating_mul(4).clamp(1, 200))? {
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

fn select_source_chunks(
    mut sources: Vec<WikiSourceChunk>,
    max_chunks: usize,
) -> Vec<WikiSourceChunk> {
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

fn selected_wiki_route(payload: &Value) -> Result<WikiModelRoute, String> {
    const ROUTE_POINTERS: &[&str] = &[
        "/modelSelection/wiki",
        "/modelSelection/wikiWriting",
        "/aiConfig/localModelSelection/wiki",
        "/aiConfig/localModelSelection/wikiWriting",
        "/aiConfig/routes/wiki",
        "/aiConfig/routes/wikiWriting",
        "/config/routes/wiki",
        "/config/routes/wikiWriting",
        "/aiConfig/routes/chat",
        "/config/routes/chat",
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
            return Ok(WikiModelRoute {
                provider: provider.to_string(),
                model: model.to_string(),
            });
        }
    }

    Err("No model is selected for wiki generation or chat.".into())
}

fn is_bundled_local_provider(provider: &str) -> bool {
    matches!(
        provider,
        ""
            | "app-local"
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
}

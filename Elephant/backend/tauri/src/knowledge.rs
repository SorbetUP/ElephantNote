use elephantnote_knowledge_core::{
    build_tagging_request, parse_tagging_response, rebuild_vault, ActionValidation, CanonicalTag,
    ChatKnowledgeAction, DocumentSnapshot, DocumentTagAssignment, KnowledgeSearchHit,
    KnowledgeStatus, KnowledgeStore, RebuildReport, StructuredModelRequest, TagAlias,
    TaggingExtraction,
};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::Path;
use tauri::AppHandle;

fn active_vault_root(app: &AppHandle) -> Result<String, String> {
    crate::vault::config::get_active_vault(app).map(|vault| vault.path)
}

fn active_store(app: &AppHandle) -> Result<KnowledgeStore, String> {
    let root = active_vault_root(app)?;
    KnowledgeStore::open(Path::new(&root))
}

#[tauri::command]
pub async fn tauri_knowledge_rebuild(app: AppHandle) -> Result<RebuildReport, String> {
    let root = active_vault_root(&app)?;
    tauri::async_runtime::spawn_blocking(move || rebuild_vault(Path::new(&root)))
        .await
        .map_err(|error| format!("Knowledge rebuild worker failed: {error}"))?
}

#[tauri::command]
pub fn tauri_knowledge_status(app: AppHandle) -> Result<KnowledgeStatus, String> {
    active_store(&app)?.status()
}

#[tauri::command]
pub fn tauri_knowledge_search(
    app: AppHandle,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<KnowledgeSearchHit>, String> {
    active_store(&app)?.search(&query, limit.unwrap_or(20))
}

#[tauri::command]
pub fn tauri_knowledge_inspect_note(
    app: AppHandle,
    relative_path: String,
) -> Result<Option<DocumentSnapshot>, String> {
    active_store(&app)?.inspect_document(&relative_path)
}

#[tauri::command]
pub fn tauri_knowledge_validate_chat_action(action: ChatKnowledgeAction) -> ActionValidation {
    action.validate()
}

#[tauri::command]
pub fn tauri_knowledge_tags_list(app: AppHandle) -> Result<Vec<CanonicalTag>, String> {
    active_store(&app)?.list_canonical_tags()
}

#[tauri::command]
pub fn tauri_knowledge_tag_upsert(app: AppHandle, tag: CanonicalTag) -> Result<(), String> {
    active_store(&app)?.upsert_canonical_tag(&tag)
}

#[tauri::command]
pub fn tauri_knowledge_tag_alias_add(app: AppHandle, alias: TagAlias) -> Result<(), String> {
    active_store(&app)?.add_tag_alias(&alias)
}

#[tauri::command]
pub fn tauri_knowledge_tag_resolve(
    app: AppHandle,
    name: String,
    language: Option<String>,
) -> Result<Option<CanonicalTag>, String> {
    active_store(&app)?.resolve_tag(&name, language.as_deref())
}

#[tauri::command]
pub fn tauri_knowledge_tag_assignment_save(
    app: AppHandle,
    assignment: DocumentTagAssignment,
) -> Result<(), String> {
    active_store(&app)?.save_document_tag_assignment(&assignment)
}

#[tauri::command]
pub fn tauri_knowledge_tag_reject_name(
    app: AppHandle,
    relative_path: String,
    proposed_name: String,
    reason: String,
) -> Result<(), String> {
    active_store(&app)?.reject_tag_name(&relative_path, &proposed_name, &reason)
}

#[tauri::command]
pub fn tauri_knowledge_tagging_request(
    app: AppHandle,
    relative_path: String,
    max_tags: Option<usize>,
) -> Result<StructuredModelRequest, String> {
    let store = active_store(&app)?;
    build_request(&store, &relative_path, max_tags.unwrap_or(8))
}

#[tauri::command]
pub fn tauri_knowledge_tagging_validate(
    app: AppHandle,
    relative_path: String,
    response_json: String,
    max_tags: Option<usize>,
) -> Result<TaggingExtraction, String> {
    let store = active_store(&app)?;
    let document = indexed_document(&store, &relative_path)?;
    parse_tagging_response(
        &extract_json_payload(&response_json)?,
        &document,
        max_tags.unwrap_or(8).clamp(1, 20),
    )
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaggingGenerationResult {
    pub extraction: TaggingExtraction,
    pub provider: String,
    pub model: String,
    pub raw_response: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct KnowledgeModelRoute {
    provider: String,
    model: String,
}

#[tauri::command]
pub async fn tauri_knowledge_tagging_generate(
    app: AppHandle,
    relative_path: String,
    payload: Value,
    max_tags: Option<usize>,
) -> Result<TaggingGenerationResult, String> {
    let max_tags = max_tags.unwrap_or(8).clamp(1, 20);
    let store = active_store(&app)?;
    let document = indexed_document(&store, &relative_path)?;
    let request = build_request(&store, &relative_path, max_tags)?;
    let route = selected_knowledge_route(&payload)?;

    eprintln!(
        "[knowledge] tagging:start path={} provider={} model={} chunks={}",
        relative_path,
        route.provider,
        route.model,
        document.chunks.len()
    );

    let raw_response = generate_structured_response(&app, &route, &request, &payload).await?;
    let json_response = extract_json_payload(&raw_response)?;
    let extraction = parse_tagging_response(&json_response, &document, max_tags)?;

    eprintln!(
        "[knowledge] tagging:complete path={} provider={} model={} tags={}",
        relative_path,
        route.provider,
        route.model,
        extraction.tags.len()
    );

    Ok(TaggingGenerationResult {
        extraction,
        provider: route.provider,
        model: route.model,
        raw_response,
    })
}

fn indexed_document(
    store: &KnowledgeStore,
    relative_path: &str,
) -> Result<DocumentSnapshot, String> {
    store
        .inspect_document(relative_path)?
        .ok_or_else(|| format!("Knowledge document is not indexed: {relative_path}"))
}

fn build_request(
    store: &KnowledgeStore,
    relative_path: &str,
    max_tags: usize,
) -> Result<StructuredModelRequest, String> {
    let document = indexed_document(store, relative_path)?;
    let taxonomy =
        serde_json::to_string(&store.list_canonical_tags()?).map_err(|error| error.to_string())?;
    Ok(build_tagging_request(
        &document,
        &taxonomy,
        max_tags.clamp(1, 20),
    ))
}

fn selected_knowledge_route(payload: &Value) -> Result<KnowledgeModelRoute, String> {
    const ROUTE_POINTERS: &[&str] = &[
        "/modelSelection/knowledgeTagging",
        "/modelSelection/tagging",
        "/aiConfig/localModelSelection/knowledgeTagging",
        "/aiConfig/localModelSelection/tagging",
        "/aiConfig/routes/knowledgeTagging",
        "/aiConfig/routes/tagging",
        "/config/routes/knowledgeTagging",
        "/config/routes/tagging",
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
            return Ok(KnowledgeModelRoute {
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
            let provider = ["provider", "runtime", "type"]
                .iter()
                .find_map(|key| object.get(*key).and_then(Value::as_str))
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("local-llama.cpp");
            return Ok(KnowledgeModelRoute {
                provider: provider.to_string(),
                model: model.to_string(),
            });
        }
    }

    let direct_model = ["model", "modelId", "knowledgeTaggingModel"]
        .iter()
        .find_map(|key| payload.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .unwrap_or("");
    if !direct_model.is_empty() {
        let provider = payload
            .get("provider")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("local-llama.cpp");
        return Ok(KnowledgeModelRoute {
            provider: provider.to_string(),
            model: direct_model.to_string(),
        });
    }

    Err("No model is selected for knowledge tagging or chat.".into())
}

async fn generate_structured_response(
    app: &AppHandle,
    route: &KnowledgeModelRoute,
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

    if matches!(
        provider.as_str(),
        "" | "local" | "tauri-rust" | "llama.cpp" | "local-llama.cpp" | "node-llama-cpp"
    ) {
        #[cfg(mobile)]
        {
            let _ = (app, request, payload);
            return Err(
                "Bundled GGUF knowledge tagging is unavailable on mobile in this build.".into(),
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
                object.insert("temperature".into(), json!(0.0));
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
        "Knowledge tagging provider `{}` is not implemented in the Rust runtime yet.",
        route.provider
    ))
}

fn extract_json_payload(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("Model returned an empty tagging response.".into());
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mutation_contract_requires_approval_and_hash() {
        let validation = tauri_knowledge_validate_chat_action(ChatKnowledgeAction::ReplaceNote {
            relative_path: "Notes/A.md".into(),
            content: "# A".into(),
            expected_hash: String::new(),
        });
        assert!(!validation.valid);
        assert!(validation.requires_approval);
    }

    #[test]
    fn create_note_contract_rejects_hidden_path() {
        let validation = tauri_knowledge_validate_chat_action(ChatKnowledgeAction::CreateNote {
            relative_path: ".elephantnote/private.md".into(),
            content: "# Hidden".into(),
        });
        assert!(!validation.valid);
    }

    #[test]
    fn selected_route_prefers_explicit_knowledge_model() {
        let route = selected_knowledge_route(&json!({
            "modelSelection": {
                "knowledgeTagging": {
                    "provider": "ollama",
                    "model": "qwen3:4b"
                }
            }
        }))
        .unwrap();
        assert_eq!(
            route,
            KnowledgeModelRoute {
                provider: "ollama".into(),
                model: "qwen3:4b".into()
            }
        );
    }

    #[test]
    fn selected_route_falls_back_to_chat_model() {
        let route = selected_knowledge_route(&json!({
            "aiConfig": {
                "routes": {
                    "chat": {
                        "provider": "local-llama.cpp",
                        "model": "qwen3.gguf"
                    }
                }
            }
        }))
        .unwrap();
        assert_eq!(route.provider, "local-llama.cpp");
        assert_eq!(route.model, "qwen3.gguf");
    }

    #[test]
    fn selected_route_rejects_missing_model() {
        let error = selected_knowledge_route(&json!({})).unwrap_err();
        assert!(error.contains("No model is selected"));
    }

    #[test]
    fn extracts_json_from_fenced_model_response() {
        let raw = "```json\n{\"tags\":[]}\n```";
        assert_eq!(extract_json_payload(raw).unwrap(), "{\"tags\":[]}");
    }

    #[test]
    fn extracts_json_from_wrapped_model_response() {
        let raw = "Here is the result: {\"tags\":[]}";
        assert_eq!(extract_json_payload(raw).unwrap(), "{\"tags\":[]}");
    }
}

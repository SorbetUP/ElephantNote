#[cfg(not(mobile))]
pub(crate) mod codex_app_server;

use elephantnote_knowledge_core::{ChatKnowledgeAction, KnowledgeSearchHit, KnowledgeStore};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter};

#[cfg(not(mobile))]
use crate::local_llama_runtime;
#[cfg(not(mobile))]
use std::collections::HashSet;
#[cfg(not(mobile))]
use std::path::Path;

type R<T> = Result<T, String>;

fn text(value: &Value, keys: &[&str]) -> String {
    if let Some(raw) = value.as_str() {
        return raw.trim().to_string();
    }
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_str))
        .map(str::trim)
        .unwrap_or("")
        .to_string()
}

fn extract_messages(payload: &Value) -> Vec<Value> {
    if let Some(messages) = payload.get("messages").and_then(Value::as_array) {
        let out = messages
            .iter()
            .filter_map(|message| {
                let role = text(message, &["role"]);
                let content = text(message, &["content", "text", "message"]);
                if role.is_empty() || content.is_empty() {
                    None
                } else {
                    Some(json!({ "role": role, "content": content }))
                }
            })
            .collect::<Vec<_>>();
        if !out.is_empty() {
            return out;
        }
    }
    let message = text(payload, &["message", "prompt", "query", "text"]);
    if message.is_empty() {
        Vec::new()
    } else {
        vec![json!({ "role": "user", "content": message })]
    }
}

fn last_user_message(payload: &Value) -> String {
    extract_messages(payload)
        .into_iter()
        .rev()
        .find(|message| message.get("role").and_then(Value::as_str).unwrap_or("") == "user")
        .map(|message| text(&message, &["content", "text", "message"]))
        .unwrap_or_default()
}

fn ai_config(payload: &Value) -> &Value {
    payload
        .get("aiConfig")
        .or_else(|| payload.get("config"))
        .unwrap_or(&Value::Null)
}

fn selected_chat_source(payload: &Value) -> String {
    let config = ai_config(payload);
    let route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
    [
        text(route, &["source", "provider"]),
        text(config, &["provider", "transport"]),
    ]
    .into_iter()
    .find(|value| !value.is_empty())
    .unwrap_or_else(|| "app-local".to_string())
}

fn selected_chat_model(payload: &Value) -> String {
    let config = ai_config(payload);
    let route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
    let source = selected_chat_source(payload);
    if source == "codex" {
        return [
            text(route, &["model", "modelId", "id"]),
            text(
                config.pointer("/providers/codex").unwrap_or(&Value::Null),
                &["model"],
            ),
            text(payload, &["model", "modelId", "chatModel"]),
        ]
        .into_iter()
        .find(|value| !value.is_empty())
        .unwrap_or_default();
    }

    let selection = payload.get("modelSelection").unwrap_or(&Value::Null);
    let config_selection = config
        .pointer("/localModelSelection")
        .unwrap_or(&Value::Null);
    [
        text(selection, &["chat"]),
        text(config_selection, &["chat"]),
        text(route, &["model", "modelId", "id"]),
        text(payload, &["model", "modelId", "chatModel"]),
    ]
    .into_iter()
    .find(|value| !value.is_empty())
    .unwrap_or_default()
}

fn selected_chat_reasoning_effort(payload: &Value) -> Option<String> {
    let route = ai_config(payload)
        .pointer("/routes/chat")
        .unwrap_or(&Value::Null);
    let effort = text(route, &["reasoningEffort", "reasoning_effort", "effort"]);
    (!effort.is_empty()).then_some(effort)
}

fn promote_saved_codex_route(config: &mut Value) -> bool {
    let codex_model = config
        .pointer("/providers/codex/model")
        .and_then(Value::as_str)
        .map(str::trim)
        .unwrap_or("")
        .to_string();
    if codex_model.is_empty() {
        return false;
    }
    let route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
    let source = text(route, &["source", "provider"]);
    let model = text(route, &["model"]);
    let stale_default = source.is_empty()
        || source == "disabled"
        || (source == "app-local" && (model.is_empty() || model == "smollm2-node-llama-cpp"));
    if !stale_default {
        return false;
    }
    let Some(root) = config.as_object_mut() else {
        return false;
    };
    let routes = root.entry("routes").or_insert_with(|| json!({}));
    let Some(routes) = routes.as_object_mut() else {
        return false;
    };
    let chat = routes.entry("chat").or_insert_with(|| json!({}));
    let Some(chat) = chat.as_object_mut() else {
        return false;
    };
    chat.insert("source".into(), json!("codex"));
    chat.insert("provider".into(), json!("codex"));
    chat.insert("transport".into(), json!("codex"));
    chat.insert("endpoint".into(), json!("codex://app-server"));
    chat.insert("model".into(), json!(codex_model));
    chat.entry("reasoningEffort")
        .or_insert_with(|| json!("medium"));
    chat.entry("enableTools").or_insert_with(|| json!(true));
    chat.entry("enableRag").or_insert_with(|| json!(true));
    chat.entry("stream").or_insert_with(|| json!(true));
    true
}

fn with_saved_ai_config(app: &AppHandle, payload: Value) -> Value {
    let mut payload = if payload.is_object() {
        payload
    } else {
        json!({ "message": payload })
    };
    if ai_config(&payload).pointer("/routes/chat").is_none() {
        if let Ok(mut config) = crate::tauri_extra_commands::load_ai_config(app) {
            let promoted = promote_saved_codex_route(&mut config);
            if promoted {
                let _ = crate::tauri_extra_commands::save_ai_config(app, &config);
                eprintln!("[Codex][config] promoted saved Codex model to the active Chat route");
            }
            if let Some(object) = payload.as_object_mut() {
                object.insert("aiConfig".into(), config);
            }
        }
    }
    payload
}

#[cfg(not(mobile))]
pub async fn prewarm_saved_codex(app: &AppHandle) {
    let Ok(mut config) = crate::tauri_extra_commands::load_ai_config(app) else {
        return;
    };
    let promoted = promote_saved_codex_route(&mut config);
    let source = config
        .pointer("/routes/chat/source")
        .and_then(Value::as_str)
        .unwrap_or("");
    if source != "codex" {
        return;
    }
    if promoted {
        let _ = crate::tauri_extra_commands::save_ai_config(app, &config);
    }
    match codex_app_server::command(app, &json!({ "codexOperation": "status" })).await {
        Ok(status) => eprintln!(
            "[Codex][startup] prewarm connected={} promoted={}",
            status
                .get("connected")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            promoted
        ),
        Err(error) => eprintln!("[Codex][startup] prewarm failed: {error}"),
    }
}

#[cfg(not(mobile))]
fn looks_like_exact_count_request(query: &str) -> bool {
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
}

#[cfg(not(mobile))]
fn rag_enabled(payload: &Value) -> bool {
    ai_config(payload)
        .pointer("/routes/chat/enableRag")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

#[cfg(not(mobile))]
fn tools_enabled(payload: &Value) -> bool {
    ai_config(payload)
        .pointer("/routes/chat/enableTools")
        .and_then(Value::as_bool)
        .unwrap_or(true)
}

#[cfg(not(mobile))]
fn auto_accept_enabled(payload: &Value) -> bool {
    payload
        .get("autoApproveTools")
        .or_else(|| payload.get("autoAcceptTools"))
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

#[cfg(not(mobile))]
fn configured_system_prompt(payload: &Value) -> String {
    text(
        ai_config(payload)
            .pointer("/routes/chat")
            .unwrap_or(&Value::Null),
        &["systemPrompt", "system_prompt"],
    )
}

#[cfg(not(mobile))]
fn existing_wiki_catalog(app: &AppHandle) -> String {
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
        .join("\n")
}

#[cfg(not(mobile))]
fn grounded_messages(
    app: &AppHandle,
    payload: &Value,
    query: &str,
) -> (Vec<Value>, Vec<KnowledgeSearchHit>) {
    let requested_limit = payload.get("limit").and_then(Value::as_u64).unwrap_or(8) as usize;
    let hits = if rag_enabled(payload) {
        knowledge_hits(app, query, requested_limit.clamp(4, 20))
    } else {
        Vec::new()
    };
    let context = hits
        .iter()
        .enumerate()
        .map(|(index, hit)| {
            format!(
                "[{}] {} — {} ({})\n{}",
                index + 1,
                hit.title,
                hit.heading,
                hit.relative_path,
                hit.excerpt
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n");
    let access_contract = if !rag_enabled(payload) {
        "La recherche dans les notes est désactivée pour cette requête. Ne prétends pas avoir consulté la vault."
            .to_string()
    } else if hits.is_empty() {
        "Tu peux interroger l’index local Elephant, mais aucun passage pertinent n’a été trouvé pendant la première passe. Utilise search_notes pour reformuler ou décomposer la recherche si nécessaire."
            .to_string()
    } else {
        format!(
            "Tu peux consulter les passages de notes indexées ci-dessous. Ils proviennent d’une recherche hybride combinant texte, titres, liens Wiki et embeddings. Utilise-les pour les affirmations concernant la vault et cite-les avec [1], [2], etc. Tu peux lancer des recherches search_notes supplémentaires si ces passages sont insuffisants.\n\n{context}"
        )
    };
    let mut access_contract = access_contract;
    let wiki_catalog = existing_wiki_catalog(app);
    if !wiki_catalog.is_empty() {
        access_contract.push_str("\n\nWikis existants dans la vault :\n");
        access_contract.push_str(&wiki_catalog);
        access_contract.push_str(
            "\nLorsqu’un utilisateur demande de modifier ou d’améliorer un Wiki existant, conserve exactement son titre dans add_wiki_suggestion. Elephant mettra ce Wiki à jour sur place après approbation ; ne crée jamais un second Wiki concurrent.",
        );
    }
    let custom = configured_system_prompt(payload);
    let tools = if tools_enabled(payload) {
        format!("\n\n{}", tool_contract())
    } else {
        String::new()
    };
    let system = if custom.is_empty() {
        format!(
            "Tu es l’assistant Elephant. Réponds en français par défaut. {access_contract}{tools}"
        )
    } else {
        format!("{custom}\n\nCapacités Elephant : {access_contract}{tools}")
    };
    let mut messages = vec![json!({ "role": "system", "content": system })];
    messages.extend(extract_messages(payload));
    (messages, hits)
}

#[cfg(not(mobile))]
fn citations_from_hits(hits: &[KnowledgeSearchHit]) -> Vec<Value> {
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
}

#[cfg(not(mobile))]
fn tool_contract() -> &'static str {
    r#"You have real Elephant tools. Never claim that you cannot search notes, create a note, update a note, add or reject a Wiki suggestion, generate a Wiki, or delete a Wiki.
When more information is needed, perform one or several search_notes actions. You may search repeatedly: inspect the returned results, refine the wording, split a broad question into subqueries, then search again. Do not stop after one weak query.
Append exactly one machine-readable action block after the human answer:
<elephantnote_actions>[{"action":"search_notes","query":"...","limit":10}]</elephantnote_actions>
The block may contain several actions.
Supported action names and fields:
- search_notes: query, limit. Prefix query with exact: for literal occurrence counting, for example exact:serpent.
- create_note: relative_path, title, content
- append_to_note: relative_path, content (omit expected_hash; Elephant adds the current hash)
- replace_note: relative_path, content (omit expected_hash)
- replace_note_range: relative_path, start_offset, end_offset, replacement (omit expected_hash)
- add_wiki_suggestion: title, topic, source_paths. If a Wiki with that exact title already exists, this is an in-place improvement request, not a new Wiki.
- create_wiki: title, topic, source_paths
- reject_wiki_suggestion: topic
- delete_wiki: draft_id
Do not invent successful execution. Mutating actions require approval unless Auto mode is enabled. Search actions execute immediately. Do not put the action block in Markdown fences."#
}

#[cfg(not(mobile))]
fn action_block(answer: &str) -> (String, Vec<Value>) {
    const START: &str = "<elephantnote_actions>";
    const END: &str = "</elephantnote_actions>";
    let Some(start) = answer.find(START) else {
        return (answer.trim().to_string(), Vec::new());
    };
    let body_start = start + START.len();
    let Some(relative_end) = answer[body_start..].find(END) else {
        return (answer.trim().to_string(), Vec::new());
    };
    let end = body_start + relative_end;
    let actions = serde_json::from_str::<Value>(answer[body_start..end].trim())
        .ok()
        .and_then(|value| match value {
            Value::Array(values) => Some(values),
            Value::Object(_) => Some(vec![value]),
            _ => None,
        })
        .unwrap_or_default();
    let mut visible = String::new();
    visible.push_str(answer[..start].trim_end());
    visible.push_str(answer[end + END.len()..].trim_start());
    (visible.trim().to_string(), actions)
}

#[cfg(not(mobile))]
fn enrich_write_guard(app: &AppHandle, value: &mut Value) -> R<()> {
    let action = value.get("action").and_then(Value::as_str).unwrap_or("");
    if !matches!(
        action,
        "append_to_note" | "replace_note" | "replace_note_range"
    ) {
        return Ok(());
    }
    if value
        .get("expected_hash")
        .and_then(Value::as_str)
        .is_some_and(|value| !value.trim().is_empty())
    {
        return Ok(());
    }
    let path = value
        .get("relative_path")
        .and_then(Value::as_str)
        .ok_or_else(|| "A note action is missing relative_path.".to_string())?;
    let root = Path::new(&crate::vault::config::get_active_vault(app)?.path).to_path_buf();
    let store = KnowledgeStore::open(&root)?;
    let hash = store.existing_hash(path)?.ok_or_else(|| {
        format!("Cannot prepare note action because the note is not indexed: {path}")
    })?;
    value
        .as_object_mut()
        .ok_or_else(|| "Action payload must be an object.".to_string())?
        .insert("expected_hash".into(), json!(hash));
    Ok(())
}

#[cfg(not(mobile))]
async fn prepare_assistant_actions(
    app: &AppHandle,
    actions: Vec<Value>,
    auto_accept: bool,
    seen: &mut HashSet<String>,
) -> (Vec<Value>, Vec<String>) {
    let mut prepared = Vec::new();
    let mut errors = Vec::new();
    for mut value in actions.into_iter().take(12) {
        let key = serde_json::to_string(&value).unwrap_or_default();
        if !key.is_empty() && !seen.insert(key) {
            continue;
        }
        let rationale = value
            .get("rationale")
            .and_then(Value::as_str)
            .map(str::to_string);
        if let Some(object) = value.as_object_mut() {
            object.remove("rationale");
        }
        if let Err(error) = enrich_write_guard(app, &mut value) {
            errors.push(error);
            continue;
        }
        let action = match serde_json::from_value::<ChatKnowledgeAction>(value) {
            Ok(action) => action,
            Err(error) => {
                errors.push(format!("Invalid Elephant action: {error}"));
                continue;
            }
        };
        match crate::knowledge_chat_actions::tauri_knowledge_chat_action_prepare(
            app.clone(),
            action,
            rationale,
        ) {
            Ok(mut result) => {
                if auto_accept
                    && result.execution.is_none()
                    && matches!(
                        &result.proposal.status,
                        elephantnote_knowledge_core::ChatActionStatus::Proposed
                    )
                {
                    match crate::knowledge_chat_actions::tauri_knowledge_chat_action_execute(
                        app.clone(),
                        result.proposal.id.clone(),
                    )
                    .await
                    {
                        Ok(execution) => {
                            result.proposal = execution.proposal.clone();
                            result.execution = Some(execution);
                        }
                        Err(error) => errors.push(error),
                    }
                }
                match serde_json::to_value(result) {
                    Ok(value) => prepared.push(value),
                    Err(error) => errors.push(error.to_string()),
                }
            }
            Err(error) => errors.push(error),
        }
    }
    (prepared, errors)
}

#[cfg(not(mobile))]
fn tool_results(actions: &[Value]) -> Vec<Value> {
    actions
        .iter()
        .filter_map(|entry| entry.pointer("/execution/result"))
        .filter(|value| !value.is_null())
        .cloned()
        .collect()
}

#[cfg(not(mobile))]
fn search_hits_from_tool_results(results: &[Value]) -> Vec<KnowledgeSearchHit> {
    results
        .iter()
        .filter_map(Value::as_array)
        .flat_map(|values| values.iter())
        .filter_map(|value| serde_json::from_value::<KnowledgeSearchHit>(value.clone()).ok())
        .collect()
}

#[cfg(not(mobile))]
fn merge_hits(target: &mut Vec<KnowledgeSearchHit>, additions: Vec<KnowledgeSearchHit>) {
    let mut known = target
        .iter()
        .map(|hit| hit.relative_path.clone())
        .collect::<HashSet<_>>();
    for hit in additions {
        if known.insert(hit.relative_path.clone()) {
            target.push(hit);
        }
    }
    target.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    target.truncate(40);
}

#[cfg(not(mobile))]
fn local_runtime_config(payload: &Value) -> &Value {
    payload
        .get("localRuntime")
        .or_else(|| payload.pointer("/aiConfig/localRuntime"))
        .or_else(|| payload.pointer("/config/localRuntime"))
        .unwrap_or(&Value::Null)
}

#[cfg(not(mobile))]
fn configured_server_path(payload: &Value) -> String {
    let runtime = local_runtime_config(payload);
    let direct = text(payload, &["llamaServerPath", "serverPath", "llamaBinary"]);
    if direct.is_empty() {
        text(
            runtime,
            &["llamaServerPath", "serverPath", "llamaBinary", "path"],
        )
    } else {
        direct
    }
}

#[cfg(not(mobile))]
fn validate_configured_llama_binary(payload: &Value) -> R<()> {
    let configured = configured_server_path(payload);
    if configured.trim().is_empty() {
        return Ok(());
    }
    let basename = Path::new(&configured)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(configured.as_str());
    let allowed = [
        "llama-server",
        "llama-server.exe",
        "llama.cpp-server",
        "llama-cpp-server",
    ];
    if !allowed.contains(&basename) {
        return Err(format!(
            "Refusing unsupported llama runtime binary: {basename}."
        ));
    }
    let path = Path::new(&configured);
    if path.is_absolute() && !path.is_file() {
        return Err(format!(
            "Configured llama runtime path does not exist: {configured}"
        ));
    }
    Ok(())
}

#[cfg(not(mobile))]
async fn run_codex_tool_loop(
    app: &AppHandle,
    payload: &Value,
    model: &str,
    reasoning_effort: Option<&str>,
    initial_prompt: String,
    initial_hits: Vec<KnowledgeSearchHit>,
    stream_id: Option<&str>,
) -> R<Value> {
    const MAX_TOOL_ROUNDS: usize = 5;
    let auto_accept = auto_accept_enabled(payload);
    let mut prompt = initial_prompt.clone();
    let mut answer = String::new();
    let mut actions = Vec::<Value>::new();
    let mut action_errors = Vec::<String>::new();
    let mut all_hits = initial_hits;
    let mut seen_actions = HashSet::<String>::new();
    let mut accumulated_results = Vec::<Value>::new();
    let mut final_model = model.to_string();
    let mut final_thread_id = Value::Null;

    for round in 0..MAX_TOOL_ROUNDS {
        eprintln!(
            "[Knowledge][ChatLoop] round={} auto_accept={} accumulated_results={}",
            round + 1,
            auto_accept,
            accumulated_results.len()
        );
        let result = codex_app_server::chat_with_effort_streaming(
            app,
            model,
            &prompt,
            reasoning_effort,
            stream_id,
        )
        .await?;
        final_model = result.model.clone();
        final_thread_id = json!(result.thread_id.clone());
        let (visible_answer, raw_actions) = if tools_enabled(payload) {
            action_block(&result.answer)
        } else {
            (result.answer.clone(), Vec::new())
        };
        answer = visible_answer;

        if raw_actions.is_empty() {
            break;
        }
        let (prepared, errors) =
            prepare_assistant_actions(app, raw_actions, auto_accept, &mut seen_actions).await;
        action_errors.extend(errors);
        let current_results = tool_results(&prepared);
        merge_hits(
            &mut all_hits,
            search_hits_from_tool_results(&current_results),
        );
        actions.extend(prepared);

        if current_results.is_empty() {
            break;
        }
        accumulated_results.extend(current_results);
        if round + 1 >= MAX_TOOL_ROUNDS {
            break;
        }
        if let Some(stream_id) = stream_id {
            let _ = app.emit(
                "elephantnote://chat-stream",
                json!({
                    "streamId": stream_id,
                    "type": "reset",
                    "phase": "tool-results",
                    "round": round + 1
                }),
            );
        }
        let tool_context = serde_json::to_string_pretty(&accumulated_results)
            .map_err(|error| error.to_string())?;
        prompt = format!(
            "{initial_prompt}\n\nElephant executed the following real tool calls and returned these results:\n{tool_context}\n\nContinue the task using all results. Do not repeat an action already executed. If the evidence is still incomplete, emit a new search_notes action with a refined or complementary query. You may perform several consecutive searches. When enough evidence is available, answer fully and emit no action block."
        );
    }

    Ok(json!({
        "answer": answer,
        "sources": all_hits,
        "citations": citations_from_hits(&all_hits),
        "actions": actions,
        "actionErrors": action_errors,
        "runtime": "codex-app-server",
        "provider": "codex",
        "model": final_model,
        "reasoningEffort": reasoning_effort,
        "threadId": final_thread_id,
        "autoAccepted": auto_accept
    }))
}

#[tauri::command]
pub async fn tauri_knowledge_chat(app: AppHandle, payload: Value) -> R<Value> {
    #[cfg(not(mobile))]
    if payload.get("codexOperation").is_some() {
        return codex_app_server::command(&app, &payload).await;
    }

    let payload = with_saved_ai_config(&app, payload);
    let message = last_user_message(&payload);
    let model = selected_chat_model(&payload);
    let source = selected_chat_source(&payload);
    let reasoning_effort = selected_chat_reasoning_effort(&payload);
    if message.trim().is_empty() {
        return Ok(json!({
            "answer": "Écris un message pour démarrer le chat.",
            "sources": [],
            "runtime": "rust-knowledge-core",
            "model": model
        }));
    }
    if model.trim().is_empty() {
        return Ok(json!({
            "answer": "Aucun modèle n’est sélectionné pour le rôle Chat.",
            "sources": [],
            "runtime": "rust-knowledge-core",
            "model": model,
            "warning": "No chat model selected"
        }));
    }

    #[cfg(mobile)]
    {
        let _ = (app, source);
        return Err("Desktop AI runtimes are unavailable on mobile in this build.".into());
    }

    #[cfg(not(mobile))]
    if source == "codex" {
        let (messages, hits) = grounded_messages(&app, &payload, &message);
        let transcript = messages
            .iter()
            .map(|entry| {
                format!(
                    "{}:\n{}",
                    text(entry, &["role"]).to_uppercase(),
                    text(entry, &["content"])
                )
            })
            .collect::<Vec<_>>()
            .join("\n\n");
        let prompt = format!(
            "You are answering inside Elephant. Do not inspect the filesystem or run shell commands. Use only the conversation, retrieved note context and Elephant tools below. Return a useful human answer, followed by an action block only when a tool is needed.\n\n{}",
            transcript
        );
        let stream_id = text(&payload, &["streamId", "stream_id"]);
        let stream_id = (!stream_id.is_empty()).then_some(stream_id);
        return run_codex_tool_loop(
            &app,
            &payload,
            &model,
            reasoning_effort.as_deref(),
            prompt,
            hits,
            stream_id.as_deref(),
        )
        .await;
    }

    #[cfg(not(mobile))]
    {
        let local_sources = [
            "",
            "app-local",
            "local",
            "tauri-rust",
            "tauri-rust-local-bundled",
            "node-llama-cpp",
            "local-llama.cpp",
            "llama.cpp",
        ];
        if !local_sources.contains(&source.as_str()) {
            return Err(format!("Unsupported chat provider: {source}"));
        }
        validate_configured_llama_binary(&payload)?;
        let (messages, hits) = grounded_messages(&app, &payload, &message);
        let local =
            local_llama_runtime::chat_with_selected_model(&app, &model, &messages, &payload)
                .await?
                .ok_or_else(|| format!("Selected local model could not be resolved: {model}"))?;
        let citations = citations_from_hits(&hits);
        Ok(json!({
            "answer": local.answer,
            "sources": hits,
            "citations": citations,
            "runtime": "rust-knowledge-core",
            "provider": local.provider,
            "model": local.model,
            "baseUrl": local.base_url
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_chat_model_from_route() {
        let payload = json!({ "aiConfig": { "routes": { "chat": { "model": "tiny.gguf" } } } });
        assert_eq!(selected_chat_model(&payload), "tiny.gguf");
    }

    #[test]
    fn reads_reasoning_effort_from_chat_route() {
        let payload =
            json!({ "aiConfig": { "routes": { "chat": { "reasoningEffort": "high" } } } });
        assert_eq!(
            selected_chat_reasoning_effort(&payload).as_deref(),
            Some("high")
        );
    }

    #[test]
    fn extracts_last_user_message() {
        let payload = json!({ "messages": [{ "role": "user", "content": "first" }, { "role": "user", "content": "second" }] });
        assert_eq!(last_user_message(&payload), "second");
    }

    #[test]
    fn reads_auto_accept_from_payload() {
        let payload = json!({ "autoApproveTools": true });
        assert!(auto_accept_enabled(&payload));
    }

    #[test]
    fn parses_multiple_actions_from_one_block() {
        let (_, actions) = action_block(
            "ok<elephantnote_actions>[{\"action\":\"search_notes\",\"query\":\"iroh\",\"limit\":5},{\"action\":\"search_notes\",\"query\":\"sync\",\"limit\":5}]</elephantnote_actions>",
        );
        assert_eq!(actions.len(), 2);
    }
}

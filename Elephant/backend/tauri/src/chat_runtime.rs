#[cfg(not(mobile))]
pub(crate) mod codex_app_server;

use elephantnote_knowledge_core::{ChatKnowledgeAction, KnowledgeSearchHit, KnowledgeStore};
use serde_json::{json, Value};
use tauri::AppHandle;

#[cfg(not(mobile))]
use crate::local_llama_runtime;
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

fn knowledge_hits(app: &AppHandle, query: &str, limit: usize) -> Vec<KnowledgeSearchHit> {
    let Ok(vault) = crate::vault::config::get_active_vault(app) else {
        return Vec::new();
    };
    let Ok(store) = KnowledgeStore::open(Path::new(&vault.path)) else {
        return Vec::new();
    };
    store.search(query, limit).unwrap_or_default()
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
fn configured_system_prompt(payload: &Value) -> String {
    text(
        ai_config(payload)
            .pointer("/routes/chat")
            .unwrap_or(&Value::Null),
        &["systemPrompt", "system_prompt"],
    )
}

#[cfg(not(mobile))]
fn grounded_messages(
    app: &AppHandle,
    payload: &Value,
    query: &str,
) -> (Vec<Value>, Vec<KnowledgeSearchHit>) {
    let hits = if rag_enabled(payload) {
        knowledge_hits(app, query, 6)
    } else {
        Vec::new()
    };
    let context = hits
        .iter()
        .enumerate()
        .map(|(index, hit)| {
            format!(
                "[{}] {} — {} ({})
{}",
                index + 1,
                hit.title,
                hit.heading,
                hit.relative_path,
                hit.excerpt
            )
        })
        .collect::<Vec<_>>()
        .join(
            "

",
        );
    let access_contract = if !rag_enabled(payload) {
        "La recherche dans les notes est désactivée pour cette requête. Ne prétends pas avoir consulté la vault."
            .to_string()
    } else if hits.is_empty() {
        "Tu peux interroger l’index local ElephantNote, mais aucun passage pertinent n’a été trouvé pour cette requête. Ne dis pas que tu n’as aucun accès aux notes : précise seulement qu’aucun résultat pertinent n’a été récupéré."
            .to_string()
    } else {
        format!(
            "Tu peux consulter les passages de notes indexées fournis ci-dessous. Utilise-les pour les affirmations concernant la vault et cite-les avec [1], [2], etc. Tu n’as pas un accès libre au disque : ton accès est limité à l’index et aux outils ElephantNote. N’affirme jamais que tu n’as aucun accès aux notes lorsque des passages sont présents.

{context}"
        )
    };
    let custom = configured_system_prompt(payload);
    let tools = if tools_enabled(payload) {
        format!(
            "

{}",
            tool_contract()
        )
    } else {
        String::new()
    };
    let system = if custom.is_empty() {
        format!("Tu es l’assistant ElephantNote. Réponds en français par défaut. {access_contract}{tools}")
    } else {
        format!(
            "{custom}

Capacités ElephantNote : {access_contract}{tools}"
        )
    };
    let mut messages = vec![json!({ "role": "system", "content": system })];
    messages.extend(extract_messages(payload));
    (messages, hits)
}

#[cfg(not(mobile))]
fn citations_from_hits(hits: &[KnowledgeSearchHit]) -> Vec<Value> {
    hits.iter()
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
    r#"You have real ElephantNote tools. Never claim that you cannot search notes, create a note, update a note, add/reject a Wiki suggestion, generate a Wiki, or delete a Wiki. Read-only note context is already supplied when relevant. When the user explicitly requests an action, append exactly one machine-readable block after the human answer:
<elephantnote_actions>[{"action":"search_notes","query":"...","limit":10}]</elephantnote_actions>
Supported action names and fields:
- search_notes: query, limit
- create_note: relative_path, title, content
- append_to_note: relative_path, content (omit expected_hash; ElephantNote adds the current hash)
- replace_note: relative_path, content (omit expected_hash)
- replace_note_range: relative_path, start_offset, end_offset, replacement (omit expected_hash)
- add_wiki_suggestion: title, topic, source_paths
- create_wiki: title, topic, source_paths
- reject_wiki_suggestion: topic
- delete_wiki: draft_id
Do not invent successful execution. Mutating actions are shown to the user for approval and only execute after approval. Do not put the action block in Markdown fences."#
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
fn prepare_assistant_actions(app: &AppHandle, actions: Vec<Value>) -> (Vec<Value>, Vec<String>) {
    let mut prepared = Vec::new();
    let mut errors = Vec::new();
    for mut value in actions.into_iter().take(8) {
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
                errors.push(format!("Invalid ElephantNote action: {error}"));
                continue;
            }
        };
        match crate::knowledge_chat_actions::tauri_knowledge_chat_action_prepare(
            app.clone(),
            action,
            rationale,
        ) {
            Ok(result) => match serde_json::to_value(result) {
                Ok(value) => prepared.push(value),
                Err(error) => errors.push(error.to_string()),
            },
            Err(error) => errors.push(error),
        }
    }
    (prepared, errors)
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
        return Ok(
            json!({ "answer": "Écris un message pour démarrer le chat.", "sources": [], "runtime": "rust-knowledge-core", "model": model }),
        );
    }
    if model.trim().is_empty() {
        return Ok(
            json!({ "answer": "Aucun modèle n’est sélectionné pour le rôle Chat.", "sources": [], "runtime": "rust-knowledge-core", "model": model, "warning": "No chat model selected" }),
        );
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
            "You are answering inside ElephantNote. Do not inspect the filesystem or run commands. Use only the conversation and retrieved note context below. Return only the answer.\n\n{}",
            transcript
        );
        let result =
            codex_app_server::chat_with_effort(&app, &model, &prompt, reasoning_effort.as_deref())
                .await?;
        let (answer, raw_actions) = if tools_enabled(&payload) {
            action_block(&result.answer)
        } else {
            (result.answer.clone(), Vec::new())
        };
        let (actions, action_errors) = prepare_assistant_actions(&app, raw_actions);
        let citations = citations_from_hits(&hits);
        return Ok(json!({
            "answer": answer,
            "sources": hits,
            "citations": citations,
            "actions": actions,
            "actionErrors": action_errors,
            "runtime": "codex-app-server",
            "provider": "codex",
            "model": result.model,
            "reasoningEffort": reasoning_effort,
            "threadId": result.thread_id
        }));
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
}

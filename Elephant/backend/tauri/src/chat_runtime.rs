#[cfg(not(mobile))]
pub(crate) mod codex_app_server;

use elephantnote_knowledge_core::{KnowledgeSearchHit, KnowledgeStore};
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

fn with_saved_ai_config(app: &AppHandle, payload: Value) -> Value {
    let mut payload = if payload.is_object() {
        payload
    } else {
        json!({ "message": payload })
    };
    if ai_config(&payload).pointer("/routes/chat").is_none() {
        if let Ok(config) = crate::tauri_extra_commands::load_ai_config(app) {
            if let Some(object) = payload.as_object_mut() {
                object.insert("aiConfig".into(), config);
            }
        }
    }
    payload
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
    let system = if custom.is_empty() {
        format!("Tu es l’assistant ElephantNote. Réponds en français par défaut. {access_contract}")
    } else {
        format!(
            "{custom}

Capacités ElephantNote : {access_contract}"
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
        let citations = citations_from_hits(&hits);
        return Ok(json!({
            "answer": result.answer,
            "sources": hits,
            "citations": citations,
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

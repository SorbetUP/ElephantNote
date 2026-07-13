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

fn selected_chat_model(payload: &Value) -> String {
    let config = payload
        .get("aiConfig")
        .or_else(|| payload.get("config"))
        .unwrap_or(&Value::Null);
    let selection = payload.get("modelSelection").unwrap_or(&Value::Null);
    let config_selection = config
        .pointer("/localModelSelection")
        .unwrap_or(&Value::Null);
    let route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
    [
        text(selection, &["chat"]),
        text(config_selection, &["chat"]),
        text(route, &["model", "modelId", "id"]),
        text(payload, &["model", "modelId", "chatModel"]),
    ]
    .into_iter()
    .find(|value| !value.trim().is_empty())
    .unwrap_or_default()
}

#[cfg(not(mobile))]
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
fn grounded_messages(
    app: &AppHandle,
    payload: &Value,
    query: &str,
) -> (Vec<Value>, Vec<KnowledgeSearchHit>) {
    let hits = knowledge_hits(app, query, 6);
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
    let system = if hits.is_empty() {
        "Tu es l’assistant local d’ElephantNote. Réponds en français par défaut. Aucun passage local n’a été trouvé : ne prétends pas avoir consulté les notes."
      .to_string()
    } else {
        format!("Tu es l’assistant local d’ElephantNote. Utilise les passages locaux ci-dessous pour les affirmations concernant les notes et cite-les avec [1], [2], etc. N’invente aucune source.\n\n{context}")
    };
    let mut messages = vec![json!({ "role": "system", "content": system })];
    messages.extend(extract_messages(payload));
    (messages, hits)
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
    let message = last_user_message(&payload);
    let model = selected_chat_model(&payload);
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
        let _ = app;
        return Err(
            "Bundled local GGUF chat is desktop-only and unavailable on mobile in this build."
                .into(),
        );
    }

    #[cfg(not(mobile))]
    {
        validate_configured_llama_binary(&payload)?;
        let (messages, hits) = grounded_messages(&app, &payload, &message);
        let local =
            local_llama_runtime::chat_with_selected_model(&app, &model, &messages, &payload)
                .await?
                .ok_or_else(|| format!("Selected local model could not be resolved: {model}"))?;
        Ok(json!({
          "answer": local.answer,
          "sources": hits,
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
    fn extracts_last_user_message() {
        let payload = json!({ "messages": [{ "role": "user", "content": "first" }, { "role": "user", "content": "second" }] });
        assert_eq!(last_user_message(&payload), "second");
    }
}

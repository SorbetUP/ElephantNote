use serde_json::{json, Value};
use tauri::AppHandle;

use crate::local_llama_runtime;

type R<T> = Result<T, String>;

fn text(value: &Value, keys: &[&str]) -> String {
  if let Some(raw) = value.as_str() {
    return raw.trim().to_string();
  }
  keys
    .iter()
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
        if role.is_empty() || content.is_empty() { None } else { Some(json!({ "role": role, "content": content })) }
      })
      .collect::<Vec<_>>();
    if !out.is_empty() {
      return out;
    }
  }
  let message = text(payload, &["message", "prompt", "query", "text"]);
  if message.is_empty() { Vec::new() } else { vec![json!({ "role": "user", "content": message })] }
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
  let config = payload.get("aiConfig").or_else(|| payload.get("config")).unwrap_or(&Value::Null);
  let selection = payload.get("modelSelection").unwrap_or(&Value::Null);
  let config_selection = config.pointer("/localModelSelection").unwrap_or(&Value::Null);
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

fn with_system_prompt(payload: &Value) -> Vec<Value> {
  let mut messages = vec![json!({
    "role": "system",
    "content": "Tu es l'assistant local d'ElephantNote. Réponds en français par défaut. Si une question concerne les notes, explique ce que tu peux faire et demande une requête précise si le contexte local n'est pas fourni."
  })];
  messages.extend(extract_messages(payload));
  messages
}

#[tauri::command]
pub async fn tauri_rag_chat(app: AppHandle, payload: Value) -> R<Value> {
  let message = last_user_message(&payload);
  let model = selected_chat_model(&payload);

  eprintln!(
    "[tauri-rag] local GGUF chat request message_len={} selected_chat_model={} mobile={}",
    message.chars().count(),
    if model.is_empty() { "<none>" } else { model.as_str() },
    cfg!(mobile)
  );

  if message.trim().is_empty() {
    return Ok(json!({
      "answer": "Écris un message pour démarrer le chat.",
      "sources": [],
      "runtime": "tauri-rust-local-llama.cpp",
      "provider": "local-llama.cpp",
      "model": model
    }));
  }

  if model.trim().is_empty() {
    let warning = "No local GGUF chat model is selected.";
    eprintln!("[tauri-rag][warn] {warning}");
    return Ok(json!({
      "answer": "Aucun modèle local n’est sélectionné pour le rôle Chat. Sélectionne un modèle GGUF avec le bouton Chat dans la bibliothèque de modèles.",
      "sources": [],
      "runtime": "tauri-rust-local-llama.cpp",
      "provider": "local-llama.cpp",
      "model": model,
      "warning": warning
    }));
  }

  #[cfg(mobile)]
  {
    let _ = app;
    let warning = "Bundled llama.cpp local inference is desktop-only in this build.";
    eprintln!("[tauri-rag][warn] {warning}");
    return Ok(json!({
      "answer": "Le runtime local GGUF embarqué n’est pas disponible sur Android. Utilise un fournisseur externe compatible OpenAI, Ollama/llama.cpp sur une machine du réseau, ou la version desktop macOS/Linux pour l’inférence locale.",
      "sources": [],
      "runtime": "tauri-rust-mobile",
      "provider": "local-llama.cpp",
      "model": model,
      "warning": warning
    }));
  }

  #[cfg(not(mobile))]
  {
    let messages = with_system_prompt(&payload);
    match local_llama_runtime::chat_with_selected_model(&app, &model, &messages, &payload).await {
      Ok(Some(local)) => Ok(json!({
        "answer": local.answer,
        "sources": [],
        "runtime": "tauri-rust-local-llama.cpp",
        "provider": local.provider,
        "model": local.model,
        "baseUrl": local.base_url,
        "selectedLocalModel": model
      })),
      Ok(None) => {
        let warning = "Selected local GGUF model resolved to no model path.";
        eprintln!("[tauri-rag][warn] {warning}");
        Ok(json!({
          "answer": warning,
          "sources": [],
          "runtime": "tauri-rust-local-llama.cpp",
          "provider": "local-llama.cpp",
          "model": model,
          "warning": warning
        }))
      },
      Err(error) => {
        eprintln!("[tauri-rag][warn] local GGUF generation failed: {error}");
        Ok(json!({
          "answer": format!("Le modèle local « {model} » est sélectionné, mais Tauri n’a pas pu lancer ou joindre le runtime llama.cpp embarqué.\n\nDétail technique : {error}"),
          "sources": [],
          "runtime": "tauri-rust-local-llama.cpp",
          "provider": "local-llama.cpp",
          "model": model,
          "warning": error
        }))
      },
    }
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
    let payload = json!({ "messages": [
      { "role": "user", "content": "first" },
      { "role": "assistant", "content": "answer" },
      { "role": "user", "content": "second" }
    ] });
    assert_eq!(last_user_message(&payload), "second");
  }
}

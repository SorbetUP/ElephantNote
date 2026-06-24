use serde_json::{json, Value};
use tauri::AppHandle;

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

fn last_user_message(payload: &Value) -> String {
  if let Some(messages) = payload.get("messages").and_then(Value::as_array) {
    if let Some(message) = messages
      .iter()
      .rev()
      .find(|message| message.get("role").and_then(Value::as_str).unwrap_or("") == "user")
    {
      return text(message, &["content", "text", "message"]);
    }
  }
  text(payload, &["message", "prompt", "query", "text"])
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

fn is_greeting(message: &str) -> bool {
  matches!(
    message.trim().to_lowercase().as_str(),
    "hi" | "hello" | "hey" | "salut" | "bonjour" | "coucou"
  )
}

#[tauri::command]
pub async fn tauri_rag_chat(_app: AppHandle, payload: Value) -> R<Value> {
  let message = last_user_message(&payload);
  let model = selected_chat_model(&payload);

  if message.trim().is_empty() {
    return Ok(json!({
      "answer": "Écris un message pour démarrer le chat.",
      "sources": [],
      "runtime": "tauri-rust-chat",
      "provider": "local-gguf",
      "model": model
    }));
  }

  if is_greeting(&message) {
    return Ok(json!({
      "answer": "Bonjour, je suis prêt. Pose-moi une question sur tes notes ou sur le vault courant.",
      "sources": [],
      "runtime": "tauri-rust-chat",
      "provider": "local-gguf",
      "model": model
    }));
  }

  let answer = if model.trim().is_empty() {
    "Aucun modèle local n’est sélectionné pour le rôle Chat. Sélectionne un modèle GGUF avec le bouton Chat dans la bibliothèque de modèles.".to_string()
  } else {
    format!("Le modèle local « {model} » est sélectionné pour le chat, mais l’inférence GGUF locale côté Tauri n’est pas encore reliée au runtime. La sélection est maintenant bien détectée.")
  };

  Ok(json!({
    "answer": answer,
    "sources": [],
    "runtime": "tauri-rust-chat",
    "provider": "local-gguf",
    "model": model,
    "warning": "Local GGUF inference runner is not wired yet."
  }))
}

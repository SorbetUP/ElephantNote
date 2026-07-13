use serde_json::{json, Value};
use tauri::AppHandle;

mod codex_app_server;

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
    let output = messages
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
    if !output.is_empty() {
      return output;
    }
  }
  let message = text(payload, &["message", "prompt", "query", "text"]);
  if message.is_empty() {
    Vec::new()
  } else {
    vec![json!({ "role": "user", "content": message })]
  }
}

fn ai_config(payload: &Value) -> &Value {
  payload
    .get("aiConfig")
    .or_else(|| payload.get("config"))
    .unwrap_or(&Value::Null)
}

fn chat_route(payload: &Value) -> &Value {
  ai_config(payload).pointer("/routes/chat").unwrap_or(&Value::Null)
}

fn selected_chat_model(payload: &Value) -> String {
  let config = ai_config(payload);
  let route = chat_route(payload);
  [
    text(route, &["model", "modelId", "id"]),
    text(config.pointer("/providers/codex").unwrap_or(&Value::Null), &["model"]),
    text(payload, &["model", "modelId", "chatModel"]),
  ]
  .into_iter()
  .find(|value| !value.is_empty())
  .unwrap_or_default()
}

fn codex_prompt(payload: &Value) -> String {
  if let Some(prompt) = payload.get("prompt").and_then(Value::as_str).filter(|value| !value.trim().is_empty()) {
    return prompt.trim().to_string();
  }
  let system_prompt = text(chat_route(payload), &["systemPrompt"]);
  let mut sections = Vec::new();
  if !system_prompt.is_empty() {
    sections.push(format!("System instructions:\n{system_prompt}"));
  }
  sections.push(
    "You are answering inside Elephant. Do not inspect the filesystem or run commands. Use only the supplied conversation and note context. Return only the answer for the user.".to_string(),
  );
  let transcript = extract_messages(payload)
    .into_iter()
    .map(|message| {
      let role = text(&message, &["role"]);
      let content = text(&message, &["content"]);
      format!("{}:\n{}", role.to_uppercase(), content)
    })
    .collect::<Vec<_>>()
    .join("\n\n");
  sections.push(format!("Conversation and retrieved note context:\n{transcript}"));
  sections.join("\n\n")
}

#[tauri::command]
pub async fn tauri_rag_chat(app: AppHandle, payload: Value) -> R<Value> {
  if payload.get("codexOperation").is_some() {
    return codex_app_server::command(&app, &payload).await;
  }

  let source = text(chat_route(&payload), &["source", "provider"]);
  if !source.is_empty() && source != "codex" {
    return Err(format!(
      "Provider execution is owned by its physical addon package, not the core chat bridge: {source}"
    ));
  }

  let prompt = codex_prompt(&payload);
  if prompt.trim().is_empty() {
    return Err("A Codex prompt is required".to_string());
  }
  let model = selected_chat_model(&payload);
  let result = codex_app_server::chat(&app, &model, &prompt).await?;
  Ok(json!({
    "answer": result.answer,
    "sources": [],
    "runtime": "codex-app-server-migration-bridge",
    "provider": "codex",
    "model": result.model,
    "threadId": result.thread_id
  }))
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn selects_codex_model_from_route() {
    let payload = json!({
      "aiConfig": { "routes": { "chat": { "source": "codex", "model": "gpt-codex" } } }
    });
    assert_eq!(selected_chat_model(&payload), "gpt-codex");
  }

  #[test]
  fn codex_prompt_prefers_explicit_package_prompt() {
    let payload = json!({ "prompt": "Package-owned prompt" });
    assert_eq!(codex_prompt(&payload), "Package-owned prompt");
  }

  #[test]
  fn codex_prompt_contains_system_and_transcript() {
    let payload = json!({
      "aiConfig": { "routes": { "chat": { "source": "codex", "systemPrompt": "Be concise" } } },
      "messages": [{ "role": "user", "content": "Question" }]
    });
    let prompt = codex_prompt(&payload);
    assert!(prompt.contains("Be concise"));
    assert!(prompt.contains("USER:\nQuestion"));
  }
}

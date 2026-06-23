use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde_json::{json, Value};
use std::cmp::Reverse;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::vault_layout;

type R<T> = Result<T, String>;
const CONFIG_FILE: &str = "tauri-vaults.json";
const META_DIR: &str = vault_layout::HIDDEN_ROOT;

#[derive(Clone, Debug)]
struct NoteHit {
  path: String,
  title: String,
  content: String,
  score: i64,
}

#[derive(Clone, Debug)]
struct ChatProvider {
  id: String,
  kind: String,
  base_url: String,
  api_key: String,
  model: String,
  headers: Vec<(String, String)>,
}

fn normalize_relative_path(path: &str) -> String {
  path
    .replace('\\', "/")
    .split('/')
    .filter(|part| !part.is_empty() && *part != "." && *part != "..")
    .collect::<Vec<_>>()
    .join("/")
}

fn config_path(app: &AppHandle) -> R<PathBuf> {
  let dir = app.path().app_config_dir().map_err(|error| error.to_string())?;
  Ok(dir.join(CONFIG_FILE))
}

fn active_vault_root(app: &AppHandle) -> R<String> {
  let raw = fs::read_to_string(config_path(app)?).map_err(|error| error.to_string())?;
  let config: Value = serde_json::from_str(&raw).map_err(|error| error.to_string())?;
  let active_id = config
    .get("activeVaultId")
    .and_then(Value::as_str)
    .ok_or_else(|| "No active vault id.".to_string())?;
  let vaults = config
    .get("vaults")
    .and_then(Value::as_array)
    .ok_or_else(|| "Invalid vault config.".to_string())?;
  vaults
    .iter()
    .find(|vault| vault.get("id").and_then(Value::as_str) == Some(active_id))
    .and_then(|vault| vault.get("path").and_then(Value::as_str))
    .map(str::to_string)
    .ok_or_else(|| "No active ElephantNote vault.".to_string())
}

fn value_text(value: &Value, keys: &[&str]) -> String {
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

fn value_number(value: &Value, keys: &[&str], fallback: usize) -> usize {
  keys
    .iter()
    .find_map(|key| value.get(*key).and_then(Value::as_u64))
    .map(|value| value as usize)
    .unwrap_or(fallback)
}

fn visible_markdown_file(root: &Path, path: &Path) -> bool {
  if !path.is_file() {
    return false;
  }
  if !path
    .file_name()
    .and_then(|name| name.to_str())
    .is_some_and(|name| name.to_lowercase().ends_with(".md"))
  {
    return false;
  }
  path
    .strip_prefix(root)
    .ok()
    .map(|relative| {
      !relative.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        name == META_DIR || name == ".git" || name == "node_modules" || name.starts_with('.')
      })
    })
    .unwrap_or(false)
}

fn scan_markdown(root: &Path, current: &Path, out: &mut Vec<NoteHit>) -> R<()> {
  if !current.exists() {
    return Ok(());
  }
  for item in fs::read_dir(current).map_err(|error| error.to_string())? {
    let item = item.map_err(|error| error.to_string())?;
    let path = item.path();
    let name = item.file_name().to_string_lossy().to_string();
    if name == META_DIR || name == ".git" || name == "node_modules" || name.starts_with('.') {
      continue;
    }
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if metadata.is_dir() {
      scan_markdown(root, &path, out)?;
    } else if visible_markdown_file(root, &path) {
      let content = fs::read_to_string(&path).unwrap_or_default();
      let relative = path
        .strip_prefix(root)
        .unwrap_or(&path)
        .to_string_lossy()
        .replace('\\', "/");
      let title = title_from_markdown(&relative, &content);
      out.push(NoteHit { path: relative, title, content, score: 0 });
    }
  }
  Ok(())
}

fn title_from_markdown(path: &str, content: &str) -> String {
  content
    .lines()
    .find_map(|line| line.trim().strip_prefix("# ").map(str::trim).filter(|value| !value.is_empty()))
    .map(str::to_string)
    .unwrap_or_else(|| {
      path
        .rsplit('/')
        .next()
        .unwrap_or(path)
        .trim_end_matches(".md")
        .replace(['_', '-'], " ")
    })
}

fn terms(query: &str) -> Vec<String> {
  let stop = [
    "the", "and", "for", "with", "that", "this", "from", "dans", "avec", "pour", "des", "les", "une", "est", "pas", "que", "qui", "quoi", "comment",
  ]
  .into_iter()
  .collect::<HashSet<_>>();
  query
    .split(|ch: char| !ch.is_alphanumeric())
    .map(str::trim)
    .filter(|word| word.len() >= 2)
    .map(|word| word.to_lowercase())
    .filter(|word| !stop.contains(word.as_str()))
    .collect::<HashSet<_>>()
    .into_iter()
    .collect()
}

fn score_note(note: &NoteHit, query: &str, terms: &[String]) -> i64 {
  let haystack = format!("{}\n{}\n{}", note.path, note.title, note.content).to_lowercase();
  let query = query.to_lowercase();
  let mut score = 0_i64;
  if !query.trim().is_empty() && haystack.contains(query.trim()) {
    score += 100;
  }
  for term in terms {
    let title_count = note.title.to_lowercase().matches(term).count() as i64;
    let path_count = note.path.to_lowercase().matches(term).count() as i64;
    let body_count = note.content.to_lowercase().matches(term).count() as i64;
    score += title_count * 20 + path_count * 12 + body_count.min(20);
  }
  score
}

fn ranked_notes(root: &Path, query: &str, limit: usize) -> R<Vec<NoteHit>> {
  let mut notes = Vec::new();
  scan_markdown(root, root, &mut notes)?;
  let terms = terms(query);
  for note in &mut notes {
    note.score = score_note(note, query, &terms);
  }
  notes.sort_by_key(|note| (Reverse(note.score), note.path.clone()));
  let mut ranked = notes
    .into_iter()
    .filter(|note| note.score > 0)
    .take(limit)
    .collect::<Vec<_>>();
  if ranked.is_empty() {
    let mut all = Vec::new();
    scan_markdown(root, root, &mut all)?;
    all.sort_by_key(|note| note.path.clone());
    ranked = all.into_iter().take(limit).collect();
  }
  Ok(ranked)
}

fn compact_text(text: &str, max_chars: usize) -> String {
  let cleaned = text
    .lines()
    .map(str::trim)
    .filter(|line| !line.is_empty() && !line.starts_with("---"))
    .collect::<Vec<_>>()
    .join(" ")
    .split_whitespace()
    .collect::<Vec<_>>()
    .join(" ");
  if cleaned.chars().count() <= max_chars {
    cleaned
  } else {
    format!("{}…", cleaned.chars().take(max_chars).collect::<String>())
  }
}

fn source_value(note: &NoteHit) -> Value {
  json!({
    "path": note.path,
    "title": note.title,
    "score": note.score,
    "snippet": compact_text(&note.content, 500)
  })
}

fn collect_context(notes: &[NoteHit]) -> String {
  notes
    .iter()
    .enumerate()
    .map(|(index, note)| {
      format!(
        "[Source {}] {} ({})\n{}",
        index + 1,
        note.title,
        note.path,
        compact_text(&note.content, 1400)
      )
    })
    .collect::<Vec<_>>()
    .join("\n\n")
}

fn extract_messages(payload: &Value) -> Vec<Value> {
  if let Some(messages) = payload.get("messages").and_then(Value::as_array) {
    let normalized = messages
      .iter()
      .filter_map(|message| {
        let role = value_text(message, &["role"]);
        let content = value_text(message, &["content", "text", "message"]);
        if role.is_empty() || content.is_empty() {
          None
        } else {
          Some(json!({ "role": role, "content": content }))
        }
      })
      .collect::<Vec<_>>();
    if !normalized.is_empty() {
      return normalized;
    }
  }
  let message = value_text(payload, &["message", "prompt", "query", "text"]);
  if message.is_empty() {
    Vec::new()
  } else {
    vec![json!({ "role": "user", "content": message })]
  }
}

fn last_user_message(messages: &[Value]) -> String {
  messages
    .iter()
    .rev()
    .find(|message| message.get("role").and_then(Value::as_str).unwrap_or("") == "user")
    .map(|message| value_text(message, &["content", "text", "message"]))
    .unwrap_or_default()
}

fn provider_array(config: &Value) -> Vec<Value> {
  if let Some(list) = config.pointer("/providers/list").and_then(Value::as_array) {
    return list.clone();
  }
  if let Some(list) = config.get("providers").and_then(Value::as_array) {
    return list.clone();
  }
  if let Some(object) = config.get("providers").and_then(Value::as_object) {
    return object
      .iter()
      .filter(|(key, value)| *key != "codex" && value.is_object())
      .map(|(key, value)| {
        let mut next = value.clone();
        if let Some(map) = next.as_object_mut() {
          map.entry("id".to_string()).or_insert_with(|| json!(key));
        }
        next
      })
      .collect();
  }
  Vec::new()
}

fn selected_provider_id(config: &Value, payload: &Value) -> String {
  [
    value_text(payload, &["providerId", "provider"]),
    value_text(config.pointer("/routes/chat").unwrap_or(&Value::Null), &["providerId", "provider", "id"]),
    value_text(config, &["defaultProvider", "providerId", "provider"]),
  ]
  .into_iter()
  .find(|value| !value.is_empty())
  .unwrap_or_default()
}

fn selected_model(config: &Value, payload: &Value, provider: &Value) -> String {
  let route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
  [
    value_text(payload, &["model", "modelId"]),
    value_text(route, &["model", "modelId", "id"]),
    value_text(provider, &["model", "modelId", "defaultModel", "chatModel"]),
    value_text(config.pointer("/localModelSelection").unwrap_or(&Value::Null), &["chat"]),
  ]
  .into_iter()
  .find(|value| !value.is_empty())
  .unwrap_or_else(|| "gpt-4o-mini".to_string())
}

fn normalize_base_url(base_url: &str, provider_id: &str, api_key: &str) -> String {
  let mut base = base_url.trim().trim_end_matches('/').to_string();
  if base.is_empty() && !api_key.is_empty() {
    let id = provider_id.to_lowercase();
    base = if id.contains("openrouter") {
      "https://openrouter.ai/api/v1".to_string()
    } else if id.contains("ollama") {
      "http://127.0.0.1:11434".to_string()
    } else {
      "https://api.openai.com/v1".to_string()
    };
  }
  if base.ends_with("/chat/completions") {
    base = base.trim_end_matches("/chat/completions").to_string();
  }
  base
}

fn provider_headers(provider: &Value) -> Vec<(String, String)> {
  provider
    .get("headers")
    .and_then(Value::as_object)
    .map(|headers| {
      headers
        .iter()
        .filter_map(|(key, value)| value.as_str().map(|text| (key.clone(), text.to_string())))
        .collect::<Vec<_>>()
    })
    .unwrap_or_default()
}

fn choose_provider(config: &Value, payload: &Value) -> Option<ChatProvider> {
  let providers = provider_array(config);
  let selected_id = selected_provider_id(config, payload);
  let candidate = if !selected_id.is_empty() {
    providers.iter().find(|provider| {
      let id = value_text(provider, &["id", "name", "provider"]);
      id == selected_id
    })
  } else {
    providers.iter().find(|provider| {
      let base = value_text(provider, &["baseUrl", "baseURL", "endpoint", "url"]);
      let kind = value_text(provider, &["type", "kind", "provider"]);
      !base.is_empty() || ["openai", "openrouter", "ollama"].iter().any(|needle| kind.to_lowercase().contains(needle))
    })
  }?;
  let id = value_text(candidate, &["id", "name", "provider"]);
  let kind = value_text(candidate, &["type", "kind", "provider"]);
  let api_key = value_text(candidate, &["apiKey", "api_key", "key", "token"]);
  let base_url = normalize_base_url(&value_text(candidate, &["baseUrl", "baseURL", "endpoint", "url"]), &id, &api_key);
  let model = selected_model(config, payload, candidate);
  if base_url.is_empty() {
    return None;
  }
  Some(ChatProvider { id, kind, base_url, api_key, model, headers: provider_headers(candidate) })
}

fn build_prompt_messages(payload: &Value, user_messages: &[Value], notes: &[NoteHit]) -> Vec<Value> {
  let context = collect_context(notes);
  let system = value_text(payload, &["system", "systemPrompt"]);
  let default_system = "Tu es l'assistant local d'ElephantNote. Réponds en français par défaut. Utilise le contexte de notes fourni quand il est pertinent. Cite les chemins de notes utiles entre parenthèses. Si le contexte ne suffit pas, dis clairement ce qui manque.";
  let mut messages = vec![json!({
    "role": "system",
    "content": if system.is_empty() { default_system.to_string() } else { system }
  })];
  if !context.is_empty() {
    messages.push(json!({
      "role": "system",
      "content": format!("Contexte local extrait du vault ElephantNote:\n\n{context}")
    }));
  }
  messages.extend(user_messages.iter().cloned());
  messages
}

fn headers_for(provider: &ChatProvider) -> R<HeaderMap> {
  let mut headers = HeaderMap::new();
  headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
  if !provider.api_key.is_empty() {
    let value = HeaderValue::from_str(&format!("Bearer {}", provider.api_key)).map_err(|error| error.to_string())?;
    headers.insert(AUTHORIZATION, value);
  }
  for (key, value) in &provider.headers {
    if let (Ok(name), Ok(header_value)) = (HeaderName::from_bytes(key.as_bytes()), HeaderValue::from_str(value)) {
      headers.insert(name, header_value);
    }
  }
  Ok(headers)
}

async fn call_openai_compatible(provider: &ChatProvider, messages: &[Value], payload: &Value) -> R<String> {
  let url = format!("{}/chat/completions", provider.base_url.trim_end_matches('/'));
  let temperature = payload.get("temperature").and_then(Value::as_f64).unwrap_or(0.2);
  let max_tokens = payload.get("maxTokens").or_else(|| payload.get("max_tokens")).and_then(Value::as_u64).unwrap_or(900);
  let body = json!({
    "model": provider.model,
    "messages": messages,
    "temperature": temperature,
    "max_tokens": max_tokens
  });
  let response = reqwest::Client::new()
    .post(url)
    .headers(headers_for(provider)?)
    .json(&body)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
  if !status.is_success() {
    return Err(value_text(&data, &["error", "message"]).if_empty(format!("Provider returned HTTP {status}.")));
  }
  let answer = data
    .pointer("/choices/0/message/content")
    .and_then(Value::as_str)
    .or_else(|| data.pointer("/choices/0/text").and_then(Value::as_str))
    .unwrap_or("")
    .trim()
    .to_string();
  if answer.is_empty() {
    Err("Provider returned an empty answer.".to_string())
  } else {
    Ok(answer)
  }
}

async fn call_ollama(provider: &ChatProvider, messages: &[Value]) -> R<String> {
  let url = format!("{}/api/chat", provider.base_url.trim_end_matches('/'));
  let body = json!({ "model": provider.model, "messages": messages, "stream": false });
  let response = reqwest::Client::new()
    .post(url)
    .headers(headers_for(provider)?)
    .json(&body)
    .send()
    .await
    .map_err(|error| error.to_string())?;
  let status = response.status();
  let data = response.json::<Value>().await.unwrap_or_else(|_| json!({}));
  if !status.is_success() {
    return Err(value_text(&data, &["error", "message"]).if_empty(format!("Ollama returned HTTP {status}.")));
  }
  let answer = data
    .pointer("/message/content")
    .and_then(Value::as_str)
    .unwrap_or("")
    .trim()
    .to_string();
  if answer.is_empty() {
    Err("Ollama returned an empty answer.".to_string())
  } else {
    Ok(answer)
  }
}

trait IfEmpty {
  fn if_empty(self, fallback: String) -> String;
}

impl IfEmpty for String {
  fn if_empty(self, fallback: String) -> String {
    if self.trim().is_empty() { fallback } else { self }
  }
}

fn fallback_answer(message: &str, sources: &[Value], reason: &str) -> String {
  if sources.is_empty() {
    return format!(
      "Je n'ai pas encore de provider de chat utilisable et je n'ai trouvé aucune note locale pertinente. Détail technique : {reason}"
    );
  }
  let source_lines = sources
    .iter()
    .take(5)
    .map(|source| {
      let title = value_text(source, &["title"]);
      let path = value_text(source, &["path"]);
      let snippet = compact_text(&value_text(source, &["snippet"]), 180);
      format!("- {title} ({path}) : {snippet}")
    })
    .collect::<Vec<_>>()
    .join("\n");
  format!(
    "J'ai trouvé des notes locales pertinentes pour « {message} », mais aucun provider de chat n'est encore configuré ou joignable côté Tauri.\n\nSources trouvées :\n{source_lines}\n\nDétail technique : {reason}"
  )
}

#[tauri::command]
pub async fn tauri_rag_chat(app: AppHandle, payload: Value) -> R<Value> {
  let root = active_vault_root(&app)?;
  let messages = extract_messages(&payload);
  let message = last_user_message(&messages);
  if message.trim().is_empty() {
    return Ok(json!({ "answer": "Écris un message pour démarrer le chat.", "sources": [], "runtime": "tauri-rust" }));
  }
  let limit = value_number(&payload, &["limit"], 6).clamp(1, 20);
  let notes = ranked_notes(&PathBuf::from(&root), &message, limit)?;
  let sources = notes.iter().map(source_value).collect::<Vec<_>>();
  let ai_config = payload.get("aiConfig").or_else(|| payload.get("config")).cloned().unwrap_or_else(|| json!({}));
  let provider = choose_provider(&ai_config, &payload);
  let prompt_messages = build_prompt_messages(&payload, &messages, &notes);
  if let Some(provider) = provider {
    let provider_kind = provider.kind.to_lowercase();
    let result = if provider_kind.contains("ollama") || provider.base_url.contains("11434") {
      call_ollama(&provider, &prompt_messages).await
    } else {
      call_openai_compatible(&provider, &prompt_messages, &payload).await
    };
    match result {
      Ok(answer) => Ok(json!({
        "answer": answer,
        "sources": sources,
        "runtime": "tauri-rust",
        "provider": provider.id,
        "model": provider.model
      })),
      Err(error) => Ok(json!({
        "answer": fallback_answer(&message, &sources, &error),
        "sources": sources,
        "runtime": "tauri-rust",
        "provider": provider.id,
        "model": provider.model,
        "warning": error
      })),
    }
  } else {
    Ok(json!({
      "answer": fallback_answer(&message, &sources, "No OpenAI-compatible or Ollama provider found in the AI settings."),
      "sources": sources,
      "runtime": "tauri-rust",
      "warning": "No chat provider configured."
    }))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn ranks_notes_by_query_terms() {
    let note = NoteHit { path: "A.md".to_string(), title: "Kernel model".to_string(), content: "xgboost kernel phase".to_string(), score: 0 };
    assert!(score_note(&note, "kernel phase", &terms("kernel phase")) > 0);
  }

  #[test]
  fn extracts_message_from_payload() {
    let messages = extract_messages(&json!({ "message": "hello" }));
    assert_eq!(last_user_message(&messages), "hello");
  }
}

use serde_json::{json, Value};
use std::cmp::Reverse;
use std::collections::HashSet;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager};

use crate::vault_layout;

type R<T> = Result<T, String>;

const CONFIG_FILE: &str = "tauri-vaults.json";
const MODEL_PROVIDER: &str = "node-llama-cpp";
const META_DIR: &str = vault_layout::HIDDEN_ROOT;

#[derive(Clone, Debug)]
struct NoteHit {
  path: String,
  title: String,
  content: String,
  score: i64,
}

#[derive(Clone, Debug)]
struct LocalChatModel {
  id: String,
  name: String,
  path: PathBuf,
}

fn now() -> String {
  std::time::SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|duration| duration.as_secs().to_string())
    .unwrap_or_else(|_| "0".to_string())
}

fn home_dir() -> PathBuf {
  env::var_os("HOME")
    .or_else(|| env::var_os("USERPROFILE"))
    .map(PathBuf::from)
    .unwrap_or_else(env::temp_dir)
}

fn model_dir() -> PathBuf {
  env::var_os("ELEPHANTNOTE_MODEL_DIR")
    .map(PathBuf::from)
    .unwrap_or_else(|| home_dir().join(".elephantnote").join("models").join(MODEL_PROVIDER))
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

fn number(value: &Value, keys: &[&str], fallback: usize) -> usize {
  keys
    .iter()
    .find_map(|key| value.get(*key).and_then(Value::as_u64))
    .map(|value| value as usize)
    .unwrap_or(fallback)
}

fn normalize_path(path: &str) -> String {
  path.replace('\\', "/")
    .split('/')
    .filter(|part| !part.is_empty() && *part != "." && *part != "..")
    .collect::<Vec<_>>()
    .join("/")
}

fn file_name(path: &Path) -> String {
  path.file_name().and_then(|name| name.to_str()).unwrap_or("").to_string()
}

fn read_json(path: &Path) -> Option<Value> {
  fs::read_to_string(path).ok().and_then(|raw| serde_json::from_str(&raw).ok())
}

fn manifest_path(model_path: &Path) -> PathBuf {
  let mut out = model_path.as_os_str().to_os_string();
  out.push(".model.json");
  PathBuf::from(out)
}

fn selected_local_chat_id(payload: &Value) -> String {
  let config = payload.get("aiConfig").or_else(|| payload.get("config")).unwrap_or(&Value::Null);
  let selection = payload.get("modelSelection").unwrap_or(&Value::Null);
  let config_selection = config.pointer("/localModelSelection").unwrap_or(&Value::Null);
  let route = config.pointer("/routes/chat").unwrap_or(&Value::Null);
  [
    text(selection, &["chat"]),
    text(payload, &["model", "modelId", "chatModel", "chat"]),
    text(config_selection, &["chat"]),
    text(route, &["model", "modelId", "id"]),
  ]
  .into_iter()
  .find(|value| !value.trim().is_empty())
  .unwrap_or_default()
}

fn model_aliases(path: &Path) -> HashSet<String> {
  let manifest = read_json(&manifest_path(path)).unwrap_or_else(|| json!({}));
  let filename = file_name(path);
  let stem = path.file_stem().and_then(|stem| stem.to_str()).unwrap_or("").to_string();
  let path_text = path.to_string_lossy().to_string();
  [
    filename.clone(),
    stem,
    path_text.clone(),
    text(&manifest, &["id"]),
    text(&manifest, &["name"]),
    text(&manifest, &["model"]),
    text(&manifest, &["modelId"]),
    text(&manifest, &["fileName", "filename"]),
    text(&manifest, &["repoId", "originalRepoId"]),
    text(&manifest, &["path", "modelPath"]),
  ]
  .into_iter()
  .filter(|value| !value.trim().is_empty())
  .flat_map(|value| {
    let lower = value.to_lowercase();
    let basename = value.replace('\\', "/").rsplit('/').next().unwrap_or(&value).to_string().to_lowercase();
    [lower, basename]
  })
  .collect()
}

fn resolve_local_chat_model(selected: &str) -> Option<LocalChatModel> {
  let selected = selected.trim();
  if selected.is_empty() {
    return None;
  }
  let direct = PathBuf::from(selected);
  if direct.is_absolute() && direct.exists() {
    return Some(LocalChatModel { id: selected.to_string(), name: file_name(&direct), path: direct });
  }
  let selected_key = selected.to_lowercase();
  let root = model_dir();
  let entries = fs::read_dir(root).ok()?;
  for entry in entries.flatten() {
    let path = entry.path();
    if !path.is_file() || !file_name(&path).to_lowercase().ends_with(".gguf") {
      continue;
    }
    let aliases = model_aliases(&path);
    if aliases.contains(&selected_key) {
      let name = read_json(&manifest_path(&path))
        .map(|manifest| text(&manifest, &["name", "id", "fileName", "filename"]))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| file_name(&path));
      return Some(LocalChatModel { id: selected.to_string(), name, path });
    }
  }
  None
}

fn visible_markdown_file(root: &Path, path: &Path) -> bool {
  path.is_file()
    && file_name(path).to_lowercase().ends_with(".md")
    && path.strip_prefix(root).ok().map(|relative| {
      !relative.components().any(|component| {
        let name = component.as_os_str().to_string_lossy();
        name == META_DIR || name == ".git" || name == "node_modules" || name.starts_with('.')
      })
    }).unwrap_or(false)
}

fn scan_notes(root: &Path, current: &Path, out: &mut Vec<NoteHit>) -> R<()> {
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
      scan_notes(root, &path, out)?;
    } else if visible_markdown_file(root, &path) {
      let content = fs::read_to_string(&path).unwrap_or_default();
      let relative = normalize_path(&path.strip_prefix(root).unwrap_or(&path).to_string_lossy());
      let title = content
        .lines()
        .find_map(|line| line.trim().strip_prefix("# ").map(str::trim).filter(|value| !value.is_empty()))
        .map(str::to_string)
        .unwrap_or_else(|| file_name(&path).trim_end_matches(".md").replace(['_', '-'], " "));
      out.push(NoteHit { path: relative, title, content, score: 0 });
    }
  }
  Ok(())
}

fn terms(query: &str) -> Vec<String> {
  let stop = ["the", "and", "for", "with", "that", "this", "from", "dans", "avec", "pour", "des", "les", "une", "est", "pas", "que", "qui", "quoi", "comment"]
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
    score += note.title.to_lowercase().matches(term).count() as i64 * 20;
    score += note.path.to_lowercase().matches(term).count() as i64 * 12;
    score += (note.content.to_lowercase().matches(term).count() as i64).min(20);
  }
  score
}

fn ranked_notes(root: &Path, query: &str, limit: usize) -> R<Vec<NoteHit>> {
  let mut notes = Vec::new();
  scan_notes(root, root, &mut notes)?;
  let query_terms = terms(query);
  for note in &mut notes {
    note.score = score_note(note, query, &query_terms);
  }
  notes.sort_by_key(|note| (Reverse(note.score), note.path.clone()));
  let ranked = notes.iter().filter(|note| note.score > 0).take(limit).cloned().collect::<Vec<_>>();
  if ranked.is_empty() {
    Ok(notes.into_iter().take(limit).collect())
  } else {
    Ok(ranked)
  }
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
    "snippet": compact_text(&note.content, 420)
  })
}

fn extract_messages(payload: &Value) -> Vec<Value> {
  if let Some(messages) = payload.get("messages").and_then(Value::as_array) {
    let normalized = messages
      .iter()
      .filter_map(|message| {
        let role = text(message, &["role"]);
        let content = text(message, &["content", "text", "message"]);
        if role.is_empty() || content.is_empty() { None } else { Some(json!({ "role": role, "content": content })) }
      })
      .collect::<Vec<_>>();
    if !normalized.is_empty() {
      return normalized;
    }
  }
  let message = text(payload, &["message", "prompt", "query", "text"]);
  if message.is_empty() { Vec::new() } else { vec![json!({ "role": "user", "content": message })] }
}

fn last_user_message(messages: &[Value]) -> String {
  messages
    .iter()
    .rev()
    .find(|message| message.get("role").and_then(Value::as_str).unwrap_or("") == "user")
    .map(|message| text(message, &["content", "text", "message"]))
    .unwrap_or_default()
}

fn context_block(notes: &[NoteHit]) -> String {
  notes
    .iter()
    .enumerate()
    .map(|(index, note)| format!("[{}] {} ({})\n{}", index + 1, note.title, note.path, compact_text(&note.content, 1200)))
    .collect::<Vec<_>>()
    .join("\n\n")
}

fn build_prompt(question: &str, notes: &[NoteHit]) -> String {
  let context = context_block(notes);
  if context.is_empty() {
    format!("Tu es l'assistant local d'ElephantNote. Réponds en français.\n\nQuestion: {question}\n\nRéponse:")
  } else {
    format!("Tu es l'assistant local d'ElephantNote. Réponds en français. Utilise le contexte si utile et cite les chemins de notes.\n\nContexte:\n{context}\n\nQuestion: {question}\n\nRéponse:")
  }
}

fn run_llama_cli(model: &LocalChatModel, prompt: &str, max_tokens: usize) -> R<String> {
  let candidates = ["llama-cli", "llama", "llama.cpp", "main"];
  let mut last_error = String::new();
  for bin in candidates {
    let output = Command::new(bin)
      .arg("-m")
      .arg(&model.path)
      .arg("-p")
      .arg(prompt)
      .arg("-n")
      .arg(max_tokens.to_string())
      .output();
    match output {
      Ok(output) if output.status.success() => {
        let raw = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let answer = raw.strip_prefix(prompt).unwrap_or(&raw).trim().to_string();
        return Ok(if answer.is_empty() { raw } else { answer });
      }
      Ok(output) => {
        last_error = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if last_error.is_empty() {
          last_error = format!("{bin} exited with status {}", output.status);
        }
      }
      Err(error) => {
        last_error = error.to_string();
      }
    }
  }
  Err(format!("Modèle local sélectionné ({}) mais aucun runtime llama.cpp CLI utilisable n'a été trouvé. Installe `llama.cpp` ou bundle `llama-cli` avec Tauri. Dernière erreur: {last_error}", model.name))
}

fn fallback_answer(question: &str, source_count: usize, warning: &str) -> String {
  if source_count == 0 {
    format!("Je n'ai pas pu générer de réponse pour « {question} ». Aucun backend de chat utilisable n'est disponible et aucune note pertinente n'a été trouvée.")
  } else {
    format!("Je n'ai pas pu générer de réponse complète pour « {question} », mais j'ai trouvé {source_count} note(s) pertinente(s).")
  }
  .trim_end_matches('.')
  .to_string()
  + &format!("\n\nDétail: {warning}")
}

#[tauri::command]
pub async fn tauri_rag_chat(app: AppHandle, payload: Value) -> R<Value> {
  let root = active_vault_root(&app)?;
  let messages = extract_messages(&payload);
  let question = last_user_message(&messages);
  if question.trim().is_empty() {
    return Ok(json!({ "answer": "Écris un message pour démarrer le chat.", "sources": [], "runtime": "tauri-rust" }));
  }

  let limit = number(&payload, &["limit"], 6).clamp(1, 20);
  let notes = ranked_notes(&PathBuf::from(&root), &question, limit)?;
  let sources = notes.iter().map(source_value).collect::<Vec<_>>();
  let selected = selected_local_chat_id(&payload);
  let max_tokens = number(&payload, &["maxTokens", "max_tokens"], 512).clamp(64, 4096);

  if let Some(model) = resolve_local_chat_model(&selected) {
    let prompt = build_prompt(&question, &notes);
    match run_llama_cli(&model, &prompt, max_tokens) {
      Ok(answer) => Ok(json!({
        "answer": answer,
        "sources": sources,
        "runtime": "tauri-rust-local",
        "provider": "local-gguf",
        "model": model.id,
        "modelPath": model.path.to_string_lossy(),
        "answeredAt": now()
      })),
      Err(warning) => Ok(json!({
        "answer": fallback_answer(&question, sources.len(), &warning),
        "sources": sources,
        "runtime": "tauri-rust-local",
        "provider": "local-gguf",
        "model": model.id,
        "modelPath": model.path.to_string_lossy(),
        "warning": warning,
        "answeredAt": now()
      })),
    }
  } else {
    let warning = if selected.trim().is_empty() {
      "Aucun modèle local n'est sélectionné pour le rôle Chat.".to_string()
    } else {
      format!("Le modèle local sélectionné pour Chat est introuvable dans {}: {selected}", model_dir().to_string_lossy())
    };
    Ok(json!({
      "answer": fallback_answer(&question, sources.len(), &warning),
      "sources": sources,
      "runtime": "tauri-rust-local",
      "provider": "local-gguf",
      "warning": warning,
      "answeredAt": now()
    }))
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn extracts_message_from_payload() {
    let messages = extract_messages(&json!({ "message": "hello" }));
    assert_eq!(last_user_message(&messages), "hello");
  }

  #[test]
  fn scores_matching_note() {
    let note = NoteHit { path: "note.md".to_string(), title: "Kernel".to_string(), content: "phase kernel model".to_string(), score: 0 };
    assert!(score_note(&note, "kernel", &terms("kernel")) > 0);
  }
}

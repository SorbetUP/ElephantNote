from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def read(path):
    return (ROOT / path).read_text()


def write(path, content):
    (ROOT / path).write_text(content)


def remove_rust_function(text, name):
    match = re.search(rf"(?m)^\s*(?:pub\s+)?(?:async\s+)?fn\s+{re.escape(name)}\s*\(", text)
    if not match:
        return text
    start = text.rfind("\n", 0, match.start()) + 1
    previous = text.rfind("\n", 0, max(0, start - 1)) + 1
    if text[previous:start].strip().startswith("#["):
        start = previous
    brace = text.find("{", match.end())
    if brace < 0:
        raise RuntimeError(f"No body for {name}")
    depth = 0
    in_string = False
    escape = False
    for index in range(brace, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                while end < len(text) and text[end] in " \t\r\n":
                    end += 1
                return text[:start] + text[end:]
    raise RuntimeError(f"Unbalanced body for {name}")


def replace_between(text, start_marker, end_marker, replacement):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]


# Remove old Rust knowledge/search implementations.
for path in [
    "Elephant/backend/tauri/src/embeddings.rs",
    "Elephant/backend/tauri/src/wiki.rs",
    "Elephant/backend/tauri/src/rag_prompt.rs",
    "Elephant/backend/tauri/src/search_logic.rs",
    "Elephant/backend/tauri/src/fts.rs",
]:
    target = ROOT / path
    if target.exists():
        target.unlink()

# Remove duplicate scan/JSON search and legacy wiki list from vault commands.
path = "Elephant/backend/tauri/src/vault/commands.rs"
text = read(path)
text = text.replace("use std::io::Read;\n", "")
text = re.sub(r"(?m)^const SEARCH_[A-Z0-9_]+:.*\n", "", text)
for name in [
    "tauri_wiki_list",
    "tauri_search_query",
    "read_text_prefix",
    "search_excerpt",
    "scan_notes",
    "tauri_search_status",
]:
    text = remove_rust_function(text, name)
write(path, text)

# Remove the second handwritten search index from tauri_extra_commands.
path = "Elephant/backend/tauri/src/tauri_extra_commands.rs"
text = read(path)
text = re.sub(r'(?m)^const SEARCH_INDEX_FILE:.*\n', '', text)
for name in [
    "markdown_title",
    "markdown_excerpt",
    "scan_markdown_notes",
    "extract_wikilinks",
    "build_search_index",
    "tauri_search_rebuild",
    "tauri_search_inspect",
]:
    text = remove_rust_function(text, name)
write(path, text)

# The generic action executor must never claim a Wiki was generated.
path = "Elephant/backend/knowledge-core/src/chat_actions.rs"
text = read(path)
text = re.sub(
    r'''\s*ChatKnowledgeAction::CreateWiki\s*\{.*?\}\s*=>\s*json!\(\{.*?\}\),''',
    '''\n        ChatKnowledgeAction::CreateWiki { .. } => {\n            return Err(\n                "Wiki actions require the cited model-backed Wiki generator.".into(),\n            );\n        }''',
    text,
    count=1,
    flags=re.S,
)
write(path, text)

# New grounded chat: KnowledgeStore FTS only, no embeddings and no legacy RAG prompt.
write("Elephant/backend/tauri/src/chat_runtime.rs", r'''use elephantnote_knowledge_core::{KnowledgeSearchHit, KnowledgeStore};
use serde_json::{json, Value};
use tauri::AppHandle;

#[cfg(not(mobile))]
use std::path::Path;
#[cfg(not(mobile))]
use crate::local_llama_runtime;

type R<T> = Result<T, String>;

fn text(value: &Value, keys: &[&str]) -> String {
  if let Some(raw) = value.as_str() { return raw.trim().to_string(); }
  keys.iter().find_map(|key| value.get(*key).and_then(Value::as_str))
    .map(str::trim).unwrap_or("").to_string()
}

fn extract_messages(payload: &Value) -> Vec<Value> {
  if let Some(messages) = payload.get("messages").and_then(Value::as_array) {
    let out = messages.iter().filter_map(|message| {
      let role = text(message, &["role"]);
      let content = text(message, &["content", "text", "message"]);
      if role.is_empty() || content.is_empty() { None } else { Some(json!({ "role": role, "content": content })) }
    }).collect::<Vec<_>>();
    if !out.is_empty() { return out; }
  }
  let message = text(payload, &["message", "prompt", "query", "text"]);
  if message.is_empty() { Vec::new() } else { vec![json!({ "role": "user", "content": message })] }
}

fn last_user_message(payload: &Value) -> String {
  extract_messages(payload).into_iter().rev()
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
    text(selection, &["chat"]), text(config_selection, &["chat"]),
    text(route, &["model", "modelId", "id"]), text(payload, &["model", "modelId", "chatModel"]),
  ].into_iter().find(|value| !value.trim().is_empty()).unwrap_or_default()
}

fn knowledge_hits(app: &AppHandle, query: &str, limit: usize) -> Vec<KnowledgeSearchHit> {
  let Ok(vault) = crate::vault::config::get_active_vault(app) else { return Vec::new(); };
  let Ok(store) = KnowledgeStore::open(Path::new(&vault.path)) else { return Vec::new(); };
  store.search(query, limit).unwrap_or_default()
}

#[cfg(not(mobile))]
fn grounded_messages(app: &AppHandle, payload: &Value, query: &str) -> (Vec<Value>, Vec<KnowledgeSearchHit>) {
  let hits = knowledge_hits(app, query, 6);
  let context = hits.iter().enumerate().map(|(index, hit)| {
    format!("[{}] {} — {} ({})\n{}", index + 1, hit.title, hit.heading, hit.relative_path, hit.excerpt)
  }).collect::<Vec<_>>().join("\n\n");
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
  payload.get("localRuntime").or_else(|| payload.pointer("/aiConfig/localRuntime"))
    .or_else(|| payload.pointer("/config/localRuntime")).unwrap_or(&Value::Null)
}

#[cfg(not(mobile))]
fn configured_server_path(payload: &Value) -> String {
  let runtime = local_runtime_config(payload);
  let direct = text(payload, &["llamaServerPath", "serverPath", "llamaBinary"]);
  if direct.is_empty() { text(runtime, &["llamaServerPath", "serverPath", "llamaBinary", "path"]) } else { direct }
}

#[cfg(not(mobile))]
fn validate_configured_llama_binary(payload: &Value) -> R<()> {
  let configured = configured_server_path(payload);
  if configured.trim().is_empty() { return Ok(()); }
  let basename = Path::new(&configured).file_name().and_then(|name| name.to_str()).unwrap_or(configured.as_str());
  let allowed = ["llama-server", "llama-server.exe", "llama.cpp-server", "llama-cpp-server"];
  if !allowed.contains(&basename) { return Err(format!("Refusing unsupported llama runtime binary: {basename}.")); }
  let path = Path::new(&configured);
  if path.is_absolute() && !path.is_file() { return Err(format!("Configured llama runtime path does not exist: {configured}")); }
  Ok(())
}

#[tauri::command]
pub async fn tauri_knowledge_chat(app: AppHandle, payload: Value) -> R<Value> {
  let message = last_user_message(&payload);
  let model = selected_chat_model(&payload);
  if message.trim().is_empty() {
    return Ok(json!({ "answer": "Écris un message pour démarrer le chat.", "sources": [], "runtime": "rust-knowledge-core", "model": model }));
  }
  if model.trim().is_empty() {
    return Ok(json!({ "answer": "Aucun modèle n’est sélectionné pour le rôle Chat.", "sources": [], "runtime": "rust-knowledge-core", "model": model, "warning": "No chat model selected" }));
  }

  #[cfg(mobile)]
  {
    let _ = app;
    return Err("Bundled local GGUF chat is unavailable on mobile in this build.".into());
  }

  #[cfg(not(mobile))]
  {
    validate_configured_llama_binary(&payload)?;
    let (messages, hits) = grounded_messages(&app, &payload, &message);
    let local = local_llama_runtime::chat_with_selected_model(&app, &model, &messages, &payload)
      .await?.ok_or_else(|| format!("Selected local model could not be resolved: {model}"))?;
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
''')

# Register only knowledge-core commands.
path = "Elephant/backend/tauri/src/lib_min.rs"
text = read(path)
for line in [
    "pub mod search_logic;\n", "pub mod embeddings;\n", "pub mod wiki;\n", "pub mod rag_prompt;\n", "pub mod fts;\n",
]:
    text = text.replace(line, "")
if "pub mod knowledge_wikis;" not in text:
    text = text.replace("pub mod knowledge_chat_actions;", "pub mod knowledge_chat_actions;\npub mod knowledge_wikis;")
for command in [
    "embeddings::tauri_embeddings_embed", "embeddings::tauri_embeddings_store", "embeddings::tauri_embeddings_search",
    "embeddings::tauri_embeddings_count", "embeddings::tauri_embeddings_clear_vault", "wiki::tauri_wiki_proposals",
    "rag_prompt::tauri_rag_build_prompt", "vault::commands::tauri_wiki_list", "vault::commands::tauri_search_query",
    "vault::commands::tauri_search_status", "tauri_extra_commands::tauri_search_inspect",
    "tauri_extra_commands::tauri_search_rebuild", "chat_runtime::tauri_rag_chat",
]:
    text = re.sub(rf"(?m)^\s*{re.escape(command)},\s*\n", "", text)
if "knowledge_wikis::tauri_knowledge_wiki_generate" not in text:
    anchor = "      knowledge_chat_actions::tauri_knowledge_chat_action_execute,\n"
    addition = anchor + "      knowledge_wikis::tauri_knowledge_wiki_generate,\n      knowledge_wikis::tauri_knowledge_wiki_get,\n      knowledge_wikis::tauri_knowledge_wikis_list,\n      knowledge_wikis::tauri_knowledge_wiki_accept,\n      knowledge_wikis::tauri_knowledge_wiki_reject,\n"
    text = text.replace(anchor, addition)
text = text.replace("      model_library::tauri_models_refresh_index,\n", "      model_library::tauri_models_refresh_index,\n      chat_runtime::tauri_knowledge_chat,\n")
write(path, text)

# Complete frontend knowledge client.
write("Elephant/frontend/src/renderer/src/platform/knowledgeRuntimeClient.js", r'''const getCore = (target = globalThis) => target?.__TAURI__?.core || null
const invoke = (command, payload = {}, target = globalThis) => {
  const core = getCore(target)
  if (!core?.invoke) throw new Error(`Tauri knowledge command API is unavailable for ${command}`)
  return core.invoke(command, payload)
}

export const knowledgeRuntimeClient = Object.freeze({
  rebuild: () => invoke('tauri_knowledge_rebuild'),
  status: () => invoke('tauri_knowledge_status'),
  search: (query, limit = 20) => invoke('tauri_knowledge_search', { query, limit }),
  inspectNote: (relativePath) => invoke('tauri_knowledge_inspect_note', { relativePath }),
  graph: ({ includeSuggestions = false } = {}) => invoke('tauri_knowledge_graph', { includeSuggestions }),
  chat: (payload = {}) => invoke('tauri_knowledge_chat', { payload }),
  listTags: () => invoke('tauri_knowledge_tags_list'),
  generateTagging: (relativePath, payload = {}, maxTags = 8) => invoke('tauri_knowledge_tagging_generate', { relativePath, payload, maxTags }),
  validateChatAction: (action) => invoke('tauri_knowledge_validate_chat_action', { action }),
  prepareChatAction: (action, rationale = '') => invoke('tauri_knowledge_chat_action_prepare', { action, rationale }),
  getChatAction: (proposalId) => invoke('tauri_knowledge_chat_action_get', { proposalId }),
  listChatActions: ({ status = null, limit = 100 } = {}) => invoke('tauri_knowledge_chat_actions_list', { status, limit }),
  approveChatAction: (proposalId) => invoke('tauri_knowledge_chat_action_approve', { proposalId }),
  rejectChatAction: (proposalId) => invoke('tauri_knowledge_chat_action_reject', { proposalId }),
  executeChatAction: (proposalId) => invoke('tauri_knowledge_chat_action_execute', { proposalId }),
  generateWiki: ({ topic, title = null, sourcePaths = [], payload = {}, maxDocuments = 12, maxChunks = 64, maxSections = 10 }) =>
    invoke('tauri_knowledge_wiki_generate', { topic, title, sourcePaths, payload, maxDocuments, maxChunks, maxSections }),
  getWikiDraft: (draftId) => invoke('tauri_knowledge_wiki_get', { draftId }),
  listWikiDrafts: ({ status = null, limit = 100 } = {}) => invoke('tauri_knowledge_wikis_list', { status, limit }),
  acceptWikiDraft: (draftId) => invoke('tauri_knowledge_wiki_accept', { draftId }),
  rejectWikiDraft: (draftId) => invoke('tauri_knowledge_wiki_reject', { draftId }),
  listRelations: ({ status = null, limit = 1000 } = {}) => invoke('tauri_knowledge_relations_list', { status, limit }),
  relationsForNode: (node, includeRejected = false) => invoke('tauri_knowledge_relations_for_node', { node, includeRejected }),
  setRelationStatus: (relationId, status) => invoke('tauri_knowledge_relation_status_set', { relationId, status })
})
export const isKnowledgeRuntimeAvailable = (target = globalThis) => !!getCore(target)?.invoke
''')

# No fallback bridge: all search/wiki/chat surfaces point at knowledge-core.
write("Elephant/frontend/src/renderer/src/platform/installKnowledgeRuntimeBridge.js", r'''import { knowledgeRuntimeClient, isKnowledgeRuntimeAvailable } from './knowledgeRuntimeClient'

const graphDocuments = (graph) => (Array.isArray(graph?.nodes) ? graph.nodes : []).map((node) => ({
  relativePath: node.relativePath || node.path || node.id || '',
  path: node.path || node.relativePath || node.id || '',
  title: node.title || node.id || 'Untitled',
  excerpt: node.summary || '',
  tags: Array.isArray(node.tags) ? node.tags : [],
  chunkCount: Number(node.chunkCount || 0)
}))

const inspect = async () => {
  const [graph, status] = await Promise.all([
    knowledgeRuntimeClient.graph({ includeSuggestions: false }),
    knowledgeRuntimeClient.status()
  ])
  return {
    indexPath: status?.databasePath || '',
    documents: graphDocuments(graph),
    folders: [],
    semanticLinks: Array.isArray(graph?.edges) ? graph.edges : [],
    graph,
    generatedAt: new Date().toISOString()
  }
}

export const installKnowledgeRuntimeBridge = (target = globalThis) => {
  const bridge = target?.elephantnote
  if (!bridge || !isKnowledgeRuntimeAvailable(target)) return false
  bridge.knowledge = {
    runtime: 'rust-knowledge-core',
    rebuild: knowledgeRuntimeClient.rebuild,
    status: knowledgeRuntimeClient.status,
    search: knowledgeRuntimeClient.search,
    inspectNote: knowledgeRuntimeClient.inspectNote,
    graph: knowledgeRuntimeClient.graph,
    chat: knowledgeRuntimeClient.chat,
    listTags: knowledgeRuntimeClient.listTags,
    generateTagging: knowledgeRuntimeClient.generateTagging,
    validateChatAction: knowledgeRuntimeClient.validateChatAction,
    chatActions: {
      prepare: knowledgeRuntimeClient.prepareChatAction,
      get: knowledgeRuntimeClient.getChatAction,
      list: knowledgeRuntimeClient.listChatActions,
      approve: knowledgeRuntimeClient.approveChatAction,
      reject: knowledgeRuntimeClient.rejectChatAction,
      execute: knowledgeRuntimeClient.executeChatAction
    },
    wikis: {
      generate: knowledgeRuntimeClient.generateWiki,
      get: knowledgeRuntimeClient.getWikiDraft,
      list: knowledgeRuntimeClient.listWikiDrafts,
      accept: knowledgeRuntimeClient.acceptWikiDraft,
      reject: knowledgeRuntimeClient.rejectWikiDraft
    },
    listRelations: knowledgeRuntimeClient.listRelations,
    relationsForNode: knowledgeRuntimeClient.relationsForNode,
    setRelationStatus: knowledgeRuntimeClient.setRelationStatus
  }
  bridge.search = {
    initVault: async () => knowledgeRuntimeClient.rebuild(),
    query: ({ query = '', q = '', limit = 20 } = {}) => knowledgeRuntimeClient.search(query || q, limit),
    status: async () => ({ enabled: true, runtime: 'rust-knowledge-core', ...(await knowledgeRuntimeClient.status()) }),
    rebuild: knowledgeRuntimeClient.rebuild,
    inspect
  }
  bridge.wiki = {
    list: async () => ({ records: await knowledgeRuntimeClient.listWikiDrafts({ limit: 500 }) }),
    propose: knowledgeRuntimeClient.generateWiki,
    accept: ({ id, draftId } = {}) => knowledgeRuntimeClient.acceptWikiDraft(draftId || id),
    dismiss: ({ id, draftId } = {}) => knowledgeRuntimeClient.rejectWikiDraft(draftId || id),
    sourceInfo: ({ id, draftId } = {}) => knowledgeRuntimeClient.getWikiDraft(draftId || id),
    context: async () => ({ records: await knowledgeRuntimeClient.listWikiDrafts({ limit: 500 }), graph: await knowledgeRuntimeClient.graph() })
  }
  bridge.rag = { chat: knowledgeRuntimeClient.chat }
  return true
}
''')

# Replace old bridge implementations with knowledge-core commands.
path = "Elephant/frontend/src/renderer/src/platform/tauriElephantNoteBridge.js"
text = read(path)
text = text.replace("case 'wiki.propose': return bridge.wiki.propose()", "case 'wiki.propose': return bridge.wiki.propose(payload)")
for case in ["    case 'search.clear': return bridge.search.clear()\n", "    case 'search.disable': return bridge.search.disable()\n", "    case 'search.enable': return bridge.search.enable()\n"]:
    text = text.replace(case, "")
text = text.replace("      autotag: async() => ({ tags: [] })", "      autotag: async(payload = {}) => invoke(target, 'tauri_knowledge_tagging_generate', { relativePath: payload.relativePath || payload.path || '', payload, maxTags: payload.maxTags || 8 })")
wiki_block = r'''    wiki: {
      list: async() => ({ records: await invoke(target, 'tauri_knowledge_wikis_list', { limit: 500 }) }),
      propose: (payload = {}) => invoke(target, 'tauri_knowledge_wiki_generate', normalizePayload(payload)),
      accept: (payload = {}) => invoke(target, 'tauri_knowledge_wiki_accept', { draftId: payload.draftId || payload.id || payload }),
      dismiss: (payload = {}) => invoke(target, 'tauri_knowledge_wiki_reject', { draftId: payload.draftId || payload.id || payload }),
      sourceInfo: (payload = {}) => invoke(target, 'tauri_knowledge_wiki_get', { draftId: payload.draftId || payload.id || payload }),
      context: async() => ({ records: await invoke(target, 'tauri_knowledge_wikis_list', { limit: 500 }), graph: await invoke(target, 'tauri_knowledge_graph', { includeSuggestions: false }) })
    },

'''
search_block = r'''    search: {
      initVault: () => invoke(target, 'tauri_knowledge_rebuild'),
      query: (params = {}) => invoke(target, 'tauri_knowledge_search', { query: params.query || params.q || '', limit: params.limit || params.maxResults || 20 }),
      status: async() => ({ enabled: true, runtime: 'rust-knowledge-core', ...(await invoke(target, 'tauri_knowledge_status')) }),
      rebuild: () => invoke(target, 'tauri_knowledge_rebuild'),
      inspect: async() => {
        const [graph, status] = await Promise.all([
          invoke(target, 'tauri_knowledge_graph', { includeSuggestions: false }),
          invoke(target, 'tauri_knowledge_status')
        ])
        return { indexPath: status.databasePath || '', documents: graph.nodes || [], folders: [], semanticLinks: graph.edges || [], graph, generatedAt: new Date().toISOString() }
      }
    },

'''
text = replace_between(text, "    wiki: {", "    search: {", wiki_block)
text = replace_between(text, "    search: {", "    sync: {", search_block)
text = text.replace("return invoke(target, 'tauri_rag_chat', {", "return invoke(target, 'tauri_knowledge_chat', {")
write(path, text)

# Muya renders Wiki previews; raw Markdown is not rendered with a <pre>.
path = "Elephant/frontend/app/components/views/WikiView.vue"
text = read(path)
text = text.replace('''        <article\n          v-for="draft in filteredDrafts"\n          v-else\n          :key="draft.id"''', '''        <template v-else>\n          <article\n            v-for="draft in filteredDrafts"\n            :key="draft.id"''')
text = text.replace("        </article>\n      </main>", "          </article>\n        </template>\n      </main>", 1)
text = text.replace("<h3>Aperçu Markdown</h3>", "<h3>Aperçu Muya</h3>")
text = text.replace("<pre>{{ draft.markdown }}</pre>", '<div class="knowledge-muya-preview" v-html="renderedWikiHtml[draft.id] || \'\'" />')
text = text.replace("const drafts = ref([])", "const drafts = ref([])\nconst renderedWikiHtml = reactive({})")
text = text.replace("const refresh = async () => {", '''const renderDraftWithMuya = async (draft) => {
  const result = await globalThis.elephantnote?.muya?.renderHtml?.({ markdown: draft.markdown || '' })
  renderedWikiHtml[draft.id] = result?.html || ''
}

const refresh = async () => {''')
text = text.replace("    drafts.value = await runtime.value.wikis.list({ limit: 500 })", "    drafts.value = await runtime.value.wikis.list({ limit: 500 })\n    await Promise.all(drafts.value.map(renderDraftWithMuya))")
text = text.replace(".knowledge-markdown-section pre {", ".knowledge-muya-preview {")
text = text.replace("  white-space: pre-wrap;\n  word-break: break-word;", "  word-break: break-word;")
write(path, text)

# Remove temporary workflows/scripts that should never ship.
for path in [
    ".github/workflows/knowledge-finalize-once.yml",
    ".github/workflows/knowledge-fix-once.yml",
    ".github/workflows/wiki-view-fix-once.yml",
    ".github/workflows/wiki-view-install-once.yml",
]:
    target = ROOT / path
    if target.exists(): target.unlink()

# Assertions: old runtime identifiers must not survive.
for forbidden in [
    "tauri_embeddings_", "EmbeddingStore", "tauri_wiki_proposals", "tauri_rag_build_prompt",
    "tauri_search_inspect", "tauri_search_rebuild", "tauri_search_query", "tauri_search_status",
    "legacyInspect", "legacyRebuild", "portable-markdown-index", "tauri_rag_chat",
]:
    matches = []
    for candidate in (ROOT / "Elephant").rglob("*"):
        if candidate.is_file() and candidate.suffix in {".rs", ".js", ".vue", ".ts"}:
            try: body = candidate.read_text()
            except UnicodeDecodeError: continue
            if forbidden in body: matches.append(str(candidate.relative_to(ROOT)))
    if matches:
        raise RuntimeError(f"Forbidden legacy identifier {forbidden}: {matches}")

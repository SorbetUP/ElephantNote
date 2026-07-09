const getCore = (target = globalThis) => target?.__TAURI__?.core || null

const invoke = (command, payload = {}, target = globalThis) => {
  const core = getCore(target)
  if (!core?.invoke) {
    throw new Error(`Tauri knowledge command API is unavailable for ${command}`)
  }
  return core.invoke(command, payload)
}

export const knowledgeRuntimeClient = Object.freeze({
  rebuild: () => invoke('tauri_knowledge_rebuild'),
  status: () => invoke('tauri_knowledge_status'),
  search: (query, limit = 20) => invoke('tauri_knowledge_search', { query, limit }),
  inspectNote: (relativePath) => invoke('tauri_knowledge_inspect_note', { relativePath }),
  graph: ({ includeSuggestions = false } = {}) =>
    invoke('tauri_knowledge_graph', { includeSuggestions }),
  listTags: () => invoke('tauri_knowledge_tags_list'),
  generateTagging: (relativePath, payload = {}, maxTags = 8) =>
    invoke('tauri_knowledge_tagging_generate', { relativePath, payload, maxTags }),
  validateChatAction: (action) => invoke('tauri_knowledge_validate_chat_action', { action }),
  listRelations: ({ status = null, limit = 1000 } = {}) =>
    invoke('tauri_knowledge_relations_list', { status, limit }),
  relationsForNode: (node, includeRejected = false) =>
    invoke('tauri_knowledge_relations_for_node', { node, includeRejected }),
  setRelationStatus: (relationId, status) =>
    invoke('tauri_knowledge_relation_status_set', { relationId, status })
})

export const isKnowledgeRuntimeAvailable = (target = globalThis) => !!getCore(target)?.invoke

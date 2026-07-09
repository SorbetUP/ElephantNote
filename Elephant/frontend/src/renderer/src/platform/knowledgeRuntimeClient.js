const getCore = (target = globalThis) => target?.__TAURI__?.core || null

const elapsedMs = (startedAt) => Math.max(0, Math.round((globalThis.performance?.now?.() || Date.now()) - startedAt))

const payloadSummary = (payload = {}) => {
  const summary = { keys: Object.keys(payload).sort() }
  if (typeof payload.relativePath === 'string') summary.relativePath = payload.relativePath
  if (typeof payload.draftId === 'string') summary.draftId = payload.draftId
  if (typeof payload.proposalId === 'string') summary.proposalId = payload.proposalId
  if (typeof payload.relationId === 'string') summary.relationId = payload.relationId
  if (typeof payload.status === 'string') summary.status = payload.status
  if (Number.isFinite(payload.limit)) summary.limit = payload.limit
  if (typeof payload.query === 'string') summary.queryLength = payload.query.length
  if (typeof payload.topic === 'string') summary.topicLength = payload.topic.length
  if (Array.isArray(payload.sourcePaths)) summary.sourceCount = payload.sourcePaths.length
  if (payload.action?.action) summary.action = payload.action.action
  return summary
}

const resultSummary = (result) => {
  if (Array.isArray(result)) return { resultType: 'array', resultCount: result.length }
  if (result == null) return { resultType: String(result) }
  if (typeof result !== 'object') return { resultType: typeof result }
  const summary = { resultType: 'object', resultKeys: Object.keys(result).sort() }
  if (result.id) summary.id = result.id
  if (result.status) summary.status = result.status
  if (result.draft?.id) summary.draftId = result.draft.id
  if (result.proposal?.id) summary.proposalId = result.proposal.id
  if (Array.isArray(result.sources)) summary.sourceCount = result.sources.length
  return summary
}

const emitRuntimeLog = (core, level, phase, command, details = {}) => {
  if (command === 'tauri_debug_log') return Promise.resolve()
  return core.invoke('tauri_debug_log', {
    level,
    message: `[KnowledgeRuntime] command:${phase}`,
    details: { command, ...details }
  }).catch(() => null)
}

export const invokeKnowledgeCommand = async(command, payload = {}, target = globalThis) => {
  const core = getCore(target)
  if (!core?.invoke) throw new Error(`Tauri knowledge command API is unavailable for ${command}`)

  const startedAt = globalThis.performance?.now?.() || Date.now()
  await emitRuntimeLog(core, 'debug', 'start', command, payloadSummary(payload))
  try {
    const result = await core.invoke(command, payload)
    await emitRuntimeLog(core, 'info', 'complete', command, {
      durationMs: elapsedMs(startedAt),
      ...resultSummary(result)
    })
    return result
  } catch (error) {
    await emitRuntimeLog(core, 'error', 'error', command, {
      durationMs: elapsedMs(startedAt),
      error: error?.message || String(error)
    })
    throw error
  }
}

export const knowledgeRuntimeClient = Object.freeze({
  rebuild: () => invokeKnowledgeCommand('tauri_knowledge_rebuild'),
  status: () => invokeKnowledgeCommand('tauri_knowledge_status'),
  search: (query, limit = 20) => invokeKnowledgeCommand('tauri_knowledge_search', { query, limit }),
  inspectNote: (relativePath) => invokeKnowledgeCommand('tauri_knowledge_inspect_note', { relativePath }),
  graph: ({ includeSuggestions = false } = {}) => invokeKnowledgeCommand('tauri_knowledge_graph', { includeSuggestions }),
  chat: (payload = {}) => invokeKnowledgeCommand('tauri_knowledge_chat', { payload }),
  listTags: () => invokeKnowledgeCommand('tauri_knowledge_tags_list'),
  generateTagging: (relativePath, payload = {}, maxTags = 8) => invokeKnowledgeCommand('tauri_knowledge_tagging_generate', { relativePath, payload, maxTags }),
  validateChatAction: (action) => invokeKnowledgeCommand('tauri_knowledge_validate_chat_action', { action }),
  prepareChatAction: (action, rationale = '') => invokeKnowledgeCommand('tauri_knowledge_chat_action_prepare', { action, rationale }),
  getChatAction: (proposalId) => invokeKnowledgeCommand('tauri_knowledge_chat_action_get', { proposalId }),
  listChatActions: ({ status = null, limit = 100 } = {}) => invokeKnowledgeCommand('tauri_knowledge_chat_actions_list', { status, limit }),
  approveChatAction: (proposalId) => invokeKnowledgeCommand('tauri_knowledge_chat_action_approve', { proposalId }),
  rejectChatAction: (proposalId) => invokeKnowledgeCommand('tauri_knowledge_chat_action_reject', { proposalId }),
  executeChatAction: (proposalId) => invokeKnowledgeCommand('tauri_knowledge_chat_action_execute', { proposalId }),
  generateWiki: ({ topic, title = null, sourcePaths = [], payload = {}, maxDocuments = 12, maxChunks = 64, maxSections = 10 }) =>
    invokeKnowledgeCommand('tauri_knowledge_wiki_generate', { topic, title, sourcePaths, payload, maxDocuments, maxChunks, maxSections }),
  getWikiDraft: (draftId) => invokeKnowledgeCommand('tauri_knowledge_wiki_get', { draftId }),
  listWikiDrafts: ({ status = null, limit = 100 } = {}) => invokeKnowledgeCommand('tauri_knowledge_wikis_list', { status, limit }),
  acceptWikiDraft: (draftId) => invokeKnowledgeCommand('tauri_knowledge_wiki_accept', { draftId }),
  rejectWikiDraft: (draftId) => invokeKnowledgeCommand('tauri_knowledge_wiki_reject', { draftId }),
  listRelations: ({ status = null, limit = 1000 } = {}) => invokeKnowledgeCommand('tauri_knowledge_relations_list', { status, limit }),
  relationsForNode: (node, includeRejected = false) => invokeKnowledgeCommand('tauri_knowledge_relations_for_node', { node, includeRejected }),
  setRelationStatus: (relationId, status) => invokeKnowledgeCommand('tauri_knowledge_relation_status_set', { relationId, status })
})

export const isKnowledgeRuntimeAvailable = (target = globalThis) => !!getCore(target)?.invoke

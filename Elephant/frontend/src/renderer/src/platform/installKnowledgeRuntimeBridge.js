import { knowledgeRuntimeClient, isKnowledgeRuntimeAvailable } from './knowledgeRuntimeClient'

const searchRuntimeState = {
  vaultPath: '',
  initializations: new Map(),
  rebuilds: new Map()
}

const documentCount = (status = {}) => Number(
  status.indexedDocuments ?? status.notesIndexed ?? status.documents ?? 0
) || 0

export const normalizeKnowledgeSearchStatus = (status = {}, vaultPath = searchRuntimeState.vaultPath, forcedStatus = '') => {
  const indexedDocuments = documentCount(status)
  const resolvedStatus = forcedStatus || status.status || (status.enabled === false
    ? 'disabled'
    : indexedDocuments > 0
      ? 'ready'
      : 'empty')
  return {
    enabled: status.enabled !== false,
    runtime: 'rust-knowledge-core',
    ...status,
    status: resolvedStatus,
    vaultPath: String(status.vaultPath || vaultPath || ''),
    indexedDocuments,
    totalDocuments: Number(status.totalDocuments ?? indexedDocuments) || indexedDocuments,
    message: String(status.message || '')
  }
}

const graphDocuments = (graph) => (Array.isArray(graph?.nodes) ? graph.nodes : [])
  .filter((node) => (node.kind || node.type) !== 'wiki')
  .map((node) => ({
    relativePath: node.relativePath || node.path || node.id || '',
    path: node.path || node.relativePath || node.id || '',
    title: node.title || node.id || 'Untitled',
    excerpt: node.summary || '',
    tags: Array.isArray(node.tags) ? node.tags : [],
    chunkCount: Number(node.chunkCount || 0)
  }))

const currentSearchStatus = async() => {
  const raw = await knowledgeRuntimeClient.status()
  const rebuilding = searchRuntimeState.rebuilds.has(searchRuntimeState.vaultPath)
  return normalizeKnowledgeSearchStatus(raw, searchRuntimeState.vaultPath, rebuilding ? 'indexing' : '')
}

const rebuildSearchIndex = (vaultPath = searchRuntimeState.vaultPath) => {
  const path = String(vaultPath || '').trim()
  const existing = searchRuntimeState.rebuilds.get(path)
  if (existing) return existing

  const rebuild = knowledgeRuntimeClient.rebuild()
    .then(async(report) => ({
      ...(await currentSearchStatus()),
      rebuildReport: report
    }))
    .finally(() => {
      if (searchRuntimeState.rebuilds.get(path) === rebuild) {
        searchRuntimeState.rebuilds.delete(path)
      }
    })
  searchRuntimeState.rebuilds.set(path, rebuild)
  return rebuild
}

const initializeSearchVault = (vaultPath = '') => {
  const path = String(vaultPath || '').trim()
  searchRuntimeState.vaultPath = path
  const existing = searchRuntimeState.initializations.get(path)
  if (existing) return existing

  const initialization = knowledgeRuntimeClient.status()
    .then((rawStatus) => {
      const status = normalizeKnowledgeSearchStatus(rawStatus, path)
      if (status.enabled && status.indexedDocuments === 0 && !searchRuntimeState.rebuilds.has(path)) {
        void rebuildSearchIndex(path).catch((error) => {
          console.error('[KnowledgeRuntime] initial rebuild failed', {
            vaultPath: path,
            error: error?.message || String(error)
          })
        })
        return {
          ...status,
          status: 'indexing',
          message: 'Building the local knowledge index in the background.'
        }
      }
      return status
    })
    .finally(() => {
      if (searchRuntimeState.initializations.get(path) === initialization) {
        searchRuntimeState.initializations.delete(path)
      }
    })
  searchRuntimeState.initializations.set(path, initialization)
  return initialization
}

const inspect = async() => {
  const [graph, status] = await Promise.all([
    knowledgeRuntimeClient.graph({ includeSuggestions: false }),
    currentSearchStatus()
  ])
  return {
    indexPath: status?.databasePath || status?.database_path || '',
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
    initVault: initializeSearchVault,
    query: ({ query = '', q = '', limit = 20 } = {}) => knowledgeRuntimeClient.search(query || q, limit),
    status: currentSearchStatus,
    rebuild: rebuildSearchIndex,
    inspect
  }
  bridge.wiki = {
    list: async() => ({ records: await knowledgeRuntimeClient.listWikiDrafts({ limit: 500 }) }),
    propose: knowledgeRuntimeClient.generateWiki,
    accept: ({ id, draftId } = {}) => knowledgeRuntimeClient.acceptWikiDraft(draftId || id),
    dismiss: ({ id, draftId } = {}) => knowledgeRuntimeClient.rejectWikiDraft(draftId || id),
    sourceInfo: ({ id, draftId } = {}) => knowledgeRuntimeClient.getWikiDraft(draftId || id),
    context: async() => ({ records: await knowledgeRuntimeClient.listWikiDrafts({ limit: 500 }), graph: await knowledgeRuntimeClient.graph() })
  }
  bridge.rag = { chat: knowledgeRuntimeClient.chat }
  return true
}

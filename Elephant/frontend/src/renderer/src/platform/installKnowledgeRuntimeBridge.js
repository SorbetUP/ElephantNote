import { knowledgeRuntimeClient, isKnowledgeRuntimeAvailable } from './knowledgeRuntimeClient'

const KNOWLEDGE_API_BRIDGE_VERSION = 4

const searchRuntimeState = {
  vaultPath: '',
  initializations: new Map(),
  rebuilds: new Map(),
  inspections: new Map()
}

const resolveVaultPathPayload = (payload = '') => {
  if (typeof payload === 'string') return payload.trim()
  return String(payload?.vaultPath || payload?.path || '').trim()
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
    totalDocuments: Number(status.totalDocuments ?? status.documents ?? indexedDocuments) || indexedDocuments,
    databasePath: status.databasePath || status.database_path || '',
    message: String(status.message || '')
  }
}

const normalizeSearchHit = (result = {}) => ({
  ...result,
  relativePath: result.relativePath || result.relative_path || result.path || '',
  path: result.path || result.relativePath || result.relative_path || '',
  chunkId: result.chunkId || result.chunk_id || '',
  startOffset: Number(result.startOffset ?? result.start_offset ?? 0) || 0,
  endOffset: Number(result.endOffset ?? result.end_offset ?? 0) || 0
})

const normalizeSearchResults = (results) => {
  if (!Array.isArray(results)) return []
  const byDocument = new Map()
  for (const rawResult of results) {
    const result = normalizeSearchHit(rawResult)
    if (!result.relativePath) continue
    const existing = byDocument.get(result.relativePath)
    if (!existing) {
      byDocument.set(result.relativePath, { ...result, matchCount: 1 })
      continue
    }
    const matchCount = Number(existing.matchCount || 1) + 1
    const existingScore = Number(existing.score ?? existing.rank ?? 0)
    const nextScore = Number(result.score ?? result.rank ?? 0)
    if (nextScore > existingScore) {
      byDocument.set(result.relativePath, { ...result, matchCount })
    } else {
      existing.matchCount = matchCount
    }
  }
  return [...byDocument.values()]
}

const graphDocuments = (graph) => (Array.isArray(graph?.nodes) ? graph.nodes : [])
  .filter((node) => (node.kind || node.type) === 'note')
  .map((node) => ({
    relativePath: node.relativePath || node.relative_path || node.path || node.id || '',
    path: node.path || node.relativePath || node.relative_path || node.id || '',
    title: node.title || node.id || 'Untitled',
    excerpt: node.summary || '',
    tags: Array.isArray(node.tags) ? node.tags : [],
    chunkCount: Number(node.chunkCount || node.chunk_count || 0)
  }))

const normalizeGraphForRenderer = (graph = {}) => {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  const clusters = Array.isArray(graph.clusters) ? graph.clusters : []
  console.info('[KnowledgeRuntime] graph:renderer-full', {
    totalNodes: nodes.length,
    totalEdges: edges.length,
    clusters: clusters.length
  })
  return {
    ...graph,
    nodes,
    edges,
    clusters,
    totalNodeCount: nodes.length,
    hiddenNodeCount: 0,
    rendererLimited: false
  }
}

const currentSearchStatus = async(payload = searchRuntimeState.vaultPath) => {
  const path = resolveVaultPathPayload(payload) || searchRuntimeState.vaultPath
  if (path) searchRuntimeState.vaultPath = path
  const raw = await knowledgeRuntimeClient.status()
  const rebuilding = searchRuntimeState.rebuilds.has(path)
  return normalizeKnowledgeSearchStatus(raw, path, rebuilding ? 'indexing' : '')
}

const rebuildSearchIndex = (payload = searchRuntimeState.vaultPath) => {
  const path = resolveVaultPathPayload(payload) || searchRuntimeState.vaultPath
  if (path) searchRuntimeState.vaultPath = path
  const existing = searchRuntimeState.rebuilds.get(path)
  if (existing) return existing

  console.info('[KnowledgeRuntime] rebuild:explicit:start', { vaultPath: path })
  const rebuild = knowledgeRuntimeClient.rebuild()
    .then(async(report) => {
      const status = await currentSearchStatus(path)
      console.info('[KnowledgeRuntime] rebuild:explicit:complete', {
        vaultPath: path,
        scanned: Number(report?.scanned || 0),
        indexed: Number(report?.indexed || 0),
        unchanged: Number(report?.unchanged || 0),
        removed: Number(report?.removed || 0),
        failed: Array.isArray(report?.failed) ? report.failed.length : 0,
        indexedDocuments: status.indexedDocuments
      })
      return { ...status, rebuildReport: report }
    })
    .finally(() => {
      if (searchRuntimeState.rebuilds.get(path) === rebuild) {
        searchRuntimeState.rebuilds.delete(path)
      }
    })
  searchRuntimeState.rebuilds.set(path, rebuild)
  return rebuild
}

const initializeSearchVault = (payload = '') => {
  const path = resolveVaultPathPayload(payload)
  if (path) searchRuntimeState.vaultPath = path
  const key = path || '<active>'
  const existing = searchRuntimeState.initializations.get(key)
  if (existing) return existing

  console.info('[KnowledgeRuntime] init:status-only:start', { vaultPath: path })
  const initialization = knowledgeRuntimeClient.status()
    .then((rawStatus) => {
      const status = normalizeKnowledgeSearchStatus(rawStatus, path)
      console.info('[KnowledgeRuntime] init:status-only:complete', {
        vaultPath: status.vaultPath,
        indexedDocuments: status.indexedDocuments,
        status: status.status
      })
      if (status.enabled && status.indexedDocuments === 0) {
        return {
          ...status,
          status: 'empty',
          message: 'The local knowledge index is empty. Start a rebuild explicitly from Search settings.'
        }
      }
      return status
    })
    .finally(() => {
      if (searchRuntimeState.initializations.get(key) === initialization) {
        searchRuntimeState.initializations.delete(key)
      }
    })
  searchRuntimeState.initializations.set(key, initialization)
  return initialization
}

const inspect = (payload = searchRuntimeState.vaultPath) => {
  const path = resolveVaultPathPayload(payload) || searchRuntimeState.vaultPath
  if (path) searchRuntimeState.vaultPath = path
  const key = path || '<active>'
  const existing = searchRuntimeState.inspections.get(key)
  if (existing) return existing

  const inspection = Promise.all([
    knowledgeRuntimeClient.graph({ includeSuggestions: false }),
    currentSearchStatus(path)
  ])
    .then(([fullGraph, status]) => {
      const graph = normalizeGraphForRenderer(fullGraph)
      return {
        indexPath: status.databasePath || '',
        documents: graphDocuments(graph),
        folders: [],
        semanticLinks: Array.isArray(graph.edges) ? graph.edges : [],
        graph,
        generatedAt: new Date().toISOString()
      }
    })
    .finally(() => {
      if (searchRuntimeState.inspections.get(key) === inspection) {
        searchRuntimeState.inspections.delete(key)
      }
    })
  searchRuntimeState.inspections.set(key, inspection)
  return inspection
}

const searchQuery = async(payload = {}) => normalizeSearchResults(
  await knowledgeRuntimeClient.search(payload.query || payload.q || '', payload.limit || payload.maxResults || 20)
)

const installApiDispatcher = (bridge) => {
  const api = bridge?.api
  if (!api?.call || api.__knowledgeRuntimeBridgeVersion === KNOWLEDGE_API_BRIDGE_VERSION) return false
  const originalCall = api.call.bind(api)
  const handlers = {
    'search.initVault': initializeSearchVault,
    'search.query': searchQuery,
    'search.status': currentSearchStatus,
    'search.rebuild': rebuildSearchIndex,
    'search.inspect': inspect,
    'wiki.list': async() => ({ records: await knowledgeRuntimeClient.listWikiDrafts({ limit: 500 }) }),
    'wiki.propose': knowledgeRuntimeClient.generateWiki,
    'wiki.accept': ({ id, draftId } = {}) => knowledgeRuntimeClient.acceptWikiDraft(draftId || id),
    'wiki.dismiss': ({ id, draftId } = {}) => knowledgeRuntimeClient.rejectWikiDraft(draftId || id),
    'wiki.sourceInfo': ({ id, draftId } = {}) => knowledgeRuntimeClient.getWikiDraft(draftId || id),
    'wiki.context': async() => ({
      records: await knowledgeRuntimeClient.listWikiDrafts({ limit: 500 }),
      graph: normalizeGraphForRenderer(await knowledgeRuntimeClient.graph({ includeSuggestions: false }))
    }),
    'notes.autotag': ({ relativePath = '', path = '', maxTags = 8 } = {}) => knowledgeRuntimeClient.generateTagging({
      relativePath: relativePath || path,
      maxTags
    }),
    'rag.chat': knowledgeRuntimeClient.chat
  }

  api.call = async(action, payload = {}) => {
    const handler = handlers[action]
    if (!handler) return originalCall(action, payload)
    return {
      ok: true,
      data: await handler(payload)
    }
  }
  Object.defineProperty(api, '__knowledgeRuntimeBridgeVersion', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: KNOWLEDGE_API_BRIDGE_VERSION
  })
  return true
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
      candidates: knowledgeRuntimeClient.discoverWikiCandidates,
      autoPropose: knowledgeRuntimeClient.autoProposeWikis,
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
    query: searchQuery,
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
    context: async() => ({
      records: await knowledgeRuntimeClient.listWikiDrafts({ limit: 500 }),
      graph: normalizeGraphForRenderer(await knowledgeRuntimeClient.graph({ includeSuggestions: false }))
    })
  }
  bridge.rag = { chat: knowledgeRuntimeClient.chat }

  const dispatcherInstalled = installApiDispatcher(bridge)
  console.info('[KnowledgeRuntime] bridge:installed', {
    version: KNOWLEDGE_API_BRIDGE_VERSION,
    dispatcherInstalled,
    initMode: 'status-only',
    rendererGraphLimit: null,
    graphMode: 'full'
  })
  return true
}

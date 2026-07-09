import { knowledgeRuntimeClient, isKnowledgeRuntimeAvailable } from './knowledgeRuntimeClient'

const MAX_GRAPH_NODES = 240
const KNOWLEDGE_API_BRIDGE_VERSION = 2

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

const normalizeSearchResults = (results) => Array.isArray(results)
  ? results.map(normalizeSearchHit).filter((result) => result.relativePath)
  : []

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

const limitGraphForRenderer = (graph = {}, maxNodes = MAX_GRAPH_NODES) => {
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : []
  const edges = Array.isArray(graph.edges) ? graph.edges : []
  const clusters = Array.isArray(graph.clusters) ? graph.clusters : []
  if (nodes.length <= maxNodes) {
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

  const degree = new Map()
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  }
  const ranked = [...nodes].sort((left, right) => {
    const wikiDelta = Number((right.kind || right.type) === 'wiki') - Number((left.kind || left.type) === 'wiki')
    if (wikiDelta) return wikiDelta
    const relationDelta = (degree.get(right.id) || 0) - (degree.get(left.id) || 0)
    if (relationDelta) return relationDelta
    return String(left.title || left.id || '').localeCompare(String(right.title || right.id || ''))
  })
  const visibleNodes = ranked.slice(0, maxNodes)
  const visibleIds = new Set(visibleNodes.map((node) => node.id))
  const visibleEdges = edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
  const visibleClusters = clusters
    .map((cluster) => ({
      ...cluster,
      paths: Array.isArray(cluster.paths) ? cluster.paths.filter((path) => visibleIds.has(path)) : []
    }))
    .filter((cluster) => cluster.paths.length)

  console.info('[KnowledgeRuntime] graph:renderer-window', {
    totalNodes: nodes.length,
    visibleNodes: visibleNodes.length,
    hiddenNodes: nodes.length - visibleNodes.length,
    totalEdges: edges.length,
    visibleEdges: visibleEdges.length
  })
  return {
    ...graph,
    nodes: visibleNodes,
    edges: visibleEdges,
    clusters: visibleClusters,
    totalNodeCount: nodes.length,
    hiddenNodeCount: nodes.length - visibleNodes.length,
    rendererLimited: true
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
      const graph = limitGraphForRenderer(fullGraph)
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
      graph: limitGraphForRenderer(await knowledgeRuntimeClient.graph({ includeSuggestions: false }))
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
      graph: limitGraphForRenderer(await knowledgeRuntimeClient.graph({ includeSuggestions: false }))
    })
  }
  bridge.rag = { chat: knowledgeRuntimeClient.chat }

  const dispatcherInstalled = installApiDispatcher(bridge)
  console.info('[KnowledgeRuntime] bridge:installed', {
    version: KNOWLEDGE_API_BRIDGE_VERSION,
    dispatcherInstalled,
    initMode: 'status-only',
    rendererGraphLimit: MAX_GRAPH_NODES
  })
  return true
}

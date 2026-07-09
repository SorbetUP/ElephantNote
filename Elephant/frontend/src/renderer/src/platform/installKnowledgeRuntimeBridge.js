import { knowledgeRuntimeClient, isKnowledgeRuntimeAvailable } from './knowledgeRuntimeClient'

const MAX_GRAPH_NODES = 320

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
  .filter((node) => (node.kind || node.type) !== 'wiki')
  .map((node) => ({
    relativePath: node.relativePath || node.path || node.id || '',
    path: node.path || node.relativePath || node.id || '',
    title: node.title || node.id || 'Untitled',
    excerpt: node.summary || '',
    tags: Array.isArray(node.tags) ? node.tags : [],
    chunkCount: Number(node.chunkCount || 0)
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

const currentSearchStatus = async() => {
  const raw = await knowledgeRuntimeClient.status()
  const rebuilding = searchRuntimeState.rebuilds.has(searchRuntimeState.vaultPath)
  return normalizeKnowledgeSearchStatus(raw, searchRuntimeState.vaultPath, rebuilding ? 'indexing' : '')
}

const rebuildSearchIndex = (vaultPath = searchRuntimeState.vaultPath) => {
  const path = String(vaultPath || '').trim()
  const existing = searchRuntimeState.rebuilds.get(path)
  if (existing) return existing

  console.info('[KnowledgeRuntime] rebuild:explicit:start', { vaultPath: path })
  const rebuild = knowledgeRuntimeClient.rebuild()
    .then(async(report) => {
      const status = await currentSearchStatus()
      console.info('[KnowledgeRuntime] rebuild:explicit:complete', {
        vaultPath: path,
        scanned: Number(report?.scanned || 0),
        indexed: Number(report?.indexed || 0),
        unchanged: Number(report?.unchanged || 0),
        removed: Number(report?.removed || 0),
        failed: Array.isArray(report?.failed) ? report.failed.length : 0
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

const initializeSearchVault = (vaultPath = '') => {
  const path = String(vaultPath || '').trim()
  searchRuntimeState.vaultPath = path
  const existing = searchRuntimeState.initializations.get(path)
  if (existing) return existing

  const initialization = knowledgeRuntimeClient.status()
    .then((rawStatus) => {
      const status = normalizeKnowledgeSearchStatus(rawStatus, path)
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
      if (searchRuntimeState.initializations.get(path) === initialization) {
        searchRuntimeState.initializations.delete(path)
      }
    })
  searchRuntimeState.initializations.set(path, initialization)
  return initialization
}

const inspect = async() => {
  const [fullGraph, status] = await Promise.all([
    knowledgeRuntimeClient.graph({ includeSuggestions: false }),
    currentSearchStatus()
  ])
  const graph = limitGraphForRenderer(fullGraph)
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
    query: async({ query = '', q = '', limit = 20 } = {}) => normalizeSearchResults(
      await knowledgeRuntimeClient.search(query || q, limit)
    ),
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

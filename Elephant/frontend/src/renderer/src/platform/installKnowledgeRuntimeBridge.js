import { knowledgeRuntimeClient, isKnowledgeRuntimeAvailable } from './knowledgeRuntimeClient'

const emptyInspection = () => ({
  indexPath: '',
  documents: [],
  folders: [],
  semanticLinks: [],
  graph: { nodes: [], edges: [], clusters: [] },
  generatedAt: ''
})

const graphDocuments = (graph) => (Array.isArray(graph?.nodes) ? graph.nodes : []).map((node) => ({
  relativePath: node.relativePath || node.path || node.id || '',
  path: node.path || node.relativePath || node.id || '',
  title: node.title || node.id || 'Untitled',
  excerpt: node.summary || '',
  tags: Array.isArray(node.tags) ? node.tags : [],
  chunkCount: Number(node.chunkCount || 0)
}))

export const installKnowledgeRuntimeBridge = (target = globalThis) => {
  const bridge = target?.elephantnote
  if (!bridge || !isKnowledgeRuntimeAvailable(target)) return false
  if (bridge.knowledge?.runtime === 'rust-knowledge-core') return true

  const legacyInspect = typeof bridge.search?.inspect === 'function'
    ? bridge.search.inspect.bind(bridge.search)
    : null

  bridge.knowledge = {
    runtime: 'rust-knowledge-core',
    rebuild: () => knowledgeRuntimeClient.rebuild(),
    status: () => knowledgeRuntimeClient.status(),
    search: (query, limit = 20) => knowledgeRuntimeClient.search(query, limit),
    inspectNote: (relativePath) => knowledgeRuntimeClient.inspectNote(relativePath),
    graph: (options = {}) => knowledgeRuntimeClient.graph(options),
    listTags: () => knowledgeRuntimeClient.listTags(),
    generateTagging: (relativePath, payload = {}, maxTags = 8) =>
      knowledgeRuntimeClient.generateTagging(relativePath, payload, maxTags),
    validateChatAction: (action) => knowledgeRuntimeClient.validateChatAction(action),
    listRelations: (options = {}) => knowledgeRuntimeClient.listRelations(options),
    relationsForNode: (node, includeRejected = false) =>
      knowledgeRuntimeClient.relationsForNode(node, includeRejected),
    setRelationStatus: (relationId, status) =>
      knowledgeRuntimeClient.setRelationStatus(relationId, status)
  }

  bridge.search = bridge.search || {}
  bridge.search.inspect = async () => {
    const [legacyResult, graphResult, statusResult] = await Promise.allSettled([
      legacyInspect ? legacyInspect() : Promise.resolve(emptyInspection()),
      knowledgeRuntimeClient.graph({ includeSuggestions: false }),
      knowledgeRuntimeClient.status()
    ])
    const legacy = legacyResult.status === 'fulfilled' && legacyResult.value
      ? legacyResult.value
      : emptyInspection()
    if (graphResult.status !== 'fulfilled') return legacy

    const graph = graphResult.value || emptyInspection().graph
    const status = statusResult.status === 'fulfilled' ? statusResult.value : null
    return {
      ...legacy,
      indexPath: status?.databasePath || legacy.indexPath || '',
      documents: graphDocuments(graph),
      semanticLinks: Array.isArray(graph?.edges) ? graph.edges : [],
      graph,
      generatedAt: new Date().toISOString()
    }
  }

  const legacyRebuild = typeof bridge.search.rebuild === 'function'
    ? bridge.search.rebuild.bind(bridge.search)
    : null
  bridge.search.rebuild = async () => {
    const report = await knowledgeRuntimeClient.rebuild()
    await legacyRebuild?.().catch(() => null)
    return {
      ok: Array.isArray(report?.failed) ? report.failed.length === 0 : true,
      runtime: 'rust-knowledge-core',
      ...report
    }
  }

  return true
}

import { knowledgeRuntimeClient, isKnowledgeRuntimeAvailable } from './knowledgeRuntimeClient'

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

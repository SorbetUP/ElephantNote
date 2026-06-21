import { buildWikiGraphPanel } from './wikiViewHelpers'

const DEFAULT_QUICK_PROMPTS = [
  {
    label: 'Summarize graph',
    hint: 'Use the active semantic context',
    icon: 'graph',
    prompt: 'Summarize the active note graph context and cite the most relevant sources.'
  },
  {
    label: 'Find follow-ups',
    hint: 'Surface related notes',
    icon: 'link',
    prompt: 'Find the best follow-up notes or open questions connected to this context.'
  },
  {
    label: 'Draft wiki',
    hint: 'Prepare a cited wiki topic',
    icon: 'doc',
    prompt: 'Draft a concise wiki-style summary for the active context with citations.'
  },
  {
    label: 'Explain sources',
    hint: 'Clarify why they matter',
    icon: 'source',
    prompt: 'Explain why the cited sources matter and what each one contributes.'
  }
]

export const buildChatContextPanel = ({
  graph = null,
  limit = 4
} = {}) => {
  const graphPanel = buildWikiGraphPanel({
    inspectionGraph: graph,
    includeStructure: false
  })

  return {
    summary: graphPanel.summary,
    clusters: graphPanel.clusters.slice(0, Math.max(1, Number(limit) || 4)).map((cluster) => ({
      id: String(cluster.id || ''),
      label: String(cluster.label || cluster.id || 'Cluster'),
      nodeCount: Number(cluster.nodeCount || 0),
      paths: Array.isArray(cluster.paths) ? cluster.paths : []
    })),
    quickPrompts: DEFAULT_QUICK_PROMPTS
  }
}

const summarizeWikiContext = (wikiContext = null) => {
  if (!wikiContext) return null
  const source = wikiContext.source || {}
  const graphSummary = wikiContext.graphSummary || {}
  return {
    name: 'wiki.context',
    label: source.title || source.path || 'Wiki context',
    status: 'done',
    summary: `${graphSummary.nodes || 0} nodes \u00b7 ${graphSummary.semanticLinks || 0} semantic links \u00b7 ${graphSummary.clusters || 0} clusters`,
    sources: [source].filter((entry) => entry && (entry.path || entry.title))
  }
}

const summarizeCitations = (citations = []) => {
  if (!Array.isArray(citations) || citations.length === 0) return null
  return {
    name: 'rag.search',
    label: `Retrieved ${citations.length} cited note${citations.length === 1 ? '' : 's'}`,
    status: 'done',
    summary: citations
      .slice(0, 3)
      .map((citation) => citation.title || citation.path)
      .join(', '),
    sources: citations
      .slice(0, 8)
      .map((citation) => ({
        path: citation.path,
        title: citation.title || citation.path,
        score: citation.score
      }))
  }
}

export const shapeToolCallsForAssistant = (result = {}) => {
  const calls = []
  const citations = result?.citations || []
  const wikiContext = result?.wikiContext || null

  const searchCall = summarizeCitations(citations)
  if (searchCall) calls.push(searchCall)

  const wikiCall = summarizeWikiContext(wikiContext)
  if (wikiCall) calls.push(wikiCall)

  return calls
}

export const formatChatTimestamp = (timestamp) => {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  if (sameDay) return time
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day} \u00b7 ${time}`
}

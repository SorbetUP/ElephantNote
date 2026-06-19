import { buildWikiGraphPanel } from './wikiViewHelpers'

const DEFAULT_QUICK_PROMPTS = [
  {
    label: 'Summarize graph',
    hint: 'Use the active semantic context',
    prompt: 'Summarize the active note graph context and cite the most relevant sources.'
  },
  {
    label: 'Find follow-ups',
    hint: 'Surface related notes',
    prompt: 'Find the best follow-up notes or open questions connected to this context.'
  },
  {
    label: 'Draft wiki',
    hint: 'Prepare a cited wiki topic',
    prompt: 'Draft a concise wiki-style summary for the active context with citations.'
  },
  {
    label: 'Explain sources',
    hint: 'Clarify why they matter',
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

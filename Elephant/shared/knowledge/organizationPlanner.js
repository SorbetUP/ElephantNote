import { createStableKnowledgeHash, normalizeKnowledgeText } from './knowledgeIndex.js'

const slugify = (value = '') => normalizeKnowledgeText(value)
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'knowledge'

const unique = (values = []) => [...new Set(values.filter(Boolean))]

const isSemanticCluster = (cluster = {}) => String(cluster.kind || cluster.type || '').toLowerCase() === 'semantic'

export const buildAutomaticOrganizationPlan = ({
  graph = {},
  wikiRoot = '.elephantnote/wiki',
  minClusterSize = 2,
  now = new Date()
} = {}) => {
  const clusters = Array.isArray(graph?.clusters) ? graph.clusters : []
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const nodeByPath = new Map(nodes.map((node) => [node.relativePath || node.id, node]))
  const generatedAt = now.toISOString()
  const proposals = []

  for (const cluster of clusters) {
    const paths = unique(Array.isArray(cluster.paths) ? cluster.paths : [])
    if (paths.length < minClusterSize) continue
    if (!isSemanticCluster(cluster) && clusters.some(isSemanticCluster)) continue

    const title = String(cluster.label || cluster.id || 'Knowledge cluster').trim()
    const slug = slugify(title)
    const sourceNodes = paths.map((path) => nodeByPath.get(path)).filter(Boolean)
    const tags = unique([
      ...(Array.isArray(cluster.tags) ? cluster.tags : []),
      ...sourceNodes.flatMap((node) => Array.isArray(node.tags) ? node.tags : [])
    ]).slice(0, 12)
    const confidence = Math.max(0.1, Math.min(1, Number(cluster.cohesion || 0.5)))

    proposals.push({
      id: `organization:${createStableKnowledgeHash(`${cluster.id || title}:${paths.join('|')}`)}`,
      type: 'semantic-wiki',
      status: confidence >= 0.3 ? 'ready' : 'review',
      title,
      clusterId: cluster.id || slug,
      confidence: Number(confidence.toFixed(4)),
      wikiPath: `${wikiRoot}/${slug}.md`,
      sourcePaths: paths,
      tags,
      reason: `Create or refresh a wiki center for ${paths.length} semantically related notes.`,
      generatedAt
    })
  }

  return {
    version: 1,
    generatedAt,
    proposalCount: proposals.length,
    proposals: proposals.sort((a, b) => b.confidence - a.confidence || a.title.localeCompare(b.title)),
    safeMode: 'propose-only',
    appliesMovesAutomatically: false
  }
}

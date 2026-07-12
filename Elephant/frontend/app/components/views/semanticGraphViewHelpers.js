const normalizeNodeId = (node = {}) => String(node.id || node.relativePath || node.path || '').trim()

const normalizeGraphNode = (node = {}) => {
  const id = normalizeNodeId(node)
  const title = String(node.title || node.name || id.split('/').pop() || 'Untitled').trim()
  return {
    ...node,
    id,
    path: node.path || node.relativePath || id,
    relativePath: node.relativePath || node.path || id,
    title,
    kind: node.kind || node.type || 'note',
    type: node.type || node.kind || 'note',
    summary: String(node.summary || '').trim(),
    tags: Array.isArray(node.tags) ? node.tags : [],
    sourceCount: Number(node.sourceCount || 0),
    chunkCount: Number(node.chunkCount || 0)
  }
}

const normalizeGraphEdge = (edge = {}) => {
  const type = String(
    edge.type || edge.edgeType || edge.edge_type || edge.relationType || edge.relation_type || 'semantic'
  ).trim()
  return {
    ...edge,
    source: String(edge.source || '').trim(),
    target: String(edge.target || '').trim(),
    type,
    relationType: String(edge.relationType || edge.relation_type || '').trim(),
    reason: String(edge.reason || type || 'semantic').trim(),
    weight: Number(edge.weight ?? edge.score ?? 0) || 0
  }
}

const groupNodeCluster = (node = {}) => {
  if ((node.kind || node.type) === 'folder') return node.id
  const path = String(node.relativePath || node.path || node.id || '').trim()
  const folder = path.includes('/') ? path.split('/').slice(0, -1).join('/') : 'root'
  return folder || 'root'
}

const semanticViewModelCache = new WeakMap()
const vaultGraphCache = new WeakMap()
const VISIBLE_KNOWLEDGE_EDGE_TYPES = new Set([
  'semantic',
  'explicit-link',
  'wiki-source',
  'wiki-link'
])
const WIKI_LAYOUT_EDGE_TYPES = new Set(['wiki-source', 'wiki-link'])

const stableLayoutHash = (value = '') => {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const applyWikiKnowledgeLayout = ({ nodes = [], edges = [], width = 1800, height = 1200 } = {}) => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const wikiNodes = nodes.filter((node) => (node.kind || node.type) === 'wiki')
  if (!wikiNodes.length) return nodes

  const sourceIdsByWiki = new Map(wikiNodes.map((node) => [node.id, []]))
  const boundIds = new Set(wikiNodes.map((node) => node.id))
  for (const edge of edges) {
    if (edge.type !== 'wiki-source') continue
    const sourceNode = byId.get(edge.source)
    const targetNode = byId.get(edge.target)
    const wikiId = (sourceNode?.kind || sourceNode?.type) === 'wiki'
      ? edge.source
      : (targetNode?.kind || targetNode?.type) === 'wiki' ? edge.target : ''
    const noteId = wikiId === edge.source ? edge.target : edge.source
    if (!wikiId || !byId.has(noteId)) continue
    sourceIdsByWiki.get(wikiId)?.push(noteId)
    boundIds.add(noteId)
  }

  const positions = new Map(nodes.map((node) => [node.id, { x: node.x, y: node.y }]))
  if (wikiNodes.length === 1) {
    positions.set(wikiNodes[0].id, { x: width / 2, y: height / 2 })
  }

  const proposed = new Map()
  for (const wiki of wikiNodes.sort((left, right) => String(left.id).localeCompare(String(right.id)))) {
    const center = positions.get(wiki.id) || { x: width / 2, y: height / 2 }
    const sourceIds = [...new Set(sourceIdsByWiki.get(wiki.id) || [])]
      .sort((left, right) => String(byId.get(left)?.title || left).localeCompare(String(byId.get(right)?.title || right)))
    const perRing = 12
    sourceIds.forEach((id, index) => {
      const ring = Math.floor(index / perRing)
      const ringItems = Math.min(perRing, sourceIds.length - ring * perRing)
      const angle = -Math.PI / 2 + (Math.PI * 2 * (index % perRing)) / Math.max(1, ringItems)
      const radius = 78 + ring * 42
      const target = { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
      if (!proposed.has(id)) proposed.set(id, [])
      proposed.get(id).push(target)
    })

    const protectedRadius = 150 + Math.max(0, Math.ceil(sourceIds.length / perRing) - 1) * 42
    for (const node of nodes) {
      if (boundIds.has(node.id)) continue
      const point = positions.get(node.id)
      if (!point) continue
      const dx = point.x - center.x
      const dy = point.y - center.y
      const distance = Math.hypot(dx, dy)
      if (distance >= protectedRadius) continue
      const angle = distance > 1
        ? Math.atan2(dy, dx)
        : ((stableLayoutHash(node.id) % 360) / 180) * Math.PI
      const radius = protectedRadius + 18 + (stableLayoutHash(node.id) % 46)
      positions.set(node.id, { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius })
    }
  }

  for (const [id, targets] of proposed.entries()) {
    const point = targets.reduce((output, target) => ({ x: output.x + target.x, y: output.y + target.y }), { x: 0, y: 0 })
    positions.set(id, { x: point.x / targets.length, y: point.y / targets.length })
  }

  return nodes.map((node) => ({ ...node, ...(positions.get(node.id) || {}) }))
}

export const selectSemanticGraphSource = ({
  inspectionGraph = null,
  fallbackGraph = null
} = {}) => {
  const hasInspectionGraph = Array.isArray(inspectionGraph?.nodes) && inspectionGraph.nodes.length > 0
  if (hasInspectionGraph) return inspectionGraph
  return fallbackGraph || inspectionGraph || { nodes: [], edges: [], clusters: [] }
}

export const resolveSemanticGraph = (graph = null, fallback = null) => {
  const source = graph?.nodes?.length ? graph : fallback || { nodes: [], edges: [], clusters: [] }
  return {
    nodes: Array.isArray(source.nodes) ? source.nodes.map(normalizeGraphNode) : [],
    edges: Array.isArray(source.edges) ? source.edges.map(normalizeGraphEdge) : [],
    clusters: Array.isArray(source.clusters)
      ? source.clusters.map((cluster) => ({
        ...cluster,
        id: String(cluster.id || '').trim(),
        label: String(cluster.label || cluster.id || '').trim(),
        paths: Array.isArray(cluster.paths) ? cluster.paths.map((path) => String(path || '').trim()).filter(Boolean) : []
      }))
      : []
  }
}

export const buildSemanticGraphSurface = ({
  graph = null,
  fallback = null,
  includeStructure = false
} = {}) => {
  const resolved = resolveSemanticGraph(graph, fallback)
  const nodes = includeStructure
    ? resolved.nodes
    : resolved.nodes.filter((node) => (node.kind || node.type) !== 'folder')
  const allowedNodeIds = new Set(nodes.map((node) => node.id))
  const edges = resolved.edges.filter((edge) => {
    if (!allowedNodeIds.has(edge.source) || !allowedNodeIds.has(edge.target)) return false
    if (includeStructure) return true
    return VISIBLE_KNOWLEDGE_EDGE_TYPES.has(edge.type)
  })
  const clusters = resolved.clusters.filter((cluster) =>
    Array.isArray(cluster.paths) && cluster.paths.some((path) => allowedNodeIds.has(path))
  )
  const edgeCounts = new Map()
  for (const edge of edges) {
    edgeCounts.set(edge.source, (edgeCounts.get(edge.source) || 0) + 1)
    edgeCounts.set(edge.target, (edgeCounts.get(edge.target) || 0) + 1)
  }
  const atomCluster = new Map()
  for (const node of nodes) {
    atomCluster.set(node.id, groupNodeCluster(node))
  }
  return {
    nodes,
    edges,
    clusters,
    edgeCounts,
    maxEdges: Math.max(1, ...edgeCounts.values(), 1),
    atomCluster,
    nodeMap: new Map(nodes.map((node) => [node.id, node])),
    includeStructure
  }
}

const buildSemanticViewModelBase = ({
  graph = null,
  fallback = null,
  width = 1800,
  height = 1200
} = {}) => {
  const resolved = resolveSemanticGraph(graph, fallback)
  const nodes = [...resolved.nodes]
  const edges = [...resolved.edges]
  const clusters = resolved.clusters.length
    ? resolved.clusters
    : buildClusters(nodes)

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const clusterNodes = new Map()

  for (const node of nodes) {
    const clusterId = groupNodeCluster(node)
    if (!clusterNodes.has(clusterId)) clusterNodes.set(clusterId, [])
    clusterNodes.get(clusterId).push(node)
  }

  const centerX = width / 2
  const centerY = height / 2
  const clusterRadius = Math.max(200, Math.min(width, height) * 0.32)
  const clusterCount = Math.max(1, clusterNodes.size)
  const clusterCenters = new Map()
  const clusterIndexMap = new Map()

  for (const [clusterId] of clusterNodes.entries()) {
    const index = clusterIndexMap.size
    clusterIndexMap.set(clusterId, index)
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / clusterCount
    clusterCenters.set(clusterId, {
      x: centerX + Math.cos(angle) * clusterRadius,
      y: centerY + Math.sin(angle) * clusterRadius
    })
  }

  const positionedNodes = []
  for (const [clusterId, clusterMembers] of clusterNodes.entries()) {
    const anchor = clusterCenters.get(clusterId) || { x: centerX, y: centerY }
    const folderNode = clusterMembers.find((node) => (node.kind || node.type) === 'folder') || null
    const noteNodes = clusterMembers.filter((node) => node !== folderNode)
    const noteRadius = Math.max(80, 54 + Math.sqrt(noteNodes.length) * 18)
    const clusterIndex = clusterIndexMap.get(clusterId) || 0

    if (folderNode) {
      positionedNodes.push({
        ...folderNode,
        x: anchor.x,
        y: anchor.y,
        depth: 0,
        clusterId,
        clusterIndex,
        clusterLabel: folderNode.title || clusterId
      })
    }

    const noteCount = Math.max(1, noteNodes.length)
    const rings = Math.max(1, Math.ceil(Math.sqrt(noteCount / Math.PI)))
    for (let index = 0; index < noteNodes.length; index += 1) {
      const node = noteNodes[index]
      const ringIdx = Math.floor(index / Math.max(1, Math.ceil(noteCount / rings)))
      const angle = (Math.PI * 2 * (index % Math.max(1, Math.ceil(noteCount / rings)))) / Math.max(1, Math.ceil(noteCount / rings))
      const orbit = noteRadius + ringIdx * Math.max(24, noteRadius * 0.3)
      positionedNodes.push({
        ...node,
        x: anchor.x + Math.cos(angle) * orbit,
        y: anchor.y + Math.sin(angle) * orbit,
        depth: 1,
        clusterId,
        clusterIndex,
        clusterLabel: folderNode?.title || clusterId
      })
    }
  }

  positionedNodes.sort((a, b) => {
    if ((a.kind || a.type) !== (b.kind || b.type)) {
      return (a.kind || a.type) === 'folder' ? -1 : 1
    }
    return String(a.title || '').localeCompare(String(b.title || ''))
  })
  const knowledgePositionedNodes = applyWikiKnowledgeLayout({ nodes: positionedNodes, edges, width, height })

  const edgeCounts = new Map()
  const atomCluster = new Map()
  for (const node of knowledgePositionedNodes) {
    atomCluster.set(node.id, node.clusterId)
  }

  for (const edge of edges) {
    edgeCounts.set(edge.source, (edgeCounts.get(edge.source) || 0) + 1)
    edgeCounts.set(edge.target, (edgeCounts.get(edge.target) || 0) + 1)
  }

  return {
    nodes: knowledgePositionedNodes,
    edges,
    clusters,
    edgeCounts,
    maxEdges: Math.max(1, ...edgeCounts.values(), 1),
    atomCluster,
    clusterIndexMap,
    nodeMap: byId
  }
}

export const buildSemanticViewModel = ({
  graph = null,
  fallback = null,
  savedPositions = {},
  width = 1800,
  height = 1200
} = {}) => {
  const source = graph?.nodes?.length ? graph : fallback || { nodes: [], edges: [], clusters: [] }
  const cacheKey = `${width}x${height}`
  let cached = semanticViewModelCache.get(source)
  if (!cached || cached.cacheKey !== cacheKey) {
    cached = {
      cacheKey,
      base: buildSemanticViewModelBase({ graph: source, width, height })
    }
    if (source && typeof source === 'object') semanticViewModelCache.set(source, cached)
  }

  const base = cached.base
  const knowledgeBoundIds = new Set(
    base.edges
      .filter((edge) => WIKI_LAYOUT_EDGE_TYPES.has(edge.type))
      .flatMap((edge) => [edge.source, edge.target])
  )
  const hasSavedPositions = savedPositions && Object.keys(savedPositions).length > 0
  if (!hasSavedPositions) return base

  return {
    ...base,
    nodes: base.nodes.map((node) => {
      if (knowledgeBoundIds.has(node.id)) return node
      const saved = savedPositions[node.id]
      if (!saved) return node
      const x = Number.isFinite(saved.x) ? saved.x : node.x
      const y = Number.isFinite(saved.y) ? saved.y : node.y
      if (x === node.x && y === node.y) return node
      return { ...node, x, y }
    })
  }
}

export const buildSemanticNeighborhood = ({
  graph = null,
  fallback = null,
  centerId = '',
  depth = 1,
  maxNodes = 24
} = {}) => {
  const resolved = resolveSemanticGraph(graph, fallback)
  const byId = new Map(resolved.nodes.map((node) => [node.id, node]))
  const center = byId.get(normalizeNodeId({ id: centerId })) || null
  if (!center) {
    return {
      center: null,
      nodes: [],
      edges: [],
      clusters: resolved.clusters,
      nodeMap: byId
    }
  }

  const allowed = new Set([center.id])
  const frontier = new Set([center.id])
  const edges = []

  for (let currentDepth = 0; currentDepth < Math.max(1, depth); currentDepth += 1) {
    const nextFrontier = new Set()
    for (const edge of resolved.edges) {
      const sourceSeen = frontier.has(edge.source)
      const targetSeen = frontier.has(edge.target)
      if (!sourceSeen && !targetSeen) continue
      edges.push(edge)
      const otherId = sourceSeen ? edge.target : edge.source
      if (!allowed.has(otherId) && byId.has(otherId) && allowed.size < maxNodes) {
        allowed.add(otherId)
        nextFrontier.add(otherId)
      }
    }
    frontier.clear()
    for (const id of nextFrontier) frontier.add(id)
    if (!frontier.size) break
  }

  const nodes = [...allowed].map((id) => byId.get(id)).filter(Boolean)
  const uniqueEdges = []
  const seenEdges = new Set()
  for (const edge of edges) {
    const key = `${edge.source}::${edge.target}::${edge.type}::${edge.reason}`
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    uniqueEdges.push(edge)
  }

  return {
    center,
    nodes,
    edges: uniqueEdges,
    clusters: resolved.clusters,
    nodeMap: byId
  }
}

const buildClusters = (nodes = []) => {
  const clusterMap = new Map()
  for (const node of nodes) {
    const clusterId = groupNodeCluster(node)
    if (!clusterMap.has(clusterId)) {
      clusterMap.set(clusterId, {
        id: clusterId,
        label: clusterId === 'root' ? 'Root' : String(clusterId).split('/').pop() || clusterId,
        paths: [],
        nodeCount: 0,
        tags: []
      })
    }
    const cluster = clusterMap.get(clusterId)
    cluster.paths.push(node.id)
    cluster.nodeCount += 1
  }
  return [...clusterMap.values()]
}

export const buildGraphFromVaultEntries = (entries = []) => {
  if (Array.isArray(entries) && vaultGraphCache.has(entries)) return vaultGraphCache.get(entries)
  const noteEntries = entries.filter((entry) => {
    const kind = entry.kind || entry.type || 'note'
    return kind === 'note' || (entry.path || '').endsWith('.md')
  })
  const nodes = noteEntries.map((entry) => {
    const relativePath = String(entry.path || entry.relativePath || entry.id || '').trim()
    const title = String(entry.title || relativePath.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled').trim()
    const folderPath = relativePath.includes('/')
      ? relativePath.split('/').slice(0, -1).join('/')
      : 'root'
    return {
      id: relativePath,
      path: relativePath,
      relativePath,
      title,
      kind: 'note',
      type: 'note',
      summary: '',
      tags: Array.isArray(entry.tags) ? entry.tags : [],
      sourceCount: 0,
      chunkCount: 0,
      updatedAt: entry.updatedAt || entry.modifiedAt || '',
      cluster: folderPath
    }
  })
  const folderSet = new Set()
  for (const node of nodes) {
    const folder = node.cluster
    if (folder && folder !== 'root') folderSet.add(folder)
  }
  const folderNodes = [...folderSet].map((folderPath) => ({
    id: folderPath,
    path: folderPath,
    relativePath: folderPath,
    title: folderPath.split('/').pop() || folderPath,
    kind: 'folder',
    type: 'folder',
    summary: '',
    tags: [],
    sourceCount: 0,
    chunkCount: 0
  }))
  const allNodes = [...folderNodes, ...nodes]
  const edges = []
  for (const node of nodes) {
    const folder = node.cluster
    if (folder && folder !== 'root') {
      edges.push({
        source: folder,
        target: node.id,
        type: 'folder',
        reason: 'folder',
        weight: 0.3
      })
    }
  }
  const byTag = new Map()
  for (const node of nodes) {
    for (const tag of node.tags) {
      if (!tag) continue
      if (!byTag.has(tag)) byTag.set(tag, [])
      byTag.get(tag).push(node)
    }
  }
  for (const [tag, tagged] of byTag.entries()) {
    if (tagged.length < 2) continue
    for (let i = 1; i < tagged.length; i++) {
      edges.push({
        source: tagged[0].id,
        target: tagged[i].id,
        type: 'tag',
        reason: `#${tag}`,
        weight: 0.5
      })
    }
  }
  const clusters = []
  const byFolder = new Map()
  for (const node of nodes) {
    const folder = node.cluster || 'root'
    if (!byFolder.has(folder)) {
      byFolder.set(folder, {
        id: folder,
        label: folder === 'root' ? 'Root' : folder.split('/').pop() || folder,
        paths: [],
        nodeCount: 0,
        tags: []
      })
    }
    const c = byFolder.get(folder)
    c.paths.push(node.id)
    c.nodeCount += 1
  }
  for (const c of byFolder.values()) {
    clusters.push({ id: c.id, label: c.label, paths: c.paths, nodeCount: c.nodeCount, tags: c.tags })
  }
  const result = { nodes: allNodes, edges, clusters }
  if (Array.isArray(entries)) vaultGraphCache.set(entries, result)
  return result
}

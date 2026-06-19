const normalizeNodeId = (node = {}) => String(node.relativePath || node.path || node.id || '').trim()

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

const normalizeGraphEdge = (edge = {}) => ({
  ...edge,
  source: String(edge.source || '').trim(),
  target: String(edge.target || '').trim(),
  type: String(edge.type || 'semantic').trim(),
  reason: String(edge.reason || edge.type || 'semantic').trim(),
  weight: Number(edge.weight ?? edge.score ?? 0) || 0
})

const groupNodeCluster = (node = {}) => {
  if ((node.kind || node.type) === 'folder') return node.id
  const path = String(node.relativePath || node.path || node.id || '').trim()
  const folder = path.includes('/') ? path.split('/').slice(0, -1).join('/') : 'root'
  return folder || 'root'
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
    clusters: Array.isArray(source.clusters) ? source.clusters.map((cluster) => ({
      ...cluster,
      id: String(cluster.id || '').trim(),
      label: String(cluster.label || cluster.id || '').trim(),
      paths: Array.isArray(cluster.paths) ? cluster.paths.map((path) => String(path || '').trim()).filter(Boolean) : []
    })) : []
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
    return edge.type === 'semantic' || edge.type === 'explicit-link'
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

export const buildSemanticViewModel = ({
  graph = null,
  fallback = null,
  savedPositions = {},
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
  const clusterRadius = Math.max(140, Math.min(width, height) * 0.28)
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
    const noteRadius = Math.max(72, 54 + Math.min(noteNodes.length, 8) * 10)
    const clusterIndex = clusterIndexMap.get(clusterId) || 0

    if (folderNode) {
      positionedNodes.push({
        ...folderNode,
        x: savedPositions[folderNode.id]?.x ?? anchor.x,
        y: savedPositions[folderNode.id]?.y ?? anchor.y,
        depth: 0,
        clusterId,
        clusterIndex,
        clusterLabel: folderNode.title || clusterId
      })
    }

    const noteCount = Math.max(1, noteNodes.length)
    for (let index = 0; index < noteNodes.length; index += 1) {
      const node = noteNodes[index]
      const angle = (Math.PI * 2 * index) / noteCount
      const orbit = noteRadius + (index % 3) * 12
      positionedNodes.push({
        ...node,
        x: savedPositions[node.id]?.x ?? anchor.x + Math.cos(angle) * orbit,
        y: savedPositions[node.id]?.y ?? anchor.y + Math.sin(angle) * orbit,
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

  const edgeCounts = new Map()
  const atomCluster = new Map()
  for (const node of positionedNodes) {
    atomCluster.set(node.id, node.clusterId)
  }

  for (const edge of edges) {
    edgeCounts.set(edge.source, (edgeCounts.get(edge.source) || 0) + 1)
    edgeCounts.set(edge.target, (edgeCounts.get(edge.target) || 0) + 1)
  }

  return {
    nodes: positionedNodes,
    edges,
    clusters,
    edgeCounts,
    maxEdges: Math.max(1, ...edgeCounts.values(), 1),
    atomCluster,
    clusterIndexMap,
    nodeMap: byId
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

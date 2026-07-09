export const GRAPH_WIDTH = 800
export const GRAPH_HEIGHT = 520
export const MIN_CAMERA_SCALE = 0.35
export const MAX_CAMERA_SCALE = 4

const normalizeWeight = (edge = {}) => {
  const value = Number(edge.weight ?? edge.score ?? edge.confidence ?? 0)
  return Number.isFinite(value) ? value : 0
}

const edgeKey = (edge = {}) => `${edge.source}::${edge.target}::${edge.type || ''}::${edge.reason || ''}`

export const clampCameraScale = (scale) => Math.min(
  MAX_CAMERA_SCALE,
  Math.max(MIN_CAMERA_SCALE, Number.isFinite(scale) ? scale : 1)
)

export const buildAdjacency = (nodes = [], edges = []) => {
  const nodeIds = new Set(nodes.map((node) => node.id))
  const adjacency = new Map(nodes.map((node) => [node.id, []]))
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue
    adjacency.get(edge.source)?.push({ nodeId: edge.target, edge })
    adjacency.get(edge.target)?.push({ nodeId: edge.source, edge })
  }
  for (const connections of adjacency.values()) {
    connections.sort((left, right) => {
      const weightDelta = normalizeWeight(right.edge) - normalizeWeight(left.edge)
      if (weightDelta !== 0) return weightDelta
      return String(left.nodeId).localeCompare(String(right.nodeId))
    })
  }
  return adjacency
}

export const buildSemanticNeighborhood = ({
  nodes = [],
  edges = [],
  centerId = '',
  depth = 1,
  maxNodes = 64
} = {}) => {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const center = byId.get(centerId) || null
  if (!center) {
    return { center: null, nodes: [], edges: [], distances: new Map(), adjacency: new Map() }
  }

  const adjacency = buildAdjacency(nodes, edges)
  const distances = new Map([[centerId, 0]])
  const queue = [centerId]
  while (queue.length && distances.size < Math.max(1, maxNodes)) {
    const currentId = queue.shift()
    const currentDepth = distances.get(currentId) || 0
    if (currentDepth >= Math.max(1, depth)) continue
    for (const connection of adjacency.get(currentId) || []) {
      if (distances.has(connection.nodeId)) continue
      distances.set(connection.nodeId, currentDepth + 1)
      queue.push(connection.nodeId)
      if (distances.size >= Math.max(1, maxNodes)) break
    }
  }

  const visibleIds = new Set(distances.keys())
  const visibleNodes = [...visibleIds]
    .map((id) => byId.get(id))
    .filter(Boolean)
  const seenEdges = new Set()
  const visibleEdges = []
  for (const edge of edges) {
    if (!visibleIds.has(edge.source) || !visibleIds.has(edge.target)) continue
    const key = edgeKey(edge)
    if (seenEdges.has(key)) continue
    seenEdges.add(key)
    visibleEdges.push(edge)
  }

  return {
    center,
    nodes: visibleNodes,
    edges: visibleEdges,
    distances,
    adjacency
  }
}

const strongestDepthOneParent = ({ nodeId, adjacency, distances }) => {
  let best = null
  for (const connection of adjacency.get(nodeId) || []) {
    if (distances.get(connection.nodeId) !== 1) continue
    const candidate = {
      id: connection.nodeId,
      weight: normalizeWeight(connection.edge)
    }
    if (!best || candidate.weight > best.weight || (candidate.weight === best.weight && candidate.id < best.id)) {
      best = candidate
    }
  }
  return best?.id || null
}

export const layoutSemanticNeighborhood = ({
  nodes = [],
  edges = [],
  centerId = '',
  distances = new Map(),
  width = GRAPH_WIDTH,
  height = GRAPH_HEIGHT
} = {}) => {
  const centerX = width / 2
  const centerY = height / 2
  const positions = new Map()
  const adjacency = buildAdjacency(nodes, edges)
  const depthOne = nodes
    .filter((node) => distances.get(node.id) === 1)
    .sort((left, right) => String(left.title || left.id).localeCompare(String(right.title || right.id)))
  const depthTwo = nodes
    .filter((node) => (distances.get(node.id) || 0) >= 2)
    .sort((left, right) => String(left.title || left.id).localeCompare(String(right.title || right.id)))

  positions.set(centerId, { x: centerX, y: centerY, depth: 0 })
  const innerRadius = Math.min(width, height) * 0.27
  const outerRadius = Math.min(width, height) * 0.44
  const depthOneAngles = new Map()

  depthOne.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, depthOne.length)
    depthOneAngles.set(node.id, angle)
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * innerRadius,
      y: centerY + Math.sin(angle) * innerRadius,
      depth: 1
    })
  })

  const childrenByParent = new Map()
  const orphans = []
  for (const node of depthTwo) {
    const parentId = strongestDepthOneParent({ nodeId: node.id, adjacency, distances })
    if (!parentId) {
      orphans.push(node)
      continue
    }
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, [])
    childrenByParent.get(parentId).push(node)
  }

  for (const [parentId, children] of childrenByParent.entries()) {
    const parentAngle = depthOneAngles.get(parentId) ?? -Math.PI / 2
    const fanWidth = Math.min(Math.PI / 2.5, Math.max(Math.PI / 7, (Math.PI * 2) / Math.max(6, depthOne.length) * 0.72))
    children.forEach((node, index) => {
      const offset = children.length === 1
        ? 0
        : -fanWidth / 2 + (fanWidth * index) / (children.length - 1)
      const angle = parentAngle + offset
      positions.set(node.id, {
        x: centerX + Math.cos(angle) * outerRadius,
        y: centerY + Math.sin(angle) * outerRadius,
        depth: distances.get(node.id) || 2,
        parentId
      })
    })
  }

  orphans.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(1, orphans.length)
    positions.set(node.id, {
      x: centerX + Math.cos(angle) * outerRadius,
      y: centerY + Math.sin(angle) * outerRadius,
      depth: distances.get(node.id) || 2
    })
  })

  return nodes.map((node) => ({
    ...node,
    ...(positions.get(node.id) || { x: centerX, y: centerY, depth: distances.get(node.id) || 0 })
  }))
}

export const fitCameraToNodes = ({
  nodes = [],
  width = GRAPH_WIDTH,
  height = GRAPH_HEIGHT,
  padding = 72
} = {}) => {
  if (!nodes.length) return { x: 0, y: 0, scale: 1 }
  const xs = nodes.map((node) => Number(node.x) || 0)
  const ys = nodes.map((node) => Number(node.y) || 0)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const graphWidth = Math.max(1, maxX - minX)
  const graphHeight = Math.max(1, maxY - minY)
  const scale = clampCameraScale(Math.min(
    (width - padding * 2) / graphWidth,
    (height - padding * 2) / graphHeight,
    2.2
  ))
  const centerX = (minX + maxX) / 2
  const centerY = (minY + maxY) / 2
  return {
    x: width / 2 - centerX * scale,
    y: height / 2 - centerY * scale,
    scale
  }
}

export const focusCameraOnNode = ({
  node,
  currentScale = 1,
  width = GRAPH_WIDTH,
  height = GRAPH_HEIGHT,
  targetScale = 1.55
} = {}) => {
  const scale = clampCameraScale(Math.max(currentScale, targetScale))
  return {
    x: width / 2 - (Number(node?.x) || 0) * scale,
    y: height / 2 - (Number(node?.y) || 0) * scale,
    scale
  }
}

export const zoomCameraAtPoint = ({ camera, point, nextScale }) => {
  const previousScale = clampCameraScale(camera?.scale || 1)
  const scale = clampCameraScale(nextScale)
  const pointX = Number(point?.x) || 0
  const pointY = Number(point?.y) || 0
  const worldX = (pointX - (Number(camera?.x) || 0)) / previousScale
  const worldY = (pointY - (Number(camera?.y) || 0)) / previousScale
  return {
    x: pointX - worldX * scale,
    y: pointY - worldY * scale,
    scale
  }
}

export const pushSemanticHistory = ({ history = [], index = -1, nodeId = '' } = {}) => {
  if (!nodeId) return { history: [...history], index }
  if (history[index] === nodeId) return { history: [...history], index }
  const nextHistory = [...history.slice(0, index + 1), nodeId]
  return { history: nextHistory, index: nextHistory.length - 1 }
}

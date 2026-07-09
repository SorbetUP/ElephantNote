<template>
  <section class="en-workspace-view">
    <header class="en-graph-hero">
      <div>
        <p class="en-graph-kicker">
          {{ semanticCenter ? 'Local semantic exploration' : 'Knowledge map' }}
        </p>
        <h1>{{ semanticCenter?.title || 'Graph overview' }}</h1>
        <p>
          {{ displayGraph.nodes.length }} visible notes · {{ displayGraph.edges.length }} visible links
          <span v-if="!semanticCenter && semanticGraph?.clusters?.length"> · {{ semanticGraph.clusters.length }} clusters</span>
          <span v-if="semanticCenter"> · depth {{ semanticDepth }}</span>
        </p>
      </div>
      <div class="en-graph-summary">
        <span>{{ graphSummary.semantic }} semantic</span>
        <span>{{ graphSummary.explicit }} explicit</span>
        <span>{{ graph.nodes.length }} total notes</span>
      </div>
    </header>

    <div
      v-if="graph.nodes.length"
      class="en-graph-layout"
    >
      <div class="en-graph-stage-wrap">
        <div class="en-graph-toolbar">
          <div class="en-graph-toolbar-group">
            <button
              type="button"
              :disabled="!canGoBack"
              title="Previous semantic center"
              @click="goSemanticBack"
            >
              ←
            </button>
            <button
              type="button"
              :disabled="!canGoForward"
              title="Next semantic center"
              @click="goSemanticForward"
            >
              →
            </button>
            <button
              type="button"
              :class="{ active: !semanticCenterId }"
              @click="leaveSemanticMode"
            >
              Global map
            </button>
          </div>

          <div
            v-if="semanticCenter"
            class="en-graph-toolbar-group"
          >
            <span>Depth</span>
            <button
              type="button"
              :class="{ active: semanticDepth === 1 }"
              @click="setSemanticDepth(1)"
            >
              1
            </button>
            <button
              type="button"
              :class="{ active: semanticDepth === 2 }"
              @click="setSemanticDepth(2)"
            >
              2
            </button>
          </div>

          <div class="en-graph-toolbar-group en-graph-camera-controls">
            <button
              type="button"
              title="Zoom out"
              @click="zoomBy(0.82)"
            >
              −
            </button>
            <button
              type="button"
              title="Fit visible graph"
              @click="fitGraph()"
            >
              Fit
            </button>
            <button
              type="button"
              title="Zoom in"
              @click="zoomBy(1.22)"
            >
              +
            </button>
            <span>{{ zoomPercent }}%</span>
          </div>
        </div>

        <svg
          ref="graphSvg"
          class="en-graph-canvas"
          viewBox="0 0 800 520"
          role="img"
          aria-label="Interactive knowledge graph"
          tabindex="0"
          @wheel.prevent="handleWheel"
          @pointerdown="startPan"
          @pointermove="movePan"
          @pointerup="endPan"
          @pointercancel="endPan"
          @click="handleStageClick"
          @keydown="handleKeydown"
        >
          <g :transform="cameraTransform">
            <line
              v-for="edge in positionedEdges"
              :key="`${edge.source.id}-${edge.target.id}-${edge.reason}`"
              :class="[
                edge.type,
                {
                  active: isEdgeActive(edge),
                  dimmed: isEdgeDimmed(edge)
                }
              ]"
              :x1="edge.source.x"
              :y1="edge.source.y"
              :x2="edge.target.x"
              :y2="edge.target.y"
            />
            <g
              v-for="node in positionedNodes"
              :key="node.id"
              class="en-graph-node"
              :class="[
                node.kind,
                {
                  selected: selectedNode?.id === node.id,
                  center: semanticCenterId === node.id,
                  neighbor: isNodeNeighbor(node.id),
                  dimmed: isNodeDimmed(node.id)
                }
              ]"
              role="button"
              tabindex="0"
              :aria-label="`Select ${node.title}`"
              @pointerdown.stop
              @mouseenter="hoveredNodeId = node.id"
              @mouseleave="hoveredNodeId = ''"
              @click.stop="handleNodeClick(node, $event)"
              @dblclick.stop.prevent="handleNodeDoubleClick(node, $event)"
              @keydown.enter.prevent="selectAndFocusNode(node)"
            >
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="nodeRadius(node)"
              />
              <text
                :x="node.x"
                :y="node.y + nodeRadius(node) + 20"
                text-anchor="middle"
              >
                {{ truncateTitle(node.title) }}
              </text>
            </g>
          </g>
        </svg>

        <div class="en-graph-stage-hint">
          Drag to pan · wheel to zoom · click to inspect · double-click to open
          <span v-if="semanticCenter"> · click a neighbor to recenter</span>
        </div>
      </div>

      <aside class="en-graph-panel">
        <template v-if="selectedNode">
          <div class="en-graph-panel-head">
            <div>
              <p class="en-graph-kicker">
                {{ selectedNode.id === semanticCenterId ? 'Semantic center' : 'Selected note' }}
              </p>
              <h2>{{ selectedNode.title }}</h2>
              <p>{{ selectedNode.summary || 'No summary yet.' }}</p>
            </div>
            <button
              type="button"
              @click="openNode(selectedNode)"
            >
              Open note
            </button>
          </div>

          <div class="en-graph-panel-actions">
            <button
              type="button"
              :disabled="selectedNode.id === semanticCenterId"
              @click="exploreSelectedNode"
            >
              {{ selectedNode.id === semanticCenterId ? 'Current center' : 'Explore around' }}
            </button>
            <button
              type="button"
              @click="focusSelectedNode"
            >
              Center camera
            </button>
          </div>

          <div class="en-graph-node-meta">
            <span>{{ selectedNode.kind || 'note' }}</span>
            <span>{{ selectedRelatedNodes.length }} connections</span>
            <span>{{ selectedNode.chunkCount || 0 }} chunks</span>
            <span v-if="selectedNode.cluster">{{ selectedNode.cluster }}</span>
          </div>

          <section
            v-if="selectedNode.sources?.length"
            class="en-graph-section"
          >
            <h3>Sources</h3>
            <button
              v-for="source in selectedNode.sources"
              :key="source.path || source.url || source.title"
              type="button"
              class="en-graph-source-pill"
              @click="selectSource(source)"
            >
              {{ source.title || source.path || source.url }}
            </button>
          </section>

          <section
            v-if="selectedSource"
            class="en-graph-source-card"
          >
            <div class="en-graph-panel-head">
              <div>
                <p class="en-graph-kicker">Source detail</p>
                <h3>{{ selectedSource.title }}</h3>
              </div>
              <button
                type="button"
                @click="openSelectedSource"
              >
                Open
              </button>
            </div>
            <p>{{ selectedSource.excerpt || selectedSource.summary || selectedSource.path || 'Source' }}</p>
          </section>

          <section
            v-if="selectedRelatedNodes.length"
            class="en-graph-section"
          >
            <h3>Connected notes</h3>
            <div class="en-graph-related-grid">
              <button
                v-for="node in selectedRelatedNodes"
                :key="node.id"
                type="button"
                class="en-graph-related-card"
                @click="selectAndFocusNode(node)"
                @dblclick.prevent="openNode(node)"
              >
                <strong>{{ node.title }}</strong>
                <span>{{ node.summary || node.kind || 'note' }}</span>
                <small>{{ node.linkTypes.join(', ') }}</small>
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <p class="en-empty-view">
            Select a note to inspect its links. Use “Explore around” to switch to an Atomic-style local graph.
          </p>
        </template>
      </aside>
    </div>

    <p
      v-else
      class="en-empty-view"
    >
      Rebuild the knowledge index to visualize note relationships.
    </p>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import log from '@/platform/runtimeLogShim'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { buildSemanticGraphSurface, buildSemanticViewModel } from './semanticGraphViewHelpers'
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  buildAdjacency,
  buildSemanticNeighborhood,
  fitCameraToNodes,
  focusCameraOnNode,
  layoutSemanticNeighborhood,
  pushSemanticHistory,
  zoomCameraAtPoint
} from './graphNavigationHelpers'

const store = useVaultStore()
const searchStore = useSearchStore()
const graphSvg = ref(null)
const selectedNode = ref(null)
const selectedSource = ref(null)
const selectedRelatedNodes = ref([])
const hoveredNodeId = ref('')
const semanticCenterId = ref('')
const semanticDepth = ref(1)
const semanticHistory = ref([])
const semanticHistoryIndex = ref(-1)
const camera = ref({ x: 0, y: 0, scale: 1 })
const panState = ref(null)
const dragMoved = ref(false)
let cameraAnimationFrame = null
let nodeClickTimer = null

const semanticGraph = computed(() => buildSemanticGraphSurface({
  graph: searchStore.indexInspection?.graph,
  includeStructure: false
}))

const graph = computed(() => semanticGraph.value?.nodes?.length
  ? semanticGraph.value
  : { nodes: [], edges: [], clusters: [] })

const semanticCenter = computed(() => graph.value.nodes.find((node) => node.id === semanticCenterId.value) || null)
const displayGraph = computed(() => {
  if (!semanticCenterId.value) {
    return {
      center: null,
      nodes: graph.value.nodes,
      edges: graph.value.edges,
      distances: new Map(),
      adjacency: buildAdjacency(graph.value.nodes, graph.value.edges)
    }
  }
  return buildSemanticNeighborhood({
    nodes: graph.value.nodes,
    edges: graph.value.edges,
    centerId: semanticCenterId.value,
    depth: semanticDepth.value,
    maxNodes: semanticDepth.value === 1 ? 32 : 72
  })
})

const graphSummary = computed(() => ({
  semantic: graph.value.edges.filter((edge) => edge.type === 'semantic').length,
  explicit: graph.value.edges.filter((edge) => edge.type === 'explicit-link').length
}))

const positionedNodes = computed(() => {
  if (semanticCenterId.value) {
    return layoutSemanticNeighborhood({
      nodes: displayGraph.value.nodes,
      edges: displayGraph.value.edges,
      centerId: semanticCenterId.value,
      distances: displayGraph.value.distances,
      width: GRAPH_WIDTH,
      height: GRAPH_HEIGHT
    })
  }
  return buildSemanticViewModel({
    graph: {
      nodes: displayGraph.value.nodes,
      edges: displayGraph.value.edges,
      clusters: graph.value.clusters
    },
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT
  }).nodes
})

const positionedEdges = computed(() => {
  const byId = new Map(positionedNodes.value.map((node) => [node.id, node]))
  return displayGraph.value.edges
    .map((edge) => ({
      ...edge,
      source: byId.get(edge.source),
      target: byId.get(edge.target)
    }))
    .filter((edge) => edge.source && edge.target)
})

const interactionAnchorId = computed(() => hoveredNodeId.value || selectedNode.value?.id || '')
const interactionNeighborIds = computed(() => {
  const anchorId = interactionAnchorId.value
  if (!anchorId) return new Set()
  return new Set((displayGraph.value.adjacency.get(anchorId) || []).map((entry) => entry.nodeId))
})
const cameraTransform = computed(() => `translate(${camera.value.x} ${camera.value.y}) scale(${camera.value.scale})`)
const zoomPercent = computed(() => Math.round(camera.value.scale * 100))
const canGoBack = computed(() => !!semanticCenterId.value)
const canGoForward = computed(() => semanticHistoryIndex.value < semanticHistory.value.length - 1)

const nodeRadius = (node) => {
  if (node.id === semanticCenterId.value) return 22
  const connectionCount = displayGraph.value.adjacency.get(node.id)?.length || 0
  return 13 + Math.min(7, connectionCount * 1.1)
}

const truncateTitle = (title = '') => title.length > 28 ? `${title.slice(0, 27)}…` : title

const isNodeNeighbor = (nodeId) => interactionNeighborIds.value.has(nodeId)
const isNodeDimmed = (nodeId) => {
  const anchorId = interactionAnchorId.value
  if (!anchorId) return false
  return nodeId !== anchorId && !interactionNeighborIds.value.has(nodeId)
}
const isEdgeActive = (edge) => {
  const anchorId = interactionAnchorId.value
  return !!anchorId && (edge.source.id === anchorId || edge.target.id === anchorId)
}
const isEdgeDimmed = (edge) => !!interactionAnchorId.value && !isEdgeActive(edge)

const updateRelatedNodes = (nodeId) => {
  const byId = new Map(graph.value.nodes.map((node) => [node.id, node]))
  const related = new Map()
  for (const edge of graph.value.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue
    const otherId = edge.source === nodeId ? edge.target : edge.source
    const node = byId.get(otherId)
    if (!node) continue
    const current = related.get(otherId) || {
      ...node,
      linkTypes: new Set()
    }
    current.linkTypes.add(edge.type || 'related')
    related.set(otherId, current)
  }
  selectedRelatedNodes.value = [...related.values()]
    .sort((left, right) => String(left.title).localeCompare(String(right.title)))
    .slice(0, 12)
    .map((entry) => ({ ...entry, linkTypes: [...entry.linkTypes] }))
}

const selectNode = (node) => {
  selectedNode.value = node
  selectedSource.value = null
  updateRelatedNodes(node.id)
  log.info('[Graph] node:select', {
    nodeId: node.id,
    semanticCenterId: semanticCenterId.value || null,
    connectionCount: selectedRelatedNodes.value.length
  })
}

const openNode = (node) => {
  if ((node?.kind || 'note') !== 'note' || !node?.id) return
  const note = [...store.rootEntries, ...store.entries, ...store.openedNotes]
    .find((entry) => entry.path === node.id) || {
    path: node.id,
    title: node.title || node.id.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled',
    kind: 'note',
    type: 'note'
  }
  log.info('[Graph] node:open', { nodeId: node.id })
  store.openNote(note)
}

const selectSource = (source) => {
  selectedSource.value = source
}

const openSelectedSource = async() => {
  const source = selectedSource.value
  if (!source) return
  if (source.url) {
    await elephantnoteClient.sitePreview.openExternal(source.url)
    return
  }
  if (source.path) openNode({ id: source.path, title: source.title, kind: 'note' })
}

const cancelCameraAnimation = () => {
  if (cameraAnimationFrame !== null) cancelAnimationFrame(cameraAnimationFrame)
  cameraAnimationFrame = null
}

const animateCamera = (target, duration = 260) => {
  cancelCameraAnimation()
  const start = { ...camera.value }
  const startedAt = performance.now()
  const tick = (time) => {
    const progress = Math.min(1, (time - startedAt) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    camera.value = {
      x: start.x + (target.x - start.x) * eased,
      y: start.y + (target.y - start.y) * eased,
      scale: start.scale + (target.scale - start.scale) * eased
    }
    if (progress < 1) cameraAnimationFrame = requestAnimationFrame(tick)
    else cameraAnimationFrame = null
  }
  cameraAnimationFrame = requestAnimationFrame(tick)
}

const fitGraph = (animate = true) => {
  const target = fitCameraToNodes({
    nodes: positionedNodes.value,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT,
    padding: semanticCenterId.value ? 62 : 86
  })
  if (animate) animateCamera(target)
  else camera.value = target
  log.info('[Graph] camera:fit', {
    semanticCenterId: semanticCenterId.value || null,
    nodeCount: positionedNodes.value.length,
    targetScale: target.scale
  })
}

const focusPositionedNode = (node, animate = true) => {
  const positioned = positionedNodes.value.find((entry) => entry.id === node?.id)
  if (!positioned) return
  const target = focusCameraOnNode({
    node: positioned,
    currentScale: camera.value.scale,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT,
    targetScale: semanticCenterId.value ? 1.4 : 1.55
  })
  if (animate) animateCamera(target)
  else camera.value = target
}

const selectAndFocusNode = (node) => {
  selectNode(node)
  focusPositionedNode(node)
}

const navigateSemantic = async(nodeId, { record = true } = {}) => {
  const node = graph.value.nodes.find((entry) => entry.id === nodeId)
  if (!node) return
  if (record) {
    const next = pushSemanticHistory({
      history: semanticHistory.value,
      index: semanticHistoryIndex.value,
      nodeId
    })
    semanticHistory.value = next.history
    semanticHistoryIndex.value = next.index
  }
  semanticCenterId.value = nodeId
  selectNode(node)
  log.info('[Graph] semantic:navigate', {
    nodeId,
    depth: semanticDepth.value,
    historyIndex: semanticHistoryIndex.value,
    historyLength: semanticHistory.value.length
  })
  await nextTick()
  fitGraph()
}

const exploreSelectedNode = () => {
  if (selectedNode.value) navigateSemantic(selectedNode.value.id)
}

const focusSelectedNode = () => {
  if (selectedNode.value) focusPositionedNode(selectedNode.value)
}

const leaveSemanticMode = async() => {
  if (!semanticCenterId.value) {
    fitGraph()
    return
  }
  log.info('[Graph] semantic:leave', { previousCenterId: semanticCenterId.value })
  semanticCenterId.value = ''
  semanticHistoryIndex.value = -1
  await nextTick()
  fitGraph()
}

const goSemanticBack = async() => {
  if (!semanticCenterId.value) return
  if (semanticHistoryIndex.value <= 0) {
    await leaveSemanticMode()
    return
  }
  semanticHistoryIndex.value -= 1
  await navigateSemantic(semanticHistory.value[semanticHistoryIndex.value], { record: false })
}

const goSemanticForward = async() => {
  if (!canGoForward.value) return
  semanticHistoryIndex.value += 1
  await navigateSemantic(semanticHistory.value[semanticHistoryIndex.value], { record: false })
}

const setSemanticDepth = async(depth) => {
  semanticDepth.value = depth
  log.info('[Graph] semantic:depth', {
    centerId: semanticCenterId.value || null,
    depth
  })
  await nextTick()
  fitGraph()
}

const handleNodeClick = (node) => {
  if (nodeClickTimer !== null) clearTimeout(nodeClickTimer)
  nodeClickTimer = setTimeout(() => {
    nodeClickTimer = null
    if (semanticCenterId.value && node.id !== semanticCenterId.value) {
      navigateSemantic(node.id)
      return
    }
    selectAndFocusNode(node)
  }, 210)
}

const handleNodeDoubleClick = (node) => {
  if (nodeClickTimer !== null) clearTimeout(nodeClickTimer)
  nodeClickTimer = null
  openNode(node)
}

const zoomBy = (factor, point = { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 }) => {
  cancelCameraAnimation()
  camera.value = zoomCameraAtPoint({
    camera: camera.value,
    point,
    nextScale: camera.value.scale * factor
  })
}

const pointerToGraphPoint = (clientX, clientY) => {
  const rect = graphSvg.value?.getBoundingClientRect()
  if (!rect) return { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 }
  return {
    x: ((clientX - rect.left) / Math.max(1, rect.width)) * GRAPH_WIDTH,
    y: ((clientY - rect.top) / Math.max(1, rect.height)) * GRAPH_HEIGHT
  }
}

const handleWheel = (event) => {
  const factor = Math.exp(-event.deltaY * 0.0014)
  zoomBy(factor, pointerToGraphPoint(event.clientX, event.clientY))
}

const startPan = (event) => {
  if (event.button !== 0) return
  cancelCameraAnimation()
  const rect = graphSvg.value?.getBoundingClientRect()
  if (!rect) return
  graphSvg.value.setPointerCapture?.(event.pointerId)
  dragMoved.value = false
  panState.value = {
    pointerId: event.pointerId,
    clientX: event.clientX,
    clientY: event.clientY,
    cameraX: camera.value.x,
    cameraY: camera.value.y,
    width: rect.width,
    height: rect.height
  }
}

const movePan = (event) => {
  const state = panState.value
  if (!state || state.pointerId !== event.pointerId) return
  const deltaX = ((event.clientX - state.clientX) / Math.max(1, state.width)) * GRAPH_WIDTH
  const deltaY = ((event.clientY - state.clientY) / Math.max(1, state.height)) * GRAPH_HEIGHT
  if (Math.abs(deltaX) + Math.abs(deltaY) > 2) dragMoved.value = true
  camera.value = {
    ...camera.value,
    x: state.cameraX + deltaX,
    y: state.cameraY + deltaY
  }
}

const endPan = (event) => {
  if (!panState.value || panState.value.pointerId !== event.pointerId) return
  graphSvg.value?.releasePointerCapture?.(event.pointerId)
  panState.value = null
}

const handleStageClick = () => {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }
  selectedNode.value = null
  selectedSource.value = null
  selectedRelatedNodes.value = []
}

const handleKeydown = (event) => {
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomBy(1.22)
  } else if (event.key === '-') {
    event.preventDefault()
    zoomBy(0.82)
  } else if (event.key === '0') {
    event.preventDefault()
    fitGraph()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    if (semanticCenterId.value) leaveSemanticMode()
    else handleStageClick()
  }
}

onMounted(async() => {
  try {
    await searchStore.inspect()
  } finally {
    await nextTick()
    fitGraph(false)
  }
})

watch(() => store.activeVault?.path, async() => {
  semanticCenterId.value = ''
  semanticHistory.value = []
  semanticHistoryIndex.value = -1
  selectedNode.value = null
  await searchStore.inspect().catch(() => {})
  await nextTick()
  fitGraph(false)
})

watch(() => graph.value.nodes.map((node) => node.id).join('|'), async() => {
  if (semanticCenterId.value && !graph.value.nodes.some((node) => node.id === semanticCenterId.value)) {
    semanticCenterId.value = ''
    semanticHistoryIndex.value = -1
  }
  if (selectedNode.value) {
    const refreshed = graph.value.nodes.find((node) => node.id === selectedNode.value.id)
    if (refreshed) selectNode(refreshed)
    else selectedNode.value = null
  }
  await nextTick()
  fitGraph(false)
})

onBeforeUnmount(() => {
  cancelCameraAnimation()
  if (nodeClickTimer !== null) clearTimeout(nodeClickTimer)
})
</script>

<style scoped>
.en-workspace-view {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  padding: 6px 28px 28px;
  overflow: auto;
}

.en-graph-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border: 1px solid var(--en-border);
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--en-primary) 10%, transparent), transparent 36%),
    color-mix(in srgb, var(--en-surface) 94%, transparent);
}

.en-graph-kicker {
  margin: 0 0 8px;
  color: var(--en-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
}

.en-graph-hero h1,
.en-graph-panel h2,
.en-graph-panel h3 {
  margin: 0;
}

.en-graph-hero h1 {
  font-size: 28px;
  line-height: 1.1;
}

.en-graph-hero p,
.en-empty-view {
  margin: 6px 0 0;
  color: var(--en-muted);
}

.en-graph-summary,
.en-graph-toolbar,
.en-graph-toolbar-group,
.en-graph-panel-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.en-graph-summary span,
.en-graph-node-meta span,
.en-graph-toolbar-group > span {
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 5px 10px;
  color: var(--en-muted);
  background: var(--en-bg);
  font-size: 12px;
}

.en-graph-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.72fr);
  gap: 14px;
}

.en-graph-stage-wrap,
.en-graph-panel {
  min-height: 0;
  border: 1px solid var(--en-border);
  border-radius: 20px;
  background: color-mix(in srgb, var(--en-surface) 94%, transparent);
}

.en-graph-stage-wrap {
  position: relative;
  overflow: hidden;
  user-select: none;
}

.en-graph-toolbar {
  position: absolute;
  z-index: 3;
  top: 12px;
  left: 12px;
  right: 12px;
  justify-content: space-between;
  pointer-events: none;
}

.en-graph-toolbar-group {
  padding: 6px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: color-mix(in srgb, var(--en-surface) 92%, transparent);
  box-shadow: 0 8px 24px color-mix(in srgb, #000 12%, transparent);
  pointer-events: auto;
}

.en-graph-toolbar button,
.en-graph-panel button {
  border: 1px solid var(--en-border);
  border-radius: 10px;
  min-height: 34px;
  padding: 0 11px;
  color: var(--en-text);
  background: var(--en-bg);
  cursor: pointer;
}

.en-graph-toolbar button:hover:not(:disabled),
.en-graph-panel button:hover:not(:disabled) {
  border-color: var(--en-border-strong);
  background: var(--en-soft);
}

.en-graph-toolbar button.active,
.en-graph-panel-actions button:first-child:not(:disabled) {
  border-color: color-mix(in srgb, var(--en-primary) 62%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-bg));
}

.en-graph-toolbar button:disabled,
.en-graph-panel button:disabled {
  cursor: default;
  opacity: 0.45;
}

.en-graph-camera-controls {
  margin-left: auto;
}

.en-graph-canvas {
  width: 100%;
  height: 100%;
  min-height: 620px;
  cursor: grab;
  touch-action: none;
  outline: none;
}

.en-graph-canvas:active {
  cursor: grabbing;
}

.en-graph-canvas line {
  stroke: color-mix(in srgb, var(--en-border-strong) 72%, transparent);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
  transition: opacity 150ms ease, stroke 150ms ease;
}

.en-graph-canvas line.semantic {
  stroke: color-mix(in srgb, var(--en-primary) 80%, transparent);
  stroke-width: 1.8;
}

.en-graph-canvas line.explicit-link {
  stroke: color-mix(in srgb, #0f766e 72%, transparent);
  stroke-dasharray: 4 4;
}

.en-graph-canvas line.active {
  stroke-width: 2.8;
  opacity: 1;
}

.en-graph-canvas line.dimmed {
  opacity: 0.08;
}

.en-graph-node {
  cursor: pointer;
  transition: opacity 150ms ease;
  outline: none;
}

.en-graph-node circle {
  fill: var(--en-soft);
  stroke: var(--en-border-strong);
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
  transition: fill 150ms ease, stroke 150ms ease, opacity 150ms ease;
}

.en-graph-node.selected circle,
.en-graph-node:focus circle {
  fill: color-mix(in srgb, var(--en-primary) 16%, var(--en-soft));
  stroke: var(--en-primary);
  stroke-width: 3;
}

.en-graph-node.center circle {
  fill: color-mix(in srgb, var(--en-primary) 28%, var(--en-soft));
  stroke: color-mix(in srgb, var(--en-primary) 88%, white 12%);
  stroke-width: 3.5;
}

.en-graph-node.neighbor circle {
  stroke: color-mix(in srgb, var(--en-primary) 64%, var(--en-border-strong));
}

.en-graph-node.dimmed {
  opacity: 0.18;
}

.en-graph-node text {
  fill: var(--en-muted);
  font-size: 12px;
  font-weight: 500;
  pointer-events: none;
  paint-order: stroke;
  stroke: color-mix(in srgb, var(--en-bg) 92%, transparent);
  stroke-width: 3px;
  stroke-linejoin: round;
}

.en-graph-node.center text,
.en-graph-node.selected text {
  fill: var(--en-text);
  font-weight: 650;
}

.en-graph-stage-hint {
  position: absolute;
  z-index: 2;
  left: 50%;
  bottom: 12px;
  transform: translateX(-50%);
  max-width: calc(100% - 24px);
  padding: 7px 12px;
  border: 1px solid var(--en-border);
  border-radius: 999px;
  color: var(--en-muted);
  background: color-mix(in srgb, var(--en-surface) 90%, transparent);
  font-size: 11px;
  text-align: center;
  pointer-events: none;
}

.en-graph-panel {
  overflow: auto;
  padding: 16px;
  user-select: text;
}

.en-graph-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.en-graph-panel-head p {
  margin: 6px 0 0;
  color: var(--en-muted);
  line-height: 1.45;
}

.en-graph-panel-actions {
  margin-top: 14px;
}

.en-graph-node-meta,
.en-graph-section {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.en-graph-section {
  display: grid;
}

.en-graph-section h3 {
  margin: 0 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--en-muted);
}

.en-graph-source-pill {
  text-align: left;
}

.en-graph-source-card {
  margin-top: 14px;
  border: 1px solid var(--en-border);
  border-radius: 16px;
  padding: 12px;
  background: var(--en-bg);
}

.en-graph-source-card p {
  margin: 8px 0 0;
  color: var(--en-muted);
  line-height: 1.45;
}

.en-graph-related-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.en-graph-related-card {
  display: grid;
  gap: 4px;
  text-align: left;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  padding: 10px 12px;
  background: var(--en-bg);
}

.en-graph-related-card strong {
  font-size: 13px;
}

.en-graph-related-card span,
.en-graph-related-card small {
  color: var(--en-muted);
  font-size: 12px;
  line-height: 1.35;
}

@media (max-width: 980px) {
  .en-graph-layout {
    grid-template-columns: 1fr;
  }

  .en-graph-toolbar {
    align-items: flex-start;
  }
}
</style>

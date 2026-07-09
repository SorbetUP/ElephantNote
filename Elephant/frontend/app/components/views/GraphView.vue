<template>
  <section class="en-workspace-view">
    <header class="en-graph-hero">
      <div>
        <p class="en-graph-kicker">
          {{ semanticCenter ? 'Local semantic exploration' : 'Wiki territories' }}
        </p>
        <h1>{{ semanticCenter?.title || 'Knowledge map' }}</h1>
        <p>
          {{ displayGraph.nodes.length }} visible nodes · {{ displayGraph.edges.length }} visible links
          <span v-if="!semanticCenter && territoryStats.territoryCount"> · {{ territoryStats.territoryCount }} Wiki territories</span>
          <span v-if="!semanticCenter && territoryStats.overlapNotes"> · {{ territoryStats.overlapNotes }} shared notes</span>
          <span v-if="semanticCenter"> · depth {{ semanticDepth }}</span>
        </p>
      </div>
      <div class="en-graph-summary">
        <span>{{ graphSummary.semantic }} semantic</span>
        <span>{{ graphSummary.explicit }} explicit</span>
        <span>{{ graphSummary.wikiSource }} Wiki sources</span>
        <span>{{ graphSummary.wikiLink }} Wiki bridges</span>
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
              @click="zoomBy(0.82, undefined, 'toolbar-out')"
            >
              −
            </button>
            <button
              type="button"
              title="Fit visible graph"
              @click="fitGraph(true, 'toolbar')"
            >
              Fit
            </button>
            <button
              type="button"
              title="Zoom in"
              @click="zoomBy(1.22, undefined, 'toolbar-in')"
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
          aria-label="Interactive Wiki territory knowledge graph"
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
            <g
              v-if="!semanticCenterId"
              class="en-graph-territories"
            >
              <g
                v-for="territory in globalTerritories"
                :key="territory.id"
                class="en-graph-territory"
                :class="[
                  territory.kind,
                  `status-${territory.status}`,
                  `territory-${territory.colorIndex % 8}`,
                  {
                    selected: selectedTerritory?.id === territory.id,
                    dimmed: isTerritoryDimmed(territory)
                  }
                ]"
                role="button"
                tabindex="0"
                :aria-label="`${territory.label}, ${territory.memberCount} notes`"
                @pointerdown.stop
                @click.stop="selectTerritory(territory)"
                @dblclick.stop.prevent="focusTerritory(territory)"
                @keydown.enter.prevent="focusTerritory(territory)"
              >
                <path :d="territory.path" />
                <text
                  :x="territory.centroid.x"
                  :y="territory.centroid.y - 8"
                  text-anchor="middle"
                >
                  {{ territory.label }}
                </text>
                <text
                  class="en-graph-territory-count"
                  :x="territory.centroid.x"
                  :y="territory.centroid.y + 10"
                  text-anchor="middle"
                >
                  {{ territory.memberCount }} notes
                </text>
              </g>
            </g>

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
                  shared: nodeTerritoryCount(node.id) > 1,
                  dimmed: isNodeDimmed(node.id)
                }
              ]"
              role="button"
              tabindex="0"
              :aria-label="`Select ${node.title}`"
              @pointerdown.stop
              @mouseenter="hoveredNodeId = node.id"
              @mouseleave="hoveredNodeId = ''"
              @click.stop="handleNodeClick(node)"
              @dblclick.stop.prevent="handleNodeDoubleClick(node)"
              @keydown.enter.prevent="selectAndFocusNode(node)"
            >
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="nodeRadius(node)"
              />
              <circle
                v-if="nodeTerritoryCount(node.id) > 1"
                class="en-graph-node-shared-ring"
                :cx="node.x"
                :cy="node.y"
                :r="nodeRadius(node) + 4"
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
          Drag to pan · wheel to zoom · click to inspect · double-click a territory to frame it
          <span v-if="semanticCenter"> · click a neighbor to recenter</span>
        </div>
      </div>

      <aside class="en-graph-panel">
        <template v-if="selectedNode">
          <div class="en-graph-panel-head">
            <div>
              <p class="en-graph-kicker">
                {{ selectedNode.id === semanticCenterId ? 'Semantic center' : selectedNode.kind === 'wiki' ? 'Wiki territory' : 'Selected note' }}
              </p>
              <h2>{{ selectedNode.title }}</h2>
              <p>{{ selectedNode.summary || 'No summary yet.' }}</p>
            </div>
            <button
              type="button"
              @click="openNode(selectedNode)"
            >
              {{ selectedNode.kind === 'wiki' ? 'Open Wiki' : 'Open note' }}
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
            <button
              v-if="selectedNode.kind === 'wiki' && selectedTerritory"
              type="button"
              @click="focusTerritory(selectedTerritory)"
            >
              Frame territory
            </button>
          </div>

          <div class="en-graph-node-meta">
            <span>{{ selectedNode.kind || 'note' }}</span>
            <span>{{ selectedRelatedNodes.length }} connections</span>
            <span v-if="selectedNode.kind === 'wiki'">{{ selectedNode.sourceCount || 0 }} member notes</span>
            <span v-else>{{ selectedNode.chunkCount || 0 }} chunks</span>
            <span v-if="nodeTerritoryCount(selectedNode.id) > 1">{{ nodeTerritoryCount(selectedNode.id) }} territories</span>
            <span v-if="selectedTerritory?.status">{{ selectedTerritory.status }}</span>
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
            <h3>Connected nodes</h3>
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

        <template v-else-if="selectedTerritory">
          <div class="en-graph-panel-head">
            <div>
              <p class="en-graph-kicker">Territory</p>
              <h2>{{ selectedTerritory.label }}</h2>
              <p>{{ selectedTerritory.memberCount }} notes · {{ selectedTerritory.status }}</p>
            </div>
            <button
              type="button"
              @click="focusTerritory(selectedTerritory)"
            >
              Frame
            </button>
          </div>
          <section class="en-graph-section">
            <h3>Member notes</h3>
            <div class="en-graph-related-grid">
              <button
                v-for="node in selectedTerritoryNodes"
                :key="node.id"
                type="button"
                class="en-graph-related-card"
                @click="selectAndFocusNode(node)"
              >
                <strong>{{ node.title }}</strong>
                <small>{{ nodeTerritoryCount(node.id) > 1 ? `${nodeTerritoryCount(node.id)} territories` : 'Exclusive member' }}</small>
              </button>
            </div>
          </section>
        </template>

        <template v-else>
          <p class="en-empty-view">
            Select a territory or note. Shared notes are placed between their Wikis and marked with a second ring.
          </p>
        </template>
      </aside>
    </div>

    <p
      v-else
      class="en-empty-view"
    >
      Rebuild the knowledge index to visualize note relationships and Wiki territories.
    </p>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import log from '@/platform/runtimeLogShim'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { buildSemanticViewModel, resolveSemanticGraph } from './semanticGraphViewHelpers'
import {
  GRAPH_HEIGHT,
  GRAPH_WIDTH,
  buildAdjacency,
  buildSemanticNeighborhood,
  fitCameraToNodes,
  focusCameraOnNode,
  layoutSemanticNeighborhood,
  layoutWikiTerritories,
  pushSemanticHistory,
  zoomCameraAtPoint
} from './graphNavigationHelpers'

const store = useVaultStore()
const searchStore = useSearchStore()
const graphSvg = ref(null)
const selectedNode = ref(null)
const selectedTerritory = ref(null)
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
let zoomLogTimer = null
const zoomLogState = ref(null)

const graph = computed(() => {
  const resolved = resolveSemanticGraph(searchStore.indexInspection?.graph)
  const nodes = resolved.nodes.filter((node) => (node.kind || node.type) !== 'folder')
  const nodeIds = new Set(nodes.map((node) => node.id))
  const edges = resolved.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
  const clusters = resolved.clusters.filter((cluster) =>
    Array.isArray(cluster.paths) && cluster.paths.some((path) => nodeIds.has(path))
  )
  return { nodes, edges, clusters }
})

const globalLayout = computed(() => layoutWikiTerritories({
  nodes: graph.value.nodes,
  edges: graph.value.edges,
  clusters: graph.value.clusters,
  width: GRAPH_WIDTH,
  height: GRAPH_HEIGHT
}))
const globalTerritories = computed(() => globalLayout.value.territories)
const territoryStats = computed(() => globalLayout.value.stats)
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
  explicit: graph.value.edges.filter((edge) => edge.type === 'explicit-link').length,
  wikiSource: graph.value.edges.filter((edge) => edge.type === 'wiki-source').length,
  wikiLink: graph.value.edges.filter((edge) => edge.type === 'wiki-link').length
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
  if (globalLayout.value.nodes.length) return globalLayout.value.nodes
  return buildSemanticViewModel({ graph: graph.value, width: GRAPH_WIDTH, height: GRAPH_HEIGHT }).nodes
})

const positionedEdges = computed(() => {
  const byId = new Map(positionedNodes.value.map((node) => [node.id, node]))
  return displayGraph.value.edges
    .map((edge) => ({ ...edge, source: byId.get(edge.source), target: byId.get(edge.target) }))
    .filter((edge) => edge.source && edge.target)
})

const interactionAnchorId = computed(() => hoveredNodeId.value || selectedNode.value?.id || '')
const interactionNeighborIds = computed(() => {
  const anchorId = interactionAnchorId.value
  if (!anchorId) return new Set()
  return new Set((displayGraph.value.adjacency.get(anchorId) || []).map((entry) => entry.nodeId))
})
const selectedTerritoryNodes = computed(() => {
  if (!selectedTerritory.value) return []
  const memberIds = new Set(selectedTerritory.value.paths || [])
  return graph.value.nodes
    .filter((node) => node.kind === 'note' && memberIds.has(node.id))
    .sort((left, right) => String(left.title).localeCompare(String(right.title)))
})
const cameraTransform = computed(() => `translate(${camera.value.x} ${camera.value.y}) scale(${camera.value.scale})`)
const zoomPercent = computed(() => Math.round(camera.value.scale * 100))
const canGoBack = computed(() => !!semanticCenterId.value)
const canGoForward = computed(() => semanticHistoryIndex.value < semanticHistory.value.length - 1)

const nodeTerritoryCount = (nodeId) => globalLayout.value.memberships.get(nodeId)?.filter((id) => id !== 'unassigned').length || 0
const nodeRadius = (node) => {
  if (node.kind === 'wiki') return 23
  if (node.id === semanticCenterId.value) return 22
  const connectionCount = displayGraph.value.adjacency.get(node.id)?.length || 0
  return 12 + Math.min(7, connectionCount * 1.1)
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
const isTerritoryDimmed = (territory) => {
  if (!interactionAnchorId.value) return false
  return !(territory.paths || []).includes(interactionAnchorId.value)
}

const relationTypeCounts = (nodeId) => {
  const counts = {}
  for (const edge of graph.value.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue
    counts[edge.type || 'related'] = (counts[edge.type || 'related'] || 0) + 1
  }
  return counts
}

const updateRelatedNodes = (nodeId) => {
  const byId = new Map(graph.value.nodes.map((node) => [node.id, node]))
  const related = new Map()
  for (const edge of graph.value.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue
    const otherId = edge.source === nodeId ? edge.target : edge.source
    const node = byId.get(otherId)
    if (!node) continue
    const current = related.get(otherId) || { ...node, linkTypes: new Set() }
    current.linkTypes.add(edge.type || 'related')
    related.set(otherId, current)
  }
  selectedRelatedNodes.value = [...related.values()]
    .sort((left, right) => String(left.title).localeCompare(String(right.title)))
    .slice(0, 20)
    .map((entry) => ({ ...entry, linkTypes: [...entry.linkTypes] }))
}

const selectNode = (node) => {
  selectedNode.value = node
  selectedSource.value = null
  updateRelatedNodes(node.id)
  const territoryIds = globalLayout.value.memberships.get(node.id) || (node.kind === 'wiki' ? [node.id] : [])
  selectedTerritory.value = globalLayout.value.territoryById.get(node.id) ||
    (territoryIds.length === 1 ? globalLayout.value.territoryById.get(territoryIds[0]) : null)
  log.info('[Graph][Node] select', {
    nodeId: node.id,
    kind: node.kind || 'note',
    semanticCenterId: semanticCenterId.value || null,
    relationTypes: relationTypeCounts(node.id),
    territoryIds,
    connectionCount: selectedRelatedNodes.value.length
  })
}

const openNode = (node) => {
  if (!node?.id) return
  if (node.kind === 'wiki') {
    const draftId = node.id.replace(/^wiki:/, '')
    log.info('[Graph][Wiki] open', { nodeId: node.id, draftId, title: node.title })
    window.sessionStorage.setItem('elephantnote:openWikiDraftId', draftId)
    store.setWorkspaceView('wiki')
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('elephantnote:open-wiki', { detail: { draftId } }))
    })
    return
  }
  const note = [...store.rootEntries, ...store.entries, ...store.openedNotes]
    .find((entry) => entry.path === node.id) || {
    path: node.id,
    title: node.title || node.id.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled',
    kind: 'note',
    type: 'note'
  }
  log.info('[Graph][Node] open', { nodeId: node.id, title: note.title })
  store.openNote(note)
}

const selectTerritory = (territory) => {
  selectedTerritory.value = territory
  const wikiNode = graph.value.nodes.find((node) => node.id === territory.id)
  if (wikiNode) selectNode(wikiNode)
  else {
    selectedNode.value = null
    selectedRelatedNodes.value = []
  }
  log.info('[Graph][Territory] select', {
    territoryId: territory.id,
    label: territory.label,
    kind: territory.kind,
    status: territory.status,
    memberCount: territory.memberCount,
    bounds: territory.bounds
  })
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

const animateCamera = (target, duration = 260, reason = 'unspecified') => {
  cancelCameraAnimation()
  const start = { ...camera.value }
  const startedAt = performance.now()
  log.debug('[Graph][Camera] animation:start', { reason, start, target, durationMs: duration })
  const tick = (time) => {
    const progress = Math.min(1, (time - startedAt) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    camera.value = {
      x: start.x + (target.x - start.x) * eased,
      y: start.y + (target.y - start.y) * eased,
      scale: start.scale + (target.scale - start.scale) * eased
    }
    if (progress < 1) {
      cameraAnimationFrame = requestAnimationFrame(tick)
    } else {
      cameraAnimationFrame = null
      log.info('[Graph][Camera] animation:complete', {
        reason,
        startScale: start.scale,
        endScale: target.scale,
        durationMs: Math.round(performance.now() - startedAt),
        x: target.x,
        y: target.y
      })
    }
  }
  cameraAnimationFrame = requestAnimationFrame(tick)
}

const fitGraph = (animate = true, reason = 'fit-visible') => {
  const target = fitCameraToNodes({
    nodes: positionedNodes.value,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT,
    padding: semanticCenterId.value ? 62 : 86
  })
  if (animate) animateCamera(target, 260, reason)
  else camera.value = target
  log.info('[Graph][Camera] fit', {
    reason,
    semanticCenterId: semanticCenterId.value || null,
    nodeCount: positionedNodes.value.length,
    edgeCount: positionedEdges.value.length,
    previousScale: camera.value.scale,
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
  if (animate) animateCamera(target, 260, `focus-node:${node.id}`)
  else camera.value = target
  log.info('[Graph][Camera] focus:node', {
    nodeId: node.id,
    kind: node.kind || 'note',
    nodeX: positioned.x,
    nodeY: positioned.y,
    targetScale: target.scale
  })
}

const focusTerritory = (territory) => {
  const memberIds = new Set(territory.paths || [])
  const nodes = positionedNodes.value.filter((node) => memberIds.has(node.id))
  if (!nodes.length) return
  selectTerritory(territory)
  const target = fitCameraToNodes({ nodes, width: GRAPH_WIDTH, height: GRAPH_HEIGHT, padding: 100 })
  animateCamera(target, 320, `focus-territory:${territory.id}`)
  log.info('[Graph][Territory] focus', {
    territoryId: territory.id,
    label: territory.label,
    memberCount: territory.memberCount,
    visibleMemberCount: nodes.length,
    targetScale: target.scale,
    bounds: territory.bounds
  })
}

const selectAndFocusNode = (node) => {
  selectNode(node)
  focusPositionedNode(node)
}

const navigateSemantic = async(nodeId, { record = true } = {}) => {
  const node = graph.value.nodes.find((entry) => entry.id === nodeId)
  if (!node) return
  const previousCenterId = semanticCenterId.value || null
  if (record) {
    const next = pushSemanticHistory({ history: semanticHistory.value, index: semanticHistoryIndex.value, nodeId })
    semanticHistory.value = next.history
    semanticHistoryIndex.value = next.index
  }
  semanticCenterId.value = nodeId
  selectNode(node)
  await nextTick()
  log.info('[Graph][Semantic] navigate', {
    previousCenterId,
    nodeId,
    nodeKind: node.kind || 'note',
    depth: semanticDepth.value,
    visibleNodes: displayGraph.value.nodes.length,
    visibleEdges: displayGraph.value.edges.length,
    historyIndex: semanticHistoryIndex.value,
    historyLength: semanticHistory.value.length
  })
  fitGraph(true, `semantic:${nodeId}`)
}

const exploreSelectedNode = () => {
  if (selectedNode.value) navigateSemantic(selectedNode.value.id)
}
const focusSelectedNode = () => {
  if (selectedNode.value) focusPositionedNode(selectedNode.value)
}
const leaveSemanticMode = async() => {
  if (!semanticCenterId.value) {
    fitGraph(true, 'global-refit')
    return
  }
  const previousCenterId = semanticCenterId.value
  semanticCenterId.value = ''
  semanticHistoryIndex.value = -1
  await nextTick()
  log.info('[Graph][Semantic] leave', {
    previousCenterId,
    globalNodes: graph.value.nodes.length,
    globalEdges: graph.value.edges.length,
    territories: globalTerritories.value.length
  })
  fitGraph(true, 'leave-semantic')
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
  const previousDepth = semanticDepth.value
  semanticDepth.value = depth
  await nextTick()
  log.info('[Graph][Semantic] depth:change', {
    centerId: semanticCenterId.value || null,
    previousDepth,
    depth,
    visibleNodes: displayGraph.value.nodes.length,
    visibleEdges: displayGraph.value.edges.length
  })
  fitGraph(true, `depth:${depth}`)
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

const scheduleZoomLog = ({ source, previousScale, point }) => {
  if (!zoomLogState.value) {
    zoomLogState.value = { source, previousScale, events: 0, point }
    log.debug('[Graph][Camera] zoom:start', { source, previousScale, point })
  }
  zoomLogState.value.events += 1
  zoomLogState.value.source = source
  zoomLogState.value.point = point
  if (zoomLogTimer !== null) clearTimeout(zoomLogTimer)
  zoomLogTimer = setTimeout(() => {
    const state = zoomLogState.value
    log.info('[Graph][Camera] zoom:complete', {
      source: state?.source,
      events: state?.events || 0,
      previousScale: state?.previousScale,
      finalScale: camera.value.scale,
      anchor: state?.point,
      cameraX: camera.value.x,
      cameraY: camera.value.y
    })
    zoomLogState.value = null
    zoomLogTimer = null
  }, 140)
}

const zoomBy = (factor, point = { x: GRAPH_WIDTH / 2, y: GRAPH_HEIGHT / 2 }, source = 'unknown') => {
  cancelCameraAnimation()
  const previousScale = camera.value.scale
  camera.value = zoomCameraAtPoint({ camera: camera.value, point, nextScale: camera.value.scale * factor })
  scheduleZoomLog({ source, previousScale, point })
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
  zoomBy(factor, pointerToGraphPoint(event.clientX, event.clientY), 'wheel')
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
    height: rect.height,
    startedAt: performance.now()
  }
  log.debug('[Graph][Camera] pan:start', {
    pointerId: event.pointerId,
    cameraX: camera.value.x,
    cameraY: camera.value.y,
    scale: camera.value.scale
  })
}
const movePan = (event) => {
  const state = panState.value
  if (!state || state.pointerId !== event.pointerId) return
  const deltaX = ((event.clientX - state.clientX) / Math.max(1, state.width)) * GRAPH_WIDTH
  const deltaY = ((event.clientY - state.clientY) / Math.max(1, state.height)) * GRAPH_HEIGHT
  if (Math.abs(deltaX) + Math.abs(deltaY) > 2) dragMoved.value = true
  camera.value = { ...camera.value, x: state.cameraX + deltaX, y: state.cameraY + deltaY }
}
const endPan = (event) => {
  const state = panState.value
  if (!state || state.pointerId !== event.pointerId) return
  graphSvg.value?.releasePointerCapture?.(event.pointerId)
  panState.value = null
  log.info('[Graph][Camera] pan:complete', {
    pointerId: event.pointerId,
    moved: dragMoved.value,
    deltaX: camera.value.x - state.cameraX,
    deltaY: camera.value.y - state.cameraY,
    finalX: camera.value.x,
    finalY: camera.value.y,
    scale: camera.value.scale,
    durationMs: Math.round(performance.now() - state.startedAt)
  })
}

const handleStageClick = () => {
  if (dragMoved.value) {
    dragMoved.value = false
    return
  }
  selectedNode.value = null
  selectedTerritory.value = null
  selectedSource.value = null
  selectedRelatedNodes.value = []
  log.debug('[Graph][Selection] clear')
}
const handleKeydown = (event) => {
  if (event.key === '+' || event.key === '=') {
    event.preventDefault()
    zoomBy(1.22, undefined, 'keyboard-in')
  } else if (event.key === '-') {
    event.preventDefault()
    zoomBy(0.82, undefined, 'keyboard-out')
  } else if (event.key === '0') {
    event.preventDefault()
    fitGraph(true, 'keyboard-fit')
  } else if (event.key === 'Escape') {
    event.preventDefault()
    if (semanticCenterId.value) leaveSemanticMode()
    else handleStageClick()
  }
}

const loadGraph = async(reason) => {
  const startedAt = performance.now()
  log.info('[Graph][Data] inspect:start', { reason, vaultPath: store.activeVault?.path || null })
  try {
    await searchStore.inspect()
    await nextTick()
    log.info('[Graph][Data] inspect:complete', {
      reason,
      durationMs: Math.round(performance.now() - startedAt),
      nodes: graph.value.nodes.length,
      notes: graph.value.nodes.filter((node) => node.kind === 'note').length,
      wikis: graph.value.nodes.filter((node) => node.kind === 'wiki').length,
      edges: graph.value.edges.length,
      edgeTypes: graphSummary.value,
      clusters: graph.value.clusters.length,
      territoryStats: territoryStats.value
    })
    fitGraph(false, `load:${reason}`)
  } catch (error) {
    log.error('[Graph][Data] inspect:error', {
      reason,
      durationMs: Math.round(performance.now() - startedAt),
      error: error?.message || String(error)
    })
    throw error
  }
}

onMounted(() => loadGraph('mount').catch(() => {}))
watch(() => store.activeVault?.path, async(newPath, oldPath) => {
  semanticCenterId.value = ''
  semanticHistory.value = []
  semanticHistoryIndex.value = -1
  selectedNode.value = null
  selectedTerritory.value = null
  log.info('[Graph][Data] vault:change', { oldPath: oldPath || null, newPath: newPath || null })
  await loadGraph('vault-change').catch(() => {})
})
watch(() => graph.value.nodes.map((node) => node.id).join('|'), async() => {
  if (semanticCenterId.value && !graph.value.nodes.some((node) => node.id === semanticCenterId.value)) {
    log.warn('[Graph][Semantic] center:missing-after-refresh', { centerId: semanticCenterId.value })
    semanticCenterId.value = ''
    semanticHistoryIndex.value = -1
  }
  if (selectedNode.value) {
    const refreshed = graph.value.nodes.find((node) => node.id === selectedNode.value.id)
    if (refreshed) selectNode(refreshed)
    else selectedNode.value = null
  }
  await nextTick()
  fitGraph(false, 'graph-change')
})
watch(() => JSON.stringify(territoryStats.value), (value, previous) => {
  log.info('[Graph][Territory] layout:complete', {
    previous: previous ? JSON.parse(previous) : null,
    current: JSON.parse(value),
    territories: globalTerritories.value.map((territory) => ({
      id: territory.id,
      label: territory.label,
      status: territory.status,
      memberCount: territory.memberCount,
      bounds: territory.bounds
    }))
  })
})

onBeforeUnmount(() => {
  cancelCameraAnimation()
  if (nodeClickTimer !== null) clearTimeout(nodeClickTimer)
  if (zoomLogTimer !== null) clearTimeout(zoomLogTimer)
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
  z-index: 5;
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

.en-graph-territory {
  cursor: pointer;
  outline: none;
  transition: opacity 160ms ease;
}

.en-graph-territory path {
  fill: color-mix(in srgb, var(--en-primary) 9%, transparent);
  stroke: color-mix(in srgb, var(--en-primary) 42%, var(--en-border));
  stroke-width: 1.6;
  vector-effect: non-scaling-stroke;
  transition: fill 160ms ease, stroke 160ms ease, opacity 160ms ease;
}

.en-graph-territory.territory-1 path { fill: color-mix(in srgb, #0ea5e9 9%, transparent); stroke: color-mix(in srgb, #0ea5e9 45%, var(--en-border)); }
.en-graph-territory.territory-2 path { fill: color-mix(in srgb, #22c55e 9%, transparent); stroke: color-mix(in srgb, #22c55e 45%, var(--en-border)); }
.en-graph-territory.territory-3 path { fill: color-mix(in srgb, #f59e0b 9%, transparent); stroke: color-mix(in srgb, #f59e0b 45%, var(--en-border)); }
.en-graph-territory.territory-4 path { fill: color-mix(in srgb, #ec4899 9%, transparent); stroke: color-mix(in srgb, #ec4899 45%, var(--en-border)); }
.en-graph-territory.territory-5 path { fill: color-mix(in srgb, #8b5cf6 9%, transparent); stroke: color-mix(in srgb, #8b5cf6 45%, var(--en-border)); }
.en-graph-territory.territory-6 path { fill: color-mix(in srgb, #14b8a6 9%, transparent); stroke: color-mix(in srgb, #14b8a6 45%, var(--en-border)); }
.en-graph-territory.territory-7 path { fill: color-mix(in srgb, #ef4444 9%, transparent); stroke: color-mix(in srgb, #ef4444 45%, var(--en-border)); }

.en-graph-territory.unassigned path {
  fill: color-mix(in srgb, var(--en-muted) 5%, transparent);
  stroke: color-mix(in srgb, var(--en-muted) 34%, transparent);
  stroke-dasharray: 6 6;
}

.en-graph-territory.status-outdated path {
  stroke-dasharray: 8 4;
}

.en-graph-territory.selected path,
.en-graph-territory:focus path {
  fill: color-mix(in srgb, var(--en-primary) 16%, transparent);
  stroke: var(--en-primary);
  stroke-width: 2.8;
}

.en-graph-territory.dimmed {
  opacity: 0.18;
}

.en-graph-territory text {
  fill: var(--en-text);
  font-size: 13px;
  font-weight: 700;
  pointer-events: none;
  paint-order: stroke;
  stroke: color-mix(in srgb, var(--en-bg) 88%, transparent);
  stroke-width: 4px;
}

.en-graph-territory .en-graph-territory-count {
  fill: var(--en-muted);
  font-size: 10px;
  font-weight: 500;
}

.en-graph-canvas line {
  stroke: color-mix(in srgb, var(--en-border-strong) 72%, transparent);
  stroke-width: 1.4;
  vector-effect: non-scaling-stroke;
  transition: opacity 150ms ease, stroke 150ms ease;
}

.en-graph-canvas line.semantic {
  stroke: color-mix(in srgb, var(--en-primary) 72%, transparent);
}

.en-graph-canvas line.explicit-link {
  stroke: color-mix(in srgb, #0f766e 72%, transparent);
  stroke-dasharray: 4 4;
}

.en-graph-canvas line.wiki-source {
  stroke: color-mix(in srgb, #7c3aed 48%, transparent);
  stroke-width: 1.1;
}

.en-graph-canvas line.wiki-link {
  stroke: color-mix(in srgb, #f59e0b 76%, transparent);
  stroke-width: 3;
  stroke-dasharray: 7 4;
}

.en-graph-canvas line.active {
  stroke-width: 2.8;
  opacity: 1;
}

.en-graph-canvas line.dimmed {
  opacity: 0.06;
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

.en-graph-node.wiki circle {
  fill: color-mix(in srgb, var(--en-primary) 30%, var(--en-soft));
  stroke: color-mix(in srgb, var(--en-primary) 86%, var(--en-border-strong));
  stroke-width: 3;
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

.en-graph-node .en-graph-node-shared-ring {
  fill: none;
  stroke: color-mix(in srgb, #f59e0b 74%, transparent);
  stroke-width: 2;
  stroke-dasharray: 3 3;
}

.en-graph-node.dimmed {
  opacity: 0.16;
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

.en-graph-node.wiki text,
.en-graph-node.center text,
.en-graph-node.selected text {
  fill: var(--en-text);
  font-weight: 700;
}

.en-graph-stage-hint {
  position: absolute;
  z-index: 4;
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

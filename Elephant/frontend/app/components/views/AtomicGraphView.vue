<template>
  <section class="en-graph-premium">
    <div
      ref="containerRef"
      class="en-graph-stage"
      @click="onStageClick"
    />

    <div
      v-if="statusMessage"
      class="en-graph-status"
    >
      {{ statusMessage }}
    </div>

    <div class="en-graph-floating-icons">
      <button
        type="button"
        class="en-graph-floating-icon"
        :class="{ active: timelapseActive }"
        title="Démarrer le timelapse"
        @click="toggleTimelapse"
      >
        <Wand2 class="en-fi-svg" />
      </button>
      <button
        type="button"
        class="en-graph-floating-icon"
        :class="{ active: panelOpen }"
        title="Options du graphe"
        @click="panelOpen = !panelOpen"
      >
        <Settings class="en-fi-svg" />
      </button>
    </div>

    <div
      v-if="!timelapseActive"
      class="en-graph-bottom-left"
    >
      <div
        v-if="showStats"
        class="en-graph-stats"
      >
        {{ displayData.nodes.length }} nœuds · {{ displayData.edges.length }} liens
        <span
          v-if="indexReady"
          class="en-graph-stats-dot"
        />
        <span
          v-else-if="indexBuilding"
          class="en-graph-stats-dot en-graph-stats-dot-building"
        />
      </div>
      <div class="en-graph-zoom-control">
        <button
          type="button"
          class="en-graph-zoom-button"
          title="Recentrer"
          @click="resetView"
        >
          <Crosshair class="en-gz-svg" />
        </button>
        <input
          type="range"
          class="en-graph-zoom-slider"
          min="0.1"
          max="4"
          step="0.01"
          :value="zoomValue"
          @input="onZoomSlider"
        >
        <span class="en-graph-zoom-pct">{{ Math.round(zoomValue * 100) }}%</span>
      </div>
    </div>

    <transition name="en-panel">
      <aside
        v-if="panelOpen"
        class="en-graph-settings-panel"
      >
        <div class="en-panel-topbar">
          <span class="en-panel-topbar-title">Options</span>
          <div class="en-panel-topbar-actions">
            <button
              type="button"
              class="en-panel-icon-btn"
              title="Réinitialiser"
              @click="resetOptions"
            >
              <RotateCcw class="en-panel-icn" />
            </button>
            <button
              type="button"
              class="en-panel-icon-btn"
              title="Fermer"
              @click="panelOpen = false"
            >
              <X class="en-panel-icn" />
            </button>
          </div>
        </div>

        <div class="en-panel-scroll">
          <div
            v-for="section in sections"
            :key="section.id"
            class="en-panel-section"
          >
            <button
              type="button"
              class="en-section-header"
              :class="{ open: section.open }"
              @click="toggleSection(section)"
            >
              <ChevronDown class="en-section-chevron" />
              <span class="en-section-title">{{ section.title }}</span>
            </button>
            <transition name="en-accordion">
              <div
                v-if="section.open"
                class="en-section-body"
              >
                <template v-if="section.id === 'filters'">
                  <div class="en-filter-search">
                    <Search class="en-filter-search-icon" />
                    <input
                      v-model="filterQuery"
                      type="text"
                      class="en-filter-input"
                      placeholder="Filtrer les notes…"
                    >
                  </div>
                  <div class="en-filter-row">
                    <span class="en-filter-label">Mots-clés</span>
                    <button
                      type="button"
                      class="en-switch"
                      :class="{ active: filterTags }"
                      @click="filterTags = !filterTags"
                    >
                      <span class="en-switch-thumb" />
                    </button>
                  </div>
                  <div class="en-filter-row">
                    <span class="en-filter-label">Fichiers existants uniquement</span>
                    <button
                      type="button"
                      class="en-switch"
                      :class="{ active: filterExisting }"
                      @click="filterExisting = !filterExisting"
                    >
                      <span class="en-switch-thumb" />
                    </button>
                  </div>
                  <div class="en-filter-row">
                    <span class="en-filter-label">Orphelins</span>
                    <button
                      type="button"
                      class="en-switch"
                      :class="{ active: filterOrphans }"
                      @click="filterOrphans = !filterOrphans"
                    >
                      <span class="en-switch-thumb" />
                    </button>
                  </div>
                </template>

                <template v-if="section.id === 'groups'">
                  <button
                    type="button"
                    class="en-primary-button"
                    @click="addGroup"
                  >
                    <Plus class="en-btn-icn" />
                    Nouveau groupe
                  </button>
                  <div
                    v-if="groups.length"
                    class="en-group-list"
                  >
                    <div
                      v-for="group in groups"
                      :key="group.id"
                      class="en-group-item"
                    >
                      <span
                        class="en-group-dot"
                        :style="{ background: group.color }"
                      />
                      <span class="en-group-name">{{ group.name }}</span>
                      <span class="en-group-count">{{ group.count }}</span>
                    </div>
                  </div>
                </template>

                <template v-if="section.id === 'display'">
                  <div class="en-filter-row">
                    <span class="en-filter-label">Afficher les labels</span>
                    <button
                      type="button"
                      class="en-switch"
                      :class="{ active: showLabels }"
                      @click="showLabels = !showLabels"
                    >
                      <span class="en-switch-thumb" />
                    </button>
                  </div>
                  <div class="en-filter-row">
                    <span class="en-filter-label">Afficher les statistiques</span>
                    <button
                      type="button"
                      class="en-switch"
                      :class="{ active: showStats }"
                      @click="showStats = !showStats"
                    >
                      <span class="en-switch-thumb" />
                    </button>
                  </div>
                  <div class="en-slider-control">
                    <span class="en-slider-label">Seuil d'apparition du texte</span>
                    <input
                      v-model.number="labelThreshold"
                      type="range"
                      class="en-slider"
                      min="2"
                      max="20"
                      step="0.5"
                    >
                  </div>
                  <div class="en-slider-control">
                    <span class="en-slider-label">Taille des nœuds</span>
                    <input
                      v-model.number="nodeSizeScale"
                      type="range"
                      class="en-slider"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                    >
                  </div>
                  <div class="en-slider-control">
                    <span class="en-slider-label">Épaisseur des liens</span>
                    <input
                      v-model.number="linkThickness"
                      type="range"
                      class="en-slider"
                      min="0.3"
                      max="2.5"
                      step="0.05"
                    >
                  </div>
                  <button
                    type="button"
                    class="en-primary-button"
                    :disabled="animating"
                    @click="animateGraph"
                  >
                    <Play
                      v-if="!animating"
                      class="en-btn-icn"
                    />
                    <Loader
                      v-else
                      class="en-btn-icn en-spin"
                    />
                    {{ animating ? 'Animation…' : 'Animer' }}
                  </button>
                </template>

                <template v-if="section.id === 'forces'">
                  <div class="en-slider-control">
                    <span class="en-slider-label">Force centrale</span>
                    <input
                      v-model.number="forceCenter"
                      type="range"
                      class="en-slider"
                      min="0.05"
                      max="0.6"
                      step="0.01"
                    >
                  </div>
                  <div class="en-slider-control">
                    <span class="en-slider-label">Force de répulsion</span>
                    <input
                      v-model.number="forceRepulsion"
                      type="range"
                      class="en-slider"
                      min="100"
                      max="900"
                      step="10"
                    >
                  </div>
                  <div class="en-slider-control">
                    <span class="en-slider-label">Force de liaison</span>
                    <input
                      v-model.number="forceLink"
                      type="range"
                      class="en-slider"
                      min="0.1"
                      max="1.2"
                      step="0.01"
                    >
                  </div>
                  <div class="en-slider-control">
                    <span class="en-slider-label">Distance des liens</span>
                    <input
                      v-model.number="forceLinkDistance"
                      type="range"
                      class="en-slider"
                      min="40"
                      max="220"
                      step="2"
                    >
                  </div>
                  <button
                    type="button"
                    class="en-primary-button"
                    @click="animateGraph"
                  >
                    <Zap class="en-btn-icn" />
                    Relancer la simulation
                  </button>
                </template>
              </div>
            </transition>
          </div>
        </div>
      </aside>
    </transition>

    <transition name="en-timeline">
      <div
        v-if="timelapseActive"
        class="en-timeline-panel"
      >
        <button
          type="button"
          class="en-timeline-play"
          @click="timelapsePlaying = !timelapsePlaying"
        >
          <Play
            v-if="!timelapsePlaying"
            class="en-tl-icn"
          />
          <Pause
            v-else
            class="en-tl-icn"
          />
        </button>
        <input
          type="range"
          class="en-timeline-slider"
          min="0"
          max="100"
          step="1"
          :value="timelapseProgress"
          @input="onTimelapseSeek"
        >
        <span class="en-timeline-date">{{ timelapseLabel }}</span>
        <button
          type="button"
          class="en-timeline-speed"
          @click="cycleTimelapseSpeed"
        >
          x{{ timelapseSpeed }}
        </button>
        <button
          type="button"
          class="en-timeline-close"
          @click="stopTimelapse"
        >
          <X class="en-tl-icn" />
        </button>
      </div>
    </transition>

    <transition name="en-card">
      <div
        v-if="selectedNode"
        class="en-note-preview-card"
        :class="{ collapsed: cardCollapsed, dragging: cardDragging }"
        :style="cardStyle"
      >
        <div
          class="en-card-header"
          @mousedown.prevent="startCardDrag"
        >
          <h3 class="en-card-title">
            {{ selectedNode.title }}
          </h3>
          <div class="en-card-header-actions">
            <button
              type="button"
              class="en-card-mini-btn"
              :title="cardCollapsed ? 'Agrandir' : 'Réduire'"
              @click="cardCollapsed = !cardCollapsed"
            >
              <ChevronDown
                v-if="!cardCollapsed"
                class="en-card-icn"
              />
              <ChevronUp
                v-else
                class="en-card-icn"
              />
            </button>
            <button
              type="button"
              class="en-card-mini-btn"
              title="Fermer"
              @click="deselectNode"
            >
              <X class="en-card-icn" />
            </button>
          </div>
        </div>

        <template v-if="!cardCollapsed">
          <div class="en-card-meta">
            <span>{{ selectedNode.kind || 'note' }}</span>
            <span>{{ selectedNode.sourceCount || 0 }} sources</span>
            <span>{{ selectedNode.chunkCount || 0 }} chunks</span>
          </div>

          <p class="en-card-summary">
            {{ selectedNode.summary || 'Aucun résumé pour cette note.' }}
          </p>

          <div
            v-if="selectedNode.tags?.length"
            class="en-card-tags"
          >
            <span
              v-for="tag in selectedNode.tags.slice(0, 12)"
              :key="tag"
              class="en-card-tag"
            >#{{ tag }}</span>
          </div>

          <button
            type="button"
            class="en-card-open"
            @click="openSelectedNode"
          >
            Ouvrir la note
            <ArrowRight class="en-card-open-icn" />
          </button>
        </template>
      </div>
    </transition>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import Graph from 'graphology'
import Sigma from 'sigma'
import EdgeCurveProgram from '@sigma/edge-curve'
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Loader,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Wand2,
  X,
  Zap
} from '@lucide/vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'
import { useCanvasStore } from '../../stores/canvasStore'
import {
  buildSemanticViewModel,
  buildGraphFromVaultEntries,
  selectSemanticGraphSource
} from './semanticGraphViewHelpers'
import { nodeColor } from '../../graph/graphThemes'

const store = useVaultStore()
const searchStore = useSearchStore()
const canvasStore = useCanvasStore()

const NODE_PALETTE = [
  '#7c3aed', '#3b82f6', '#22d3ee', '#4ade80',
  '#eab308', '#ec4899', '#ef4444', '#a78bfa'
]

const containerRef = ref(null)
const graphData = ref(null)
const indexBuilding = ref(false)

let renderer = null
let graphInstance = null
let labelCanvas = null
let neighborsMap = new Map()

let hoveredNodeRef = null
let selectedNodeRef = null
let hoverAnimRef = 0
let selectAnimRef = 0
let hoverTargetRef = 0
let selectTargetRef = 0
let simRaf = null
let timelapseRaf = null
let hoverRaf = null
let graphMountRaf = null

const selectedNode = ref(null)
const panelOpen = ref(false)
const timelapseActive = ref(false)
const timelapsePlaying = ref(false)
const timelapseProgress = ref(0)
const timelapseSpeed = ref(1)
const animating = ref(false)
const zoomValue = ref(1)
const cardCollapsed = ref(false)
const cardPos = reactive({ x: null, y: null })
const cardDragging = ref(false)

const filterQuery = ref('')
const filterTags = ref(true)
const filterExisting = ref(true)
const filterOrphans = ref(false)

const showLabels = ref(true)
const showStats = ref(true)
const labelThreshold = ref(7)
const nodeSizeScale = ref(1)
const linkThickness = ref(1)

const forceCenter = ref(0.32)
const forceRepulsion = ref(420)
const forceLink = ref(0.55)
const forceLinkDistance = ref(95)

const sections = ref([
  { id: 'filters', title: 'Filtres', open: true },
  { id: 'groups', title: 'Groupes', open: false },
  { id: 'display', title: 'Afficher', open: false },
  { id: 'forces', title: 'Forces', open: false }
])

const groups = ref([])

const theme = computed(() => canvasStore.activeTheme)
const isLight = computed(() => theme.value?.isLight)

const indexReady = computed(() => {
  const g = searchStore.indexInspection?.graph
  return Array.isArray(g?.nodes) && g.nodes.length > 0
})

const fallbackGraph = computed(() => {
  if (indexReady.value) return null
  const entries = store.rootEntries || []
  if (entries.length === 0) return null
  return buildGraphFromVaultEntries(entries)
})

const rawGraph = computed(() => {
  if (indexReady.value) {
    return selectSemanticGraphSource({
      inspectionGraph: searchStore.indexInspection?.graph
    })
  }
  return fallbackGraph.value || { nodes: [], edges: [], clusters: [] }
})

const semanticModel = computed(() => {
  const nodeCount = rawGraph.value?.nodes?.length || 0
  const scale = Math.max(1, Math.sqrt(nodeCount) / 12)
  return buildSemanticViewModel({
    graph: rawGraph.value,
    savedPositions: canvasStore.canvasPositions,
    width: Math.round(1800 * scale),
    height: Math.round(1200 * scale)
  })
})

const filteredNodes = computed(() => {
  const nodes = semanticModel.value.nodes
  const q = filterQuery.value.trim().toLowerCase()
  if (!q) return nodes
  return nodes.filter((n) => {
    const title = String(n.title || '').toLowerCase()
    const tags = Array.isArray(n.tags) ? n.tags.join(' ').toLowerCase() : ''
    return title.includes(q) || tags.includes(q)
  })
})

const filteredNodeIds = computed(() => new Set(filteredNodes.value.map((n) => n.id)))

const MAX_VISIBLE_EDGES = 3000

const filteredEdges = computed(() => {
  const candidate = semanticModel.value.edges.filter((e) =>
    filteredNodeIds.value.has(e.source) && filteredNodeIds.value.has(e.target)
  )
  if (candidate.length <= MAX_VISIBLE_EDGES) return candidate
  const sorted = [...candidate].sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
  return sorted.slice(0, MAX_VISIBLE_EDGES)
})

const renderEdges = computed(() => {
  const edges = semanticModel.value.edges
  if (edges.length <= MAX_VISIBLE_EDGES) return edges
  const sorted = [...edges].sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
  return sorted.slice(0, MAX_VISIBLE_EDGES)
})

const displayData = computed(() => ({
  nodes: filteredNodes.value,
  edges: filteredEdges.value,
  edgeCounts: semanticModel.value.edgeCounts,
  maxEdges: semanticModel.value.maxEdges,
  clusters: semanticModel.value.clusters || []
}))

const statusMessage = computed(() => {
  if (indexBuilding.value) return 'Construction de l\'index sémantique…'
  if (searchStore.status.status === 'indexing') return searchStore.status.message || 'Indexation…'
  if (displayData.value.nodes.length === 0) {
    if (store.rootEntries?.length > 0) return 'Aucune note à afficher. Ajustez les filtres.'
    return 'Aucun vault chargé.'
  }
  return ''
})

const cardStyle = computed(() => {
  if (cardPos.x === null) return {}
  return { left: `${cardPos.x}px`, top: `${cardPos.y}px` }
})

const timelapseLabel = computed(() => {
  const nodes = displayData.value.nodes
  if (!nodes.length) return '—'
  const sorted = [...nodes].sort((a, b) => {
    const da = new Date(a.updatedAt || 0).getTime()
    const db = new Date(b.updatedAt || 0).getTime()
    return da - db
  })
  const idx = Math.min(sorted.length - 1, Math.floor((timelapseProgress.value / 100) * sorted.length))
  const node = sorted[idx]
  if (!node?.updatedAt) return `Note ${idx + 1}/${sorted.length}`
  return new Date(node.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
})

function truncLabel (str, max) {
  if (!str) return ''
  return str.length > max ? str.substring(0, max - 1) + '\u2026' : str
}

function edgeColorFor (type) {
  if (type === 'semantic') return '#6d5fd3'
  if (type === 'explicit-link') return '#3b9b96'
  if (type === 'folder') return '#d98a3b'
  if (type === 'tag') return '#9b6cff'
  if (type === 'lexical') return '#9b6cff'
  return '#5a6478'
}

function rgbToHex (rgb) {
  if (!Array.isArray(rgb)) return '#1e1e1e'
  const toHex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${toHex(rgb[0])}${toHex(rgb[1])}${toHex(rgb[2])}`
}

function hexToRgb (hex) {
  const m = String(hex || '').match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : null
}

function dimColor (rgb, target, amount) {
  if (!rgb) return Array.isArray(target) ? rgbToHex(target) : '#1e1e1e'
  const r = Math.round(rgb[0] + (target[0] - rgb[0]) * amount)
  const g = Math.round(rgb[1] + (target[1] - rgb[1]) * amount)
  const b = Math.round(rgb[2] + (target[2] - rgb[2]) * amount)
  return rgbToHex([r, g, b])
}

function dimHex (hexColor, target, amount) {
  const rgb = hexToRgb(hexColor)
  if (!rgb) return hexColor
  return dimColor(rgb, target, amount)
}

function buildGraph (data) {
  const graph = new Graph()
  const t = theme.value
  const { nodes, edges, edgeCounts, maxEdges } = data

  for (const node of nodes) {
    const id = node.id
    graph.addNode(id, {
      x: Number(node.x || 0),
      y: Number(node.y || 0),
      size: Math.max(1.8, Number(node.size || 5) * nodeSizeScale.value),
      label: truncLabel(node.title || id, 48),
      color: nodeColor(node, t),
      hidden: false,
      zIndex: 0,
      originalColor: nodeColor(node, t),
      borderColor: node.borderColor || t?.border || '#4a5468',
      borderSize: 1.4,
      source: node
    })
  }

  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue
    const edgeType = edge.type || 'semantic'
    const count = edgeCounts?.get?.(edge.source) || 0
    const emphasis = maxEdges > 0 ? Math.min(1, count / maxEdges) : 0
    const edgeSize = Math.max(0.35, Number(edge.weight || 0.55) * linkThickness.value)
    graph.addEdgeWithKey(edge.id || `${edge.source}:${edge.target}:${edgeType}`, edge.source, edge.target, {
      type: 'curved',
      size: edgeSize,
      color: edgeColorFor(edgeType),
      zIndex: edgeType === 'semantic' ? 1 : 0,
      forceLabel: false,
      originalColor: edgeColorFor(edgeType),
      emphasis,
      edgeType,
      curvature: Number(edge.curvature || 0.18)
    })
  }

  return graph
}

function destroyRenderer () {
  if (renderer) {
    renderer.kill()
    renderer = null
  }
  graphInstance = null
  if (labelCanvas?.parentNode) labelCanvas.parentNode.removeChild(labelCanvas)
  labelCanvas = null
}

function drawLabels () {
  if (!renderer || !labelCanvas || !showLabels.value) return
  const ctx = labelCanvas.getContext('2d')
  if (!ctx) return
  const rect = containerRef.value?.getBoundingClientRect()
  if (!rect) return
  const dpr = window.devicePixelRatio || 1
  if (labelCanvas.width !== Math.round(rect.width * dpr) || labelCanvas.height !== Math.round(rect.height * dpr)) {
    labelCanvas.width = Math.round(rect.width * dpr)
    labelCanvas.height = Math.round(rect.height * dpr)
    labelCanvas.style.width = `${rect.width}px`
    labelCanvas.style.height = `${rect.height}px`
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, rect.width, rect.height)
  ctx.font = '500 12px Inter, system-ui, sans-serif'
  ctx.textBaseline = 'middle'

  const camera = renderer.getCamera()
  const ratio = camera.getState().ratio
  const threshold = labelThreshold.value / 10
  if (ratio > threshold) return

  graphInstance.forEachNode((node, attrs) => {
    if (attrs.hidden) return
    const pos = renderer.graphToViewport({ x: attrs.x, y: attrs.y })
    const alpha = hoveredNodeRef && hoveredNodeRef !== node ? 0.18 : 0.88
    ctx.globalAlpha = alpha
    ctx.fillStyle = isLight.value ? '#1f2937' : '#e5e7eb'
    ctx.fillText(attrs.label || '', pos.x + attrs.size + 6, pos.y)
  })
  ctx.globalAlpha = 1
}

function installLabelCanvas () {
  if (!containerRef.value) return
  labelCanvas = document.createElement('canvas')
  labelCanvas.className = 'en-graph-label-canvas'
  containerRef.value.appendChild(labelCanvas)
}

function buildRenderer () {
  destroyRenderer()
  if (!containerRef.value) return
  graphInstance = buildGraph(displayData.value)
  renderer = new Sigma(graphInstance, containerRef.value, {
    renderEdgeLabels: false,
    labelRenderedSizeThreshold: 9999,
    defaultEdgeType: 'curved',
    edgeProgramClasses: { curved: EdgeCurveProgram },
    zIndex: true,
    allowInvalidContainer: false,
    minCameraRatio: 0.1,
    maxCameraRatio: 4
  })
  installLabelCanvas()
  renderer.on('afterRender', drawLabels)
  renderer.on('enterNode', ({ node }) => {
    hoveredNodeRef = node
    hoverTargetRef = 1
    animateHover()
  })
  renderer.on('leaveNode', () => {
    hoveredNodeRef = null
    hoverTargetRef = 0
    animateHover()
  })
  renderer.on('clickNode', ({ node }) => {
    selectNode(node)
  })
  renderer.getCamera().on('updated', (state) => {
    zoomValue.value = 1 / state.ratio
    drawLabels()
  })
  resetView()
}

function animateHover () {
  cancelAnimationFrame(hoverRaf)
  const step = () => {
    const diff = hoverTargetRef - hoverAnimRef
    hoverAnimRef += diff * 0.18
    applyGraphVisualState()
    if (Math.abs(diff) > 0.01) hoverRaf = requestAnimationFrame(step)
  }
  hoverRaf = requestAnimationFrame(step)
}

function animateSelect () {
  cancelAnimationFrame(selectAnimRef)
  const step = () => {
    const diff = selectTargetRef - selectAnimRef
    selectAnimRef += diff * 0.16
    applyGraphVisualState()
    if (Math.abs(diff) > 0.01) selectAnimRef = requestAnimationFrame(step)
  }
  selectAnimRef = requestAnimationFrame(step)
}

function applyGraphVisualState () {
  if (!renderer || !graphInstance) return
  const t = theme.value
  const dimTarget = isLight.value ? [245, 247, 250] : [24, 28, 36]
  graphInstance.forEachNode((node, attrs) => {
    const isHovered = node === hoveredNodeRef
    const isSelected = node === selectedNodeRef
    const isNeighbor = selectedNodeRef ? neighborsMap.get(selectedNodeRef)?.has(node) : false
    const hasFocus = hoveredNodeRef || selectedNodeRef
    const focused = isHovered || isSelected || isNeighbor
    const dim = hasFocus && !focused
    const base = attrs.originalColor || nodeColor(attrs.source, t)
    attrs.color = dim ? dimHex(base, dimTarget, 0.72) : base
    attrs.size = Math.max(1.8, Number(attrs.source?.size || 5) * nodeSizeScale.value) * (isHovered ? 1 + 0.18 * hoverAnimRef : isSelected ? 1 + 0.22 * selectAnimRef : 1)
    attrs.zIndex = isSelected ? 20 : isHovered ? 15 : isNeighbor ? 10 : 0
  })
  graphInstance.forEachEdge((edge, attrs, source, target) => {
    const connected = selectedNodeRef && (source === selectedNodeRef || target === selectedNodeRef)
    const hovered = hoveredNodeRef && (source === hoveredNodeRef || target === hoveredNodeRef)
    const base = attrs.originalColor || edgeColorFor(attrs.edgeType)
    const visible = connected || hovered || (!selectedNodeRef && !hoveredNodeRef)
    attrs.color = visible ? base : dimHex(base, dimTarget, 0.82)
    attrs.size = Math.max(0.2, Number(attrs.size || 0.5)) * (connected ? 1.8 : hovered ? 1.45 : 1)
    attrs.zIndex = connected ? 15 : hovered ? 10 : attrs.edgeType === 'semantic' ? 1 : 0
  })
  renderer.refresh()
  drawLabels()
}

function selectNode (nodeId) {
  if (!graphInstance?.hasNode(nodeId)) return
  selectedNodeRef = nodeId
  selectTargetRef = 1
  const source = graphInstance.getNodeAttribute(nodeId, 'source')
  selectedNode.value = source || null
  cardCollapsed.value = false
  cardPos.x = null
  cardPos.y = null
  buildNeighborsMap()
  animateSelect()
}

function deselectNode () {
  selectedNodeRef = null
  selectedNode.value = null
  selectTargetRef = 0
  neighborsMap = new Map()
  animateSelect()
}

function onStageClick (event) {
  if (event.target === containerRef.value || event.target === labelCanvas) deselectNode()
}

function buildNeighborsMap () {
  const map = new Map()
  if (!graphInstance) return
  graphInstance.forEachNode((node) => map.set(node, new Set()))
  graphInstance.forEachEdge((_edge, _attrs, source, target) => {
    map.get(source)?.add(target)
    map.get(target)?.add(source)
  })
  neighborsMap = map
}

function resetView () {
  if (!renderer) return
  renderer.getCamera().animatedReset({ duration: 360 })
}

function onZoomSlider (event) {
  const value = Number(event.target.value)
  zoomValue.value = value
  renderer?.getCamera().setState({ ratio: 1 / value })
}

function animateGraph () {
  if (!graphInstance || animating.value) return
  animating.value = true
  const start = performance.now()
  const duration = 850
  const initial = new Map()
  graphInstance.forEachNode((node, attrs) => initial.set(node, { x: attrs.x, y: attrs.y }))
  const target = new Map()
  const nodes = graphInstance.nodes()
  const radius = Math.max(240, nodes.length * 14)
  nodes.forEach((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2
    target.set(node, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius })
  })
  const step = (now) => {
    const p = Math.min(1, (now - start) / duration)
    const eased = 1 - Math.pow(1 - p, 3)
    graphInstance.forEachNode((node, attrs) => {
      const a = initial.get(node)
      const b = target.get(node)
      attrs.x = a.x + (b.x - a.x) * eased
      attrs.y = a.y + (b.y - a.y) * eased
    })
    renderer.refresh()
    if (p < 1) simRaf = requestAnimationFrame(step)
    else {
      animating.value = false
      savePositions()
    }
  }
  simRaf = requestAnimationFrame(step)
}

function resetOptions () {
  filterQuery.value = ''
  filterTags.value = true
  filterExisting.value = true
  filterOrphans.value = false
  showLabels.value = true
  showStats.value = true
  labelThreshold.value = 7
  nodeSizeScale.value = 1
  linkThickness.value = 1
  forceCenter.value = 0.32
  forceRepulsion.value = 420
  forceLink.value = 0.55
  forceLinkDistance.value = 95
  buildRenderer()
}

function toggleSection (section) {
  section.open = !section.open
}

function addGroup () {
  const id = `group-${Date.now()}`
  groups.value.push({ id, name: `Groupe ${groups.value.length + 1}`, color: NODE_PALETTE[groups.value.length % NODE_PALETTE.length], count: 0 })
}

function toggleTimelapse () {
  timelapseActive.value = !timelapseActive.value
  if (!timelapseActive.value) stopTimelapse()
}

function stopTimelapse () {
  timelapseActive.value = false
  timelapsePlaying.value = false
  cancelAnimationFrame(timelapseRaf)
}

function cycleTimelapseSpeed () {
  timelapseSpeed.value = timelapseSpeed.value >= 4 ? 0.5 : timelapseSpeed.value * 2
}

function onTimelapseSeek (event) {
  timelapseProgress.value = Number(event.target.value)
  applyTimelapseFilter()
}

function applyTimelapseFilter () {
  if (!graphInstance) return
  const nodes = displayData.value.nodes
  const sorted = [...nodes].sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0))
  const count = Math.ceil((timelapseProgress.value / 100) * sorted.length)
  const visible = new Set(sorted.slice(0, count).map((n) => n.id))
  graphInstance.forEachNode((node, attrs) => { attrs.hidden = !visible.has(node) })
  renderer.refresh()
}

function startTimelapseLoop () {
  const step = () => {
    if (!timelapsePlaying.value) return
    timelapseProgress.value += 0.18 * timelapseSpeed.value
    if (timelapseProgress.value >= 100) {
      timelapseProgress.value = 100
      timelapsePlaying.value = false
    }
    applyTimelapseFilter()
    if (timelapsePlaying.value) timelapseRaf = requestAnimationFrame(step)
  }
  cancelAnimationFrame(timelapseRaf)
  timelapseRaf = requestAnimationFrame(step)
}

function openSelectedNode () {
  if (!selectedNode.value) return
  const pathname = selectedNode.value.pathname || selectedNode.value.path
  if (!pathname) return
  store.openNote(pathname)
}

function startCardDrag (event) {
  if (event.target.closest('button')) return
  cardDragging.value = true
  const rect = event.currentTarget.parentElement.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const offsetY = event.clientY - rect.top
  const onMove = (moveEvent) => {
    cardPos.x = Math.max(8, Math.min(window.innerWidth - rect.width - 8, moveEvent.clientX - offsetX))
    cardPos.y = Math.max(8, Math.min(window.innerHeight - rect.height - 8, moveEvent.clientY - offsetY))
  }
  const onUp = () => {
    cardDragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function savePositions () {
  if (!graphInstance) return
  const positions = {}
  graphInstance.forEachNode((node, attrs) => { positions[node] = { x: attrs.x, y: attrs.y } })
  canvasStore.saveCanvasPositions(positions)
}

watch(displayData, () => {
  graphMountRaf = requestAnimationFrame(buildRenderer)
}, { deep: true })

watch(theme, () => {
  if (!graphInstance) return
  graphInstance.forEachNode((node, attrs) => {
    const color = nodeColor(attrs.source, theme.value)
    attrs.originalColor = color
    attrs.color = color
  })
  renderer?.refresh()
  drawLabels()
}, { deep: true })

watch(timelapsePlaying, (playing) => {
  if (playing) startTimelapseLoop()
  else cancelAnimationFrame(timelapseRaf)
})

watch([nodeSizeScale, linkThickness], () => buildRenderer())
watch([showLabels, labelThreshold], drawLabels)

onMounted(async () => {
  indexBuilding.value = true
  await searchStore.loadIndexInspection({ force: true })
  indexBuilding.value = false
  graphData.value = rawGraph.value
  graphMountRaf = requestAnimationFrame(buildRenderer)
})

onBeforeUnmount(() => {
  savePositions()
  destroyRenderer()
  cancelAnimationFrame(simRaf)
  cancelAnimationFrame(timelapseRaf)
  cancelAnimationFrame(hoverRaf)
  cancelAnimationFrame(selectAnimRef)
  cancelAnimationFrame(graphMountRaf)
})
</script>

<style scoped src="./atomic-graph-view.css"></style>

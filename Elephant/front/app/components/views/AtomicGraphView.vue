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
                    <span class="en-filter-label">Pièces jointes</span>
                    <button
                      type="button"
                      class="en-switch"
                      :class="{ active: filterAttachments }"
                      @click="filterAttachments = !filterAttachments"
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
                    <span class="en-filter-label">Afficher les flèches</span>
                    <button
                      type="button"
                      class="en-switch"
                      :class="{ active: showArrows }"
                      @click="showArrows = !showArrows"
                    >
                      <span class="en-switch-thumb" />
                    </button>
                  </div>
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
            <span v-if="selectedNode.cluster">· {{ selectedNode.cluster }}</span>
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
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
  buildSemanticGraphSurface,
  buildSemanticViewModel,
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
const loading = ref(false)
const error = ref('')

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

const selectedNode = ref(null)
const selectedSource = ref(null)

const panelOpen = ref(true)
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
const filterAttachments = ref(false)
const filterExisting = ref(true)
const filterOrphans = ref(false)

const showArrows = ref(false)
const showLabels = ref(true)
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

const semanticThreshold = ref(0.24)
const showStructure = ref(false)

const theme = computed(() => canvasStore.activeTheme)
const isLight = computed(() => theme.value?.isLight)

const statusMessage = computed(() => {
  if (error.value) return error.value
  if (searchStore.status.status === 'indexing') return searchStore.status.message || 'Indexation…'
  if (graphData.value) return `${graphData.value.nodes.length} nœuds · ${graphData.value.edges.length} liens`
  return searchStore.status.message || 'Graphe sémantique non construit.'
})

const cardStyle = computed(() => {
  if (cardPos.x === null) return {}
  return { left: `${cardPos.x}px`, top: `${cardPos.y}px` }
})

const timelapseLabel = computed(() => {
  if (!graphData.value?.nodes?.length) return '—'
  const nodes = graphData.value.nodes
  const idx = Math.min(nodes.length - 1, Math.floor((timelapseProgress.value / 100) * nodes.length))
  const node = nodes[idx]
  if (!node?.updatedAt) return `Note ${idx + 1}/${nodes.length}`
  return new Date(node.updatedAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
})

function truncLabel (str, max) {
  if (!str) return ''
  return str.length > max ? str.substring(0, max - 1) + '\u2026' : str
}

function parseRgb (s) {
  const m = String(s || '').match(/^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/)
  return m ? [+m[1], +m[2], +m[3]] : null
}

function edgeColorFor (type = '') {
  if (type === 'semantic') return '#6d5fd3'
  if (type === 'explicit-link') return '#3b9b96'
  if (type === 'folder') return '#d98a3b'
  if (type === 'lexical') return '#9b6cff'
  return '#5a6478'
}

function edgeBaseColor (type) {
  return edgeColorFor(type)
}

function dimColor (rgb, target, amount) {
  if (!rgb) return target
  return `rgb(${Math.round(rgb[0] + (target[0] - rgb[0]) * amount)},${Math.round(rgb[1] + (target[1] - rgb[1]) * amount)},${Math.round(rgb[2] + (target[2] - rgb[2]) * amount)})`
}

function buildGraph (data) {
  const graph = new Graph()
  const t = theme.value
  const { nodes, edges, edgeCounts, maxEdges } = data

  for (const node of nodes) {
    const id = node.id
    const connectivity = (edgeCounts.get(id) || 0) / maxEdges
    const clusterIdx = node.clusterIndex || 0
    const baseSize = 3 + connectivity * 6 + (node.kind === 'folder' ? 3 : 0)
    graph.addNode(id, {
      x: node.x,
      y: node.y,
      size: baseSize,
      color: nodeColor(t, Math.min(1, 0.3 + connectivity), clusterIdx),
      label: truncLabel(node.title, 28),
      fullLabel: node.title,
      connectivity,
      clusterIndex: clusterIdx,
      tagIds: node.tags || [],
      data: node
    })
  }

  let minW = 1
  let maxW = 0
  for (const edge of edges) {
    if (edge.weight < minW) minW = edge.weight
    if (edge.weight > maxW) maxW = edge.weight
  }
  const wRange = Math.max(maxW - minW, 0.001)

  for (const edge of edges) {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) continue
    if (graph.hasEdge(edge.source, edge.target) || graph.hasEdge(edge.target, edge.source)) continue
    const w = (edge.weight - minW) / wRange
    graph.addEdge(edge.source, edge.target, {
      weight: w,
      type: 'curved',
      edgeType: edge.type || 'semantic',
      color: edgeColorFor(edge.type)
    })
  }

  return graph
}

function buildNeighbors (graph) {
  const neighbors = new Map()
  graph.forEachEdge((edge, attrs, source, target) => {
    if (!neighbors.has(source)) neighbors.set(source, new Set())
    if (!neighbors.has(target)) neighbors.set(target, new Set())
    neighbors.get(source).add(target)
    neighbors.get(target).add(source)
  })
  neighborsMap = neighbors
}

function drawLabels (sigma, graph, container) {
  const width = container.clientWidth
  const height = container.clientHeight
  if (!width || !height) return
  const ratio = window.devicePixelRatio || 1
  labelCanvas.width = width * ratio
  labelCanvas.height = height * ratio
  labelCanvas.style.width = `${width}px`
  labelCanvas.style.height = `${height}px`
  const ctx = labelCanvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const t = theme.value
  const placed = []

  function collides (rect, pad) {
    for (const p of placed) {
      if (rect.x - pad < p.x + p.w && rect.x + rect.w + pad > p.x &&
          rect.y - pad < p.y + p.h && rect.y + rect.h + pad > p.y) return true
    }
    return false
  }

  const sel = selectedNodeRef
  const hov = hoveredNodeRef
  const selAnim = selectAnimRef
  const hovAnim = hoverAnimRef

  const candidates = []
  graph.forEachNode((id, attrs) => {
    const pos = sigma.graphToViewport({ x: attrs.x, y: attrs.y })
    if (pos.x < -200 || pos.x > width + 50 || pos.y < -30 || pos.y > height + 50) return
    const rsize = sigma.scaleSize(attrs.size || 4) * nodeSizeScale.value
    candidates.push({
      id,
      vx: pos.x,
      vy: pos.y,
      rsize,
      label: attrs.label || '',
      fullLabel: attrs.fullLabel || attrs.label || '',
      size: attrs.size || 4
    })
  })

  candidates.sort((a, b) => {
    const aImportant = (a.id === sel ? 100 : a.id === hov ? 50 : 0) + a.rsize
    const bImportant = (b.id === sel ? 100 : b.id === hov ? 50 : 0) + b.rsize
    return bImportant - aImportant
  })

  const isPinned = (id) => id === sel || id === hov

  for (const c of candidates) {
    const pinned = isPinned(c.id)
    const isSel = c.id === sel
    const isHov = c.id === hov
    const cameraRatio = sigma.getCamera().getState().ratio
    const effectiveThreshold = labelThreshold.value * Math.max(0.5, cameraRatio)
    if (!pinned && !showLabels.value) continue
    if (!pinned && c.rsize < effectiveThreshold) continue

    const fontSize = isSel ? 14 : isHov ? 13 : 12
    const fontWeight = isSel ? 700 : isHov ? 600 : 500
    const maxChars = isSel ? 48 : isHov ? 36 : 26
    const labelText = truncLabel(c.fullLabel || c.label, maxChars)

    ctx.font = `${fontWeight} ${fontSize}px system-ui, -apple-system, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const tw = ctx.measureText(labelText).width
    const padX = pinned ? 10 : 8
    const padY = pinned ? 5 : 4
    const pillW = tw + padX * 2
    const pillH = fontSize + padY * 2
    const labelY = c.vy + c.rsize + pillH / 2 + 4
    const rect = { x: c.vx - pillW / 2, y: labelY - pillH / 2, w: pillW, h: pillH }

    if (!pinned && collides(rect, 6)) continue
    placed.push(rect)

    if (isSel) {
      ctx.globalAlpha = selAnim
    } else if (isHov) {
      ctx.globalAlpha = hovAnim
    } else {
      ctx.globalAlpha = 0.85
    }

    ctx.fillStyle = isLight.value ? 'rgba(18,22,30,0.9)' : 'rgba(18,22,30,0.92)'
    ctx.beginPath()
    ctx.roundRect(rect.x, rect.y, pillW, pillH, pillH / 2)
    ctx.fill()

    if (isSel) {
      ctx.strokeStyle = 'rgba(168,150,255,0.7)'
      ctx.lineWidth = 1.5
    } else if (isHov) {
      ctx.strokeStyle = 'rgba(170,160,255,0.45)'
      ctx.lineWidth = 1.2
    } else {
      ctx.strokeStyle = t.labelBorder || 'rgba(120,130,160,0.3)'
      ctx.lineWidth = 1
    }
    ctx.stroke()

    ctx.fillStyle = isSel ? '#f0edff' : isHov ? '#f0edff' : (t.nodeLabelColor || '#c8c8d4')
    ctx.fillText(labelText, c.vx, labelY)
    ctx.globalAlpha = 1

    if (isSel) {
      ctx.beginPath()
      ctx.arc(c.vx, c.vy, c.rsize + 4, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(168,150,255,${0.5 * selAnim})`
      ctx.lineWidth = 2
      ctx.stroke()
    } else if (isHov) {
      ctx.beginPath()
      ctx.arc(c.vx, c.vy, c.rsize + 3, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(255,255,255,${0.45 * hovAnim})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}

function mountSigma () {
  const container = containerRef.value
  const data = graphData.value
  if (!container || !data || data.nodes.length === 0) return

  destroySigma()

  const graph = buildGraph(data)
  graphInstance = graph
  buildNeighbors(graph)

  hoveredNodeRef = null
  selectedNodeRef = null
  hoverAnimRef = 0
  selectAnimRef = 0
  hoverTargetRef = 0
  selectTargetRef = 0

  const bgDim = isLight.value ? [245, 245, 245] : [30, 30, 30]

  let sigma
  try {
    sigma = new Sigma(graph, container, {
      renderLabels: false,
      labelFont: 'system-ui, -apple-system, sans-serif',
      defaultEdgeColor: '#333',
      defaultNodeColor: '#555',
      defaultEdgeType: 'curved',
      zIndex: true,
      edgeProgramClasses: { curved: EdgeCurveProgram },
      minCameraRatio: 0.05,
      maxCameraRatio: 8,
      stagePadding: 40,
      defaultDrawNodeHover: () => {},
      nodeReducer: (node, attrs) => {
        const sel = selectedNodeRef
        const hov = hoveredNodeRef
        const focusActive = sel && selectAnimRef > 0.1
        const hoverActive = hov && hoverAnimRef > 0.1
        const active = focusActive || hoverActive
        if (!active) {
          return {
            ...attrs,
            size: (attrs.size || 4) * nodeSizeScale.value
          }
        }
        const isSel = node === sel
        const isHov = node === hov
        if (isSel) {
          return {
            ...attrs,
            size: (attrs.size || 4) * nodeSizeScale.value * (1 + 0.45 * selectAnimRef),
            zIndex: 3
          }
        }
        if (isHov) {
          return {
            ...attrs,
            size: (attrs.size || 4) * nodeSizeScale.value * (1 + 0.35 * hoverAnimRef),
            zIndex: 2
          }
        }
        const selNeighbor = sel && neighborsMap.get(sel)?.has(node)
        const hovNeighbor = hov && neighborsMap.get(hov)?.has(node)
        if (selNeighbor || hovNeighbor) {
          return {
            ...attrs,
            size: (attrs.size || 4) * nodeSizeScale.value * 1.12,
            zIndex: 1
          }
        }
        const dim = Math.max(selectAnimRef, hoverAnimRef)
        const rgb = parseRgb(attrs.color)
        return {
          ...attrs,
          color: dimColor(rgb, bgDim, dim * 0.88),
          size: (attrs.size || 4) * nodeSizeScale.value * (1 - 0.5 * dim)
        }
      },
      edgeReducer: (edge, attrs) => {
        const w = attrs.weight ?? 0.5
        const sel = selectedNodeRef
        const hov = hoveredNodeRef
        const g = graphInstance
        if (!g) return attrs
        const src = g.source(edge)
        const dst = g.target(edge)
        const baseSize = (0.25 + w * 0.7) * linkThickness.value
        const baseColor = edgeBaseColor(attrs.edgeType) || edgeColorFor(attrs.edgeType) || attrs.color

        const touchesSel = sel && (src === sel || dst === sel)
        const touchesHov = hov && (src === hov || dst === hov)
        const focusActive = sel && selectAnimRef > 0.1
        const hoverActive = hov && hoverAnimRef > 0.1

        if (touchesSel && focusActive) {
          return {
            ...attrs,
            color: baseColor,
            size: baseSize + 0.6 * selectAnimRef,
            zIndex: 2
          }
        }
        if (touchesHov && hoverActive) {
          return {
            ...attrs,
            color: baseColor,
            size: baseSize + 0.5 * hoverAnimRef,
            zIndex: 1
          }
        }
        if (focusActive || hoverActive) {
          const dim = Math.max(selectAnimRef, hoverAnimRef)
          return {
            ...attrs,
            color: dimColor(parseRgb(baseColor), bgDim, dim * 0.92),
            size: baseSize * (1 - 0.7 * dim)
          }
        }
        return {
          ...attrs,
          color: baseColor,
          size: baseSize
        }
      }
    })
  } catch (err) {
    console.error('AtomicGraphView: sigma init failed', err)
    error.value = 'Impossible d\'initialiser le graphe.'
    return
  }

  renderer = sigma

  labelCanvas = document.createElement('canvas')
  labelCanvas.style.position = 'absolute'
  labelCanvas.style.inset = '0'
  labelCanvas.style.pointerEvents = 'none'
  labelCanvas.style.zIndex = '10'
  container.appendChild(labelCanvas)

  const drawLabelsBound = () => {
    if (renderer && graphInstance && containerRef.value) {
      drawLabels(renderer, graphInstance, containerRef.value)
    }
  }
  renderer.on('afterRender', drawLabelsBound)
  requestAnimationFrame(drawLabelsBound)

  let xMin = Infinity; let xMax = -Infinity; let yMin = Infinity; let yMax = -Infinity
  graph.forEachNode((id, attrs) => {
    if (attrs.x < xMin) xMin = attrs.x
    if (attrs.x > xMax) xMax = attrs.x
    if (attrs.y < yMin) yMin = attrs.y
    if (attrs.y > yMax) yMax = attrs.y
  })
  renderer.setCustomBBox({ x: [xMin, xMax], y: [yMin, yMax] })

  renderer.getCamera().on('updated', () => {
    const state = renderer.getCamera().getState()
    zoomValue.value = 1 / state.ratio
  })

  let hoverRaf = null
  const tickHover = () => {
    const diff = hoverTargetRef - hoverAnimRef
    const diffSel = selectTargetRef - selectAnimRef
    if (Math.abs(diff) < 0.005 && Math.abs(diffSel) < 0.005) {
      hoverAnimRef = hoverTargetRef
      selectAnimRef = selectTargetRef
      if (hoverTargetRef === 0) hoveredNodeRef = null
      renderer.refresh()
      hoverRaf = null
      return
    }
    hoverAnimRef += diff * 0.22
    selectAnimRef += diffSel * 0.22
    renderer.refresh()
    hoverRaf = requestAnimationFrame(tickHover)
  }
  const startAnim = () => {
    if (hoverRaf !== null) return
    hoverRaf = requestAnimationFrame(tickHover)
  }

  renderer.on('enterNode', ({ node }) => {
    hoveredNodeRef = node
    hoverTargetRef = 1
    startAnim()
  })
  renderer.on('leaveNode', () => {
    hoverTargetRef = 0
    startAnim()
  })
  renderer.on('clickNode', ({ node }) => {
    const data = graph.getNodeAttribute(node, 'data')
    selectNode(data, node)
  })
  renderer.on('clickStage', () => {
    deselectNode()
  })
}

function destroySigma () {
  if (renderer) {
    renderer.kill()
    renderer = null
  }
  if (labelCanvas && labelCanvas.parentNode) {
    labelCanvas.remove()
    labelCanvas = null
  }
  graphInstance = null
  neighborsMap = new Map()
}

function selectNode (data, nodeId) {
  selectedNodeRef = nodeId
  selectTargetRef = 1
  selectedNode.value = data
  selectedSource.value = null
  cardCollapsed.value = false
  if (cardPos.x === null) positionCardNearNode(nodeId)
  if (renderer && graphInstance && graphInstance.hasNode(nodeId)) {
    const gx = graphInstance.getNodeAttribute(nodeId, 'x')
    const gy = graphInstance.getNodeAttribute(nodeId, 'y')
    let xMin = Infinity; let xMax = -Infinity; let yMin = Infinity; let yMax = -Infinity
    graphInstance.forEachNode((id, attrs) => {
      if (attrs.x < xMin) xMin = attrs.x
      if (attrs.x > xMax) xMax = attrs.x
      if (attrs.y < yMin) yMin = attrs.y
      if (attrs.y > yMax) yMax = attrs.y
    })
    const bboxW = xMax - xMin || 1
    const bboxH = yMax - yMin || 1
    const camX = (gx - xMin) / bboxW
    const camY = (gy - yMin) / bboxH
    renderer.getCamera().animate(
      { x: camX, y: camY, ratio: 0.4 },
      { duration: 520, easing: (k) => 1 - Math.pow(1 - k, 3) }
    )
  }
  if (renderer) renderer.refresh()
}

function positionCardNearNode (nodeId) {
  if (!renderer || !graphInstance || !containerRef.value) return
  if (!graphInstance.hasNode(nodeId)) return
  const attrs = graphInstance.getNodeAttribute(nodeId)
  const pos = renderer.graphToViewport({ x: attrs.x, y: attrs.y })
  const w = containerRef.value.clientWidth
  const cardW = 380
  let x = pos.x + 40
  if (x + cardW > w - 16) x = Math.max(16, pos.x - cardW - 40)
  const y = Math.max(16, pos.y - 60)
  cardPos.x = x
  cardPos.y = y
}

function deselectNode () {
  selectedNodeRef = null
  selectTargetRef = 0
  selectedNode.value = null
  selectedSource.value = null
  cardPos.x = null
  cardPos.y = null
  cardCollapsed.value = false
  if (renderer) renderer.refresh()
}

function onStageClick (event) {
  if (event.target === containerRef.value) {
    deselectNode()
  }
}

function startCardDrag (event) {
  if (cardCollapsed.value) return
  cardDragging.value = true
  const startX = event.clientX
  const startY = event.clientY
  const startPX = cardPos.x || 0
  const startPY = cardPos.y || 0

  const onMove = (e) => {
    if (!cardDragging.value) return
    const w = containerRef.value?.clientWidth || 800
    const h = containerRef.value?.clientHeight || 600
    let nx = startPX + (e.clientX - startX)
    let ny = startPY + (e.clientY - startY)
    nx = Math.max(12, Math.min(w - 392, nx))
    ny = Math.max(12, Math.min(h - 80, ny))
    cardPos.x = nx
    cardPos.y = ny
  }
  const onUp = () => {
    cardDragging.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function resetView () {
  if (!renderer) return
  renderer.getCamera().animatedReset({ duration: 500 })
}

function onZoomSlider (event) {
  const val = Number(event.target.value)
  zoomValue.value = val
  if (renderer) {
    renderer.getCamera().animate({ ratio: 1 / val }, { duration: 120 })
  }
}

function toggleSection (section) {
  section.open = !section.open
}

function resetOptions () {
  filterQuery.value = ''
  filterTags.value = true
  filterAttachments.value = false
  filterExisting.value = true
  filterOrphans.value = false
  showArrows.value = false
  showLabels.value = true
  labelThreshold.value = 7
  nodeSizeScale.value = 1
  linkThickness.value = 1
  forceCenter.value = 0.32
  forceRepulsion.value = 420
  forceLink.value = 0.55
  forceLinkDistance.value = 95
  if (renderer) renderer.refresh()
}

function addGroup () {
  const idx = groups.value.length
  groups.value.push({
    id: `group-${Date.now()}`,
    name: `Groupe ${idx + 1}`,
    color: NODE_PALETTE[idx % NODE_PALETTE.length],
    count: 0
  })
}

function runForceSimulation (duration = 1500) {
  if (!graphInstance || !renderer) return
  animating.value = true
  const start = performance.now()
  const nodes = graphInstance.nodes()
  if (nodes.length === 0) {
    animating.value = false
    return
  }

  const tick = (now) => {
    const elapsed = now - start
    const progress = Math.min(1, elapsed / duration)
    const damping = 1 - progress * 0.7
    const iterations = 3

    for (let iter = 0; iter < iterations; iter++) {
      const forces = new Map(nodes.map((n) => [n, { fx: 0, fy: 0 }]))

      for (let i = 0; i < nodes.length; i++) {
        const a = graphInstance.getNodeAttributes(nodes[i])
        for (let j = i + 1; j < nodes.length; j++) {
          const b = graphInstance.getNodeAttributes(nodes[j])
          let dx = a.x - b.x
          let dy = a.y - b.y
          let dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; dist = 1 }
          const f = (forceRepulsion.value * damping) / (dist * dist)
          forces.get(nodes[i]).fx += (dx / dist) * f
          forces.get(nodes[i]).fy += (dy / dist) * f
          forces.get(nodes[j]).fx -= (dx / dist) * f
          forces.get(nodes[j]).fy -= (dy / dist) * f
        }
      }

      graphInstance.forEachEdge((edge, attrs, s, t) => {
        const a = graphInstance.getNodeAttributes(s)
        const b = graphInstance.getNodeAttributes(t)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const f = forceLink.value * (dist - forceLinkDistance.value) * damping
        forces.get(s).fx += (dx / dist) * f
        forces.get(s).fy += (dy / dist) * f
        forces.get(t).fx -= (dx / dist) * f
        forces.get(t).fy -= (dy / dist) * f
      })

      for (const n of nodes) {
        const a = graphInstance.getNodeAttributes(n)
        forces.get(n).fx -= a.x * forceCenter.value * damping
        forces.get(n).fy -= a.y * forceCenter.value * damping
      }

      for (const n of nodes) {
        const a = graphInstance.getNodeAttributes(n)
        const f = forces.get(n)
        a.x += f.fx * 0.08 * damping
        a.y += f.fy * 0.08 * damping
      }
    }

    renderer.refresh()
    if (progress < 1) {
      simRaf = requestAnimationFrame(tick)
    } else {
      animating.value = false
      simRaf = null
      const positions = {}
      graphInstance.forEachNode((id, attrs) => {
        positions[id] = { x: attrs.x, y: attrs.y }
      })
      canvasStore.persistPositions(store.activeVaultId || 'default', positions)
    }
  }
  simRaf = requestAnimationFrame(tick)
}

function animateGraph () {
  runForceSimulation(1500)
}

function toggleTimelapse () {
  if (timelapseActive.value) {
    stopTimelapse()
    return
  }
  timelapseActive.value = true
  timelapsePlaying.value = true
  timelapseProgress.value = 0
  runTimelapse()
}

function stopTimelapse () {
  timelapseActive.value = false
  timelapsePlaying.value = false
  if (timelapseRaf) {
    cancelAnimationFrame(timelapseRaf)
    timelapseRaf = null
  }
  if (renderer) renderer.refresh()
}

function runTimelapse () {
  if (!timelapseActive.value) return
  const start = performance.now()
  const startProgress = timelapseProgress.value
  const speed = timelapseSpeed.value
  const duration = (100 - startProgress) * 120 / speed

  const tick = (now) => {
    if (!timelapseActive.value || !timelapsePlaying.value) return
    const elapsed = now - start
    const progress = Math.min(100, startProgress + (elapsed / duration) * 100)
    timelapseProgress.value = progress
    updateTimelapseVisibility(progress)
    if (progress >= 100) {
      timelapsePlaying.value = false
      timelapseRaf = null
      return
    }
    timelapseRaf = requestAnimationFrame(tick)
  }
  timelapseRaf = requestAnimationFrame(tick)
}

function updateTimelapseVisibility (progress) {
  if (!graphInstance || !renderer || !graphData.value) return
  const nodes = graphData.value.nodes
  const visibleCount = Math.max(1, Math.floor((progress / 100) * nodes.length))
  const visibleIds = new Set(nodes.slice(0, visibleCount).map((n) => n.id))
  graphInstance.forEachNode((id) => {
    graphInstance.setNodeAttribute(id, 'hidden', !visibleIds.has(id))
  })
  graphInstance.forEachEdge((edge, attrs, s, t) => {
    graphInstance.setEdgeAttribute(edge, 'hidden', !visibleIds.has(s) || !visibleIds.has(t))
  })
  renderer.refresh()
}

function onTimelapseSeek (event) {
  timelapseProgress.value = Number(event.target.value)
  updateTimelapseVisibility(timelapseProgress.value)
}

function cycleTimelapseSpeed () {
  const speeds = [1, 2, 4]
  const idx = speeds.indexOf(timelapseSpeed.value)
  timelapseSpeed.value = speeds[(idx + 1) % speeds.length]
  if (timelapsePlaying.value) {
    runTimelapse()
  }
}

function openSelectedNode () {
  if (!selectedNode.value?.relativePath && !selectedNode.value?.path) return
  const notePath = selectedNode.value.relativePath || selectedNode.value.path
  const note = [...store.entries, ...store.rootEntries, ...store.openedNotes]
    .find((entry) => entry?.path === notePath)
  if (note) {
    store.openNote(note)
    return
  }
  store.openNote({
    kind: 'note',
    type: 'note',
    path: notePath,
    title: selectedNode.value.title,
    updatedAt: selectedNode.value.updatedAt
  })
}

function loadGraphData () {
  if (!searchStore.indexInspection?.graph) return
  const surface = buildSemanticGraphSurface({
    graph: selectSemanticGraphSource({
      inspectionGraph: searchStore.indexInspection?.graph
    }),
    includeStructure: showStructure.value
  })
  const model = buildSemanticViewModel({
    graph: selectSemanticGraphSource({
      inspectionGraph: searchStore.indexInspection?.graph
    }),
    savedPositions: canvasStore.canvasPositions,
    width: 1800,
    height: 1200
  })
  graphData.value = {
    nodes: model.nodes.filter((n) => {
      if (filterExisting.value && n.kind === 'folder') return showStructure.value
      return true
    }),
    edges: model.edges,
    edgeCounts: model.edgeCounts,
    maxEdges: model.maxEdges,
    clusters: model.clusters || surface.clusters
  }
}

async function ensureIndex () {
  loading.value = true
  error.value = ''
  try {
    await searchStore.inspect()
    loadGraphData()
    await nextTick()
    mountSigma()
  } catch (err) {
    error.value = err?.message || 'Impossible de construire le graphe sémantique.'
  } finally {
    loading.value = false
  }
}

watch(() => searchStore.indexInspection?.graph, () => {
  loadGraphData()
  nextTick(() => mountSigma())
})

watch(() => store.activeVault?.path, () => {
  ensureIndex()
})

watch([semanticThreshold, showStructure, filterTags, filterExisting, filterOrphans], () => {
  loadGraphData()
  nextTick(() => mountSigma())
})

watch([nodeSizeScale, linkThickness, labelThreshold, showLabels], () => {
  if (renderer) renderer.refresh()
})

watch(theme, () => {
  if (!graphInstance || !renderer) return
  const t = theme.value
  const { edgeCounts, maxEdges } = graphData.value || {}
  graphInstance.forEachNode((node, attrs) => {
    const connectivity = (edgeCounts?.get(node) || 0) / (maxEdges || 1)
    graphInstance.setNodeAttribute(node, 'color', nodeColor(t, Math.min(1, 0.3 + connectivity), attrs.clusterIndex))
  })
  renderer.refresh()
})

onMounted(() => {
  canvasStore.loadPositions(store.activeVaultId || 'default')
  ensureIndex()
})

onBeforeUnmount(() => {
  if (simRaf) cancelAnimationFrame(simRaf)
  if (timelapseRaf) cancelAnimationFrame(timelapseRaf)
  destroySigma()
})
</script>

<style scoped>
.en-graph-premium {
  position: relative;
  min-height: 0;
  flex: 1;
  display: flex;
  overflow: hidden;
  background:
    radial-gradient(circle at center, #1f1f1f 0%, #181818 65%, #141414 100%);
}

.en-graph-stage {
  position: absolute;
  inset: 0;
  overflow: hidden;
  cursor: grab;
}

.en-graph-stage:active {
  cursor: grabbing;
}

.en-graph-status {
  position: absolute;
  left: 50%;
  top: 18px;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(24, 24, 24, 0.85);
  border: 1px solid rgba(60, 60, 60, 0.5);
  color: #b8b8b8;
  font-size: 12px;
  backdrop-filter: blur(12px);
  z-index: 15;
  pointer-events: none;
}

.en-graph-floating-icons {
  position: absolute;
  top: 18px;
  right: 22px;
  display: flex;
  gap: 8px;
  z-index: 20;
}

.en-graph-floating-icon {
  width: 42px;
  height: 42px;
  border-radius: 11px;
  border: 1px solid rgba(60, 60, 60, 0.6);
  background: rgba(34, 34, 34, 0.92);
  color: #cfcfcf;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.16s, color 0.16s, border-color 0.16s;
  backdrop-filter: blur(10px);
}

.en-graph-floating-icon:hover {
  background: #303030;
  color: #ffffff;
  border-color: rgba(139, 92, 246, 0.5);
}

.en-graph-floating-icon.active {
  background: rgba(139, 92, 246, 0.2);
  color: #c4b5fd;
  border-color: rgba(139, 92, 246, 0.6);
}

.en-fi-svg {
  width: 19px;
  height: 19px;
}

.en-graph-zoom-control {
  position: absolute;
  left: 24px;
  bottom: 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 20;
}

.en-graph-zoom-button {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: #8b5cf6;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 0 14px rgba(139, 92, 246, 0.45);
  transition: transform 0.15s, box-shadow 0.15s;
}

.en-graph-zoom-button:hover {
  transform: scale(1.08);
  box-shadow: 0 0 18px rgba(139, 92, 246, 0.6);
}

.en-gz-svg {
  width: 16px;
  height: 16px;
}

.en-graph-zoom-slider {
  width: 110px;
  height: 4px;
  appearance: none;
  background: #333333;
  border-radius: 999px;
  cursor: pointer;
}

.en-graph-zoom-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #cfcfcf;
  cursor: pointer;
}

.en-graph-zoom-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #cfcfcf;
  border: none;
  cursor: pointer;
}

.en-graph-zoom-pct {
  color: #9a9a9a;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  min-width: 38px;
}

.en-graph-settings-panel {
  position: absolute;
  top: 72px;
  right: 22px;
  width: 380px;
  max-height: calc(100% - 110px);
  display: flex;
  flex-direction: column;
  background: #222222;
  border: 1px solid #3a3a3a;
  border-radius: 18px;
  box-shadow:
    0 18px 48px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.03);
  overflow: hidden;
  color: #e2e2e2;
  z-index: 25;
}

.en-panel-topbar {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 22px;
  border-bottom: 1px solid #363636;
  flex-shrink: 0;
}

.en-panel-topbar-title {
  font-size: 16px;
  font-weight: 700;
  color: #f0f0f0;
}

.en-panel-topbar-actions {
  display: flex;
  gap: 4px;
}

.en-panel-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: #b8b8b8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
}

.en-panel-icon-btn:hover {
  background: #303030;
  color: #ffffff;
}

.en-panel-icn {
  width: 17px;
  height: 17px;
}

.en-panel-scroll {
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.en-panel-scroll::-webkit-scrollbar {
  width: 6px;
}

.en-panel-scroll::-webkit-scrollbar-thumb {
  background: #3a3a3a;
  border-radius: 999px;
}

.en-panel-section {
  border-bottom: 1px solid #2e2e2e;
}

.en-panel-section:last-child {
  border-bottom: none;
}

.en-section-header {
  width: 100%;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 22px;
  border: none;
  background: transparent;
  color: #dedede;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.14s;
  text-align: left;
}

.en-section-header:hover {
  background: rgba(255, 255, 255, 0.03);
}

.en-section-chevron {
  width: 18px;
  height: 18px;
  color: #8b8b8b;
  transition: transform 0.22s ease;
  transform: rotate(-90deg);
  flex-shrink: 0;
}

.en-section-header.open .en-section-chevron {
  transform: rotate(0deg);
}

.en-section-title {
  flex: 1;
}

.en-section-body {
  padding: 8px 22px 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.en-filter-search {
  position: relative;
  margin-bottom: 4px;
}

.en-filter-search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 17px;
  height: 17px;
  color: #888888;
  pointer-events: none;
}

.en-filter-input {
  width: 100%;
  height: 44px;
  border-radius: 10px;
  background: #252525;
  border: 1px solid #3a3a3a;
  color: #e0e0e0;
  font-size: 14px;
  padding: 0 14px 0 40px;
  outline: none;
  transition: border-color 0.14s;
}

.en-filter-input::placeholder {
  color: #777777;
}

.en-filter-input:focus {
  border-color: rgba(139, 92, 246, 0.6);
}

.en-filter-row {
  min-height: 48px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
  font-weight: 600;
  color: #dcdcdc;
}

.en-switch {
  width: 46px;
  height: 26px;
  border-radius: 999px;
  border: none;
  background: #3a3a3a;
  padding: 3px;
  cursor: pointer;
  transition: background 0.16s ease;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.en-switch-thumb {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  transition: transform 0.16s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}

.en-switch.active {
  background: #8b5cf6;
}

.en-switch.active .en-switch-thumb {
  transform: translateX(20px);
}

.en-slider-control {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.en-slider-label {
  font-size: 14px;
  font-weight: 600;
  color: #dcdcdc;
}

.en-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: #3a3a3a;
  outline: none;
  cursor: pointer;
}

.en-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 22px;
  height: 16px;
  border-radius: 999px;
  background: #ffffff;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  transition: transform 0.12s;
}

.en-slider::-webkit-slider-thumb:hover {
  transform: scale(1.08);
}

.en-slider::-moz-range-thumb {
  width: 22px;
  height: 16px;
  border-radius: 999px;
  background: #ffffff;
  border: none;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.45);
}

.en-primary-button {
  width: 100%;
  height: 48px;
  border-radius: 10px;
  border: none;
  background: linear-gradient(180deg, #9b6cff 0%, #8655ee 100%);
  color: #ffffff;
  font-size: 15px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  transition: background 0.16s, transform 0.12s;
}

.en-primary-button:hover:not(:disabled) {
  background: linear-gradient(180deg, #a77bff 0%, #8b5cf6 100%);
}

.en-primary-button:active:not(:disabled) {
  transform: translateY(1px);
}

.en-primary-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.en-btn-icn {
  width: 18px;
  height: 18px;
}

.en-spin {
  animation: en-spin 0.8s linear infinite;
}

@keyframes en-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.en-group-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.en-group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: #2a2a2a;
  font-size: 13px;
}

.en-group-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex-shrink: 0;
}

.en-group-name {
  flex: 1;
  color: #dcdcdc;
}

.en-group-count {
  color: #888888;
  font-size: 12px;
}

.en-timeline-panel {
  position: absolute;
  left: 50%;
  bottom: 28px;
  transform: translateX(-50%);
  height: 52px;
  min-width: 540px;
  max-width: 90%;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 16px;
  background: rgba(28, 28, 28, 0.92);
  border: 1px solid #383838;
  border-radius: 14px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(12px);
  z-index: 22;
}

.en-timeline-play,
.en-timeline-close {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: none;
  background: #8b5cf6;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.14s;
}

.en-timeline-play:hover {
  background: #9b6cff;
}

.en-timeline-close {
  background: #3a3a3a;
}

.en-timeline-close:hover {
  background: #4a4a4a;
}

.en-tl-icn {
  width: 16px;
  height: 16px;
}

.en-timeline-slider {
  flex: 1;
  height: 5px;
  -webkit-appearance: none;
  appearance: none;
  background: #3a3a3a;
  border-radius: 999px;
  cursor: pointer;
}

.en-timeline-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #8b5cf6;
  cursor: pointer;
  box-shadow: 0 0 8px rgba(139, 92, 246, 0.5);
}

.en-timeline-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #8b5cf6;
  border: none;
  cursor: pointer;
}

.en-timeline-date {
  color: #d0d0d0;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 120px;
}

.en-timeline-speed {
  padding: 5px 12px;
  border-radius: 8px;
  border: 1px solid #3a3a3a;
  background: #2a2a2a;
  color: #d0d0d0;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.14s;
}

.en-timeline-speed:hover {
  background: #343434;
}

.en-note-preview-card {
  position: absolute;
  width: 380px;
  max-height: 460px;
  display: flex;
  flex-direction: column;
  background: rgba(47, 47, 47, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 12px;
  box-shadow:
    0 18px 46px rgba(0, 0, 0, 0.55),
    0 0 0 1px rgba(255, 255, 255, 0.03);
  color: #e7e7e7;
  overflow: hidden;
  z-index: 30;
  transition: opacity 0.18s ease, transform 0.18s ease, max-height 0.22s ease;
}

.en-note-preview-card.collapsed {
  max-height: 56px;
}

.en-note-preview-card.dragging {
  cursor: grabbing;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65);
}

.en-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px;
  cursor: grab;
  flex-shrink: 0;
}

.en-card-header:active {
  cursor: grabbing;
}

.en-card-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #f2f2f2;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.en-card-header-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.en-card-mini-btn {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  border: none;
  background: transparent;
  color: #b0b0b0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
}

.en-card-mini-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #ffffff;
}

.en-card-icn {
  width: 15px;
  height: 15px;
}

.en-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 0 16px;
  color: #9a9a9a;
  font-size: 12px;
}

.en-card-summary {
  margin: 12px 0 0;
  padding: 0 16px;
  font-size: 14px;
  line-height: 1.5;
  color: #d4d4d4;
  max-height: 140px;
  overflow-y: auto;
}

.en-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 16px 0;
}

.en-card-tag {
  padding: 4px 9px;
  border-radius: 999px;
  background: rgba(139, 92, 246, 0.15);
  border: 1px solid rgba(139, 92, 246, 0.3);
  color: #c4b5fd;
  font-size: 12px;
  font-weight: 600;
}

.en-card-open {
  margin: 0;
  height: 50px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  background: transparent;
  color: #a77bff;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.14s, color 0.14s;
  flex-shrink: 0;
}

.en-card-open:hover {
  background: rgba(139, 92, 246, 0.1);
  color: #c4b5fd;
}

.en-card-open-icn {
  width: 16px;
  height: 16px;
}

.en-panel-enter-active,
.en-panel-leave-active {
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.en-panel-enter-from,
.en-panel-leave-to {
  opacity: 0;
  transform: translateX(20px);
}

.en-accordion-enter-active,
.en-accordion-leave-active {
  transition: opacity 0.18s ease;
  overflow: hidden;
}

.en-accordion-enter-from,
.en-accordion-leave-to {
  opacity: 0;
}

.en-timeline-enter-active,
.en-timeline-leave-active {
  transition: opacity 0.24s ease, transform 0.24s ease;
}

.en-timeline-enter-from,
.en-timeline-leave-to {
  opacity: 0;
  transform: translate(-50%, 20px);
}

.en-card-enter-active,
.en-card-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.en-card-enter-from,
.en-card-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.96);
}

:global(.en-shell.en-theme-light) .en-graph-premium {
  background:
    radial-gradient(circle at center, #f5f5f7 0%, #ececef 65%, #e4e4e7 100%);
}

:global(.en-shell.en-theme-light) .en-graph-settings-panel {
  background: #ffffff;
  border-color: #d8d8de;
  color: #2a2a2a;
}

:global(.en-shell.en-theme-light) .en-section-header,
:global(.en-shell.en-theme-light) .en-panel-topbar-title,
:global(.en-shell.en-theme-light) .en-filter-label,
:global(.en-shell.en-theme-light) .en-slider-label {
  color: #2a2a2a;
}

:global(.en-shell.en-theme-light) .en-panel-icon-btn {
  color: #555555;
}

:global(.en-shell.en-theme-light) .en-panel-icon-btn:hover {
  background: #f0f0f3;
  color: #000000;
}

:global(.en-shell.en-theme-light) .en-filter-input {
  background: #f3f3f5;
  border-color: #d8d8de;
  color: #2a2a2a;
}

:global(.en-shell.en-theme-light) .en-switch {
  background: #d0d0d6;
}

:global(.en-shell.en-theme-light) .en-slider {
  background: #d0d0d6;
}

:global(.en-shell.en-theme-light) .en-note-preview-card {
  background: rgba(255, 255, 255, 0.97);
  border-color: rgba(0, 0, 0, 0.1);
  color: #2a2a2a;
  box-shadow: 0 18px 46px rgba(0, 0, 0, 0.18);
}

:global(.en-shell.en-theme-light) .en-card-title {
  color: #1a1a1a;
}

:global(.en-shell.en-theme-light) .en-card-summary {
  color: #444444;
}

:global(.en-shell.en-theme-light) .en-card-meta {
  color: #666666;
}

:global(.en-shell.en-theme-light) .en-timeline-panel {
  background: rgba(255, 255, 255, 0.94);
  border-color: #d8d8de;
}

:global(.en-shell.en-theme-light) .en-timeline-date {
  color: #2a2a2a;
}

:global(.en-shell.en-theme-light) .en-timeline-speed {
  background: #f0f0f3;
  border-color: #d8d8de;
  color: #2a2a2a;
}

:global(.en-shell.en-theme-light) .en-group-item {
  background: #f3f3f5;
}

:global(.en-shell.en-theme-light) .en-graph-status {
  background: rgba(255, 255, 255, 0.88);
  border-color: rgba(0, 0, 0, 0.1);
  color: #555555;
}
</style>

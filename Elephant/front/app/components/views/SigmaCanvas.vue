<template>
  <section class="en-sigma-canvas">
    <header class="en-sigma-header">
      <h1>Graph</h1>
      <p v-if="canvasData">
        {{ canvasData.atoms.length }} notes, {{ canvasData.edges.length }} links
      </p>
      <div class="en-sigma-controls">
        <button
          type="button"
          class="en-sigma-theme-btn"
          :style="{ background: `linear-gradient(135deg, rgb(${theme.nodeMin.join(',')}), rgb(${theme.nodeMax.join(',')}))` }"
          title="Change theme palette"
          @click="themePickerOpen = !themePickerOpen"
        />
        <div
          v-if="themePickerOpen"
          class="en-sigma-theme-picker"
        >
          <button
            v-for="t in themes.filter(t => t.id !== theme.id)"
            :key="t.id"
            type="button"
            class="en-sigma-theme-swatch"
            :style="{ background: `linear-gradient(135deg, rgb(${t.dark.nodeMin.join(',')}), rgb(${t.dark.nodeMax.join(',')}))` }"
            :title="t.name"
            @click="selectTheme(t)"
          />
        </div>
      </div>
    </header>
    <div
      ref="containerRef"
      class="en-sigma-stage"
    />
    <div
      ref="hoverPillRef"
      class="en-sigma-hover-pill"
      style="display:none"
    />
    <div
      v-if="isLoading"
      class="en-sigma-loading"
    >
      Computing layout…
    </div>
    <div
      v-if="error"
      class="en-sigma-error"
    >
      <p>{{ error }}</p>
    </div>
    <div class="en-sigma-edge-slider">
      <input
        type="range"
        min="0"
        max="100"
        :value="(1 - edgeThreshold) * 100"
        @input="edgeThreshold = 1 - $event.target.value / 100"
      >
      <span>{{ Math.round((1 - edgeThreshold) * 100) }}%</span>
    </div>
    <div
      v-if="localGraphOpen"
      class="en-sigma-local-overlay"
    >
      <local-graph-view />
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import Graph from 'graphology'
import Sigma from 'sigma'
import EdgeCurveProgram from '@sigma/edge-curve'
import { useVaultStore } from '../../stores/vaultStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useSearchStore } from '../../stores/searchStore'
import { CANVAS_THEME_DEFS, nodeColor, edgeColor } from '../../graph/graphThemes'
import LocalGraphView from './LocalGraphView.vue'
import { buildSemanticViewModel, selectSemanticGraphSource } from './semanticGraphViewHelpers'

const store = useVaultStore()
const canvasStore = useCanvasStore()
const searchStore = useSearchStore()

const containerRef = ref(null)
const hoverPillRef = ref(null)
const sigmaRef = ref(null)
const isLoading = ref(true)
const error = ref(null)
const themePickerOpen = ref(false)
const themes = CANVAS_THEME_DEFS
const theme = computed(() => canvasStore.activeTheme)
const edgeThreshold = computed({
  get: () => canvasStore.edgeThreshold,
  set: (v) => canvasStore.setEdgeThreshold(v)
})
const localGraphOpen = computed(() => canvasStore.localGraphOpen)
const isLight = computed(() => theme.value?.isLight)

const canvasData = computed(() => buildCanvasData())
const semanticGraphData = computed(() => buildSemanticViewModel({
  graph: selectSemanticGraphSource({
    inspectionGraph: searchStore.indexInspection?.graph
  }),
  savedPositions: canvasStore.canvasPositions,
  width: 1800,
  height: 1200
}))

function truncLabel (str, max) {
  return str && str.length > max ? str.substring(0, max - 1) + '\u2026' : (str || '')
}

function parseRgbColor (s) {
  const m = s.match(/^rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/)
  if (!m) return null
  return [+m[1], +m[2], +m[3]]
}

function buildCanvasData () {
  const semantic = semanticGraphData.value
  const atoms = semantic.nodes.map((node) => ({
    atom_id: node.id,
    id: node.id,
    x: node.x,
    y: node.y,
    title: node.title || 'Untitled',
    summary: node.summary || '',
    kind: node.kind || 'note',
    primary_tag: (node.tags || [])[0] || null,
    tag_count: (node.tags || []).length,
    tag_ids: node.tags || [],
    clusterIndex: node.clusterIndex || 0,
    clusterId: node.clusterId || ''
  }))
  const edges = semantic.edges.map((edge) => ({
    source: edge.source,
    target: edge.target,
    weight: Number(edge.weight || 0),
    reason: edge.reason,
    type: edge.type
  }))
  return {
    atoms,
    edges,
    clusters: semantic.clusters,
    edgeCounts: semantic.edgeCounts,
    maxEdges: semantic.maxEdges,
    atomCluster: semantic.atomCluster,
    clusterIndexMap: semantic.clusterIndexMap
  }
}

function selectTheme (t) {
  canvasStore.setThemeId(t.id)
  themePickerOpen.value = false
}

function buildGraph (data) {
  const graph = new Graph()
  const t = theme.value
  const { atoms, edges, edgeCounts, maxEdges } = data

  for (const atom of atoms) {
    const connectivity = (edgeCounts.get(atom.atom_id) || 0) / maxEdges
    const clusterIdx = atom.clusterIndex || 0
    graph.addNode(atom.atom_id, {
      x: atom.x,
      y: atom.y,
      size: 2.5 + connectivity * 5,
      color: nodeColor(t, connectivity, clusterIdx),
      label: truncLabel(atom.title, 30),
      fullLabel: atom.title,
      connectivity,
      clusterIndex: clusterIdx,
      tagIds: atom.tag_ids || [],
    })
  }

  let minW = 1; let maxW = 0
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
    })
  }

  return graph
}

let graphInstance = null
let labelCanvas = null
let hoverAnimRef = 0
let hoverTargetRef = 0
let hoveredNodeRef = null
let neighborsRef = new Map()
let edgeThresholdRef = 0

function drawLabels (sigma, graph, container, data) {
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

  // Cluster labels
  const clusterFontSize = 13
  ctx.font = `600 ${clusterFontSize}px system-ui, -apple-system, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const sortedClusters = [...data.clusters].sort((a, b) => b.atom_count - a.atom_count)
  const maxClusterLabels = Math.max(4, Math.floor((width * height) / 40000))
  let clusterCount = 0

  for (const cluster of sortedClusters) {
    if (clusterCount >= maxClusterLabels) break
    let cx = 0; let cy = 0; let count = 0
    for (const atomId of cluster.atom_ids) {
      if (!graph.hasNode(atomId)) continue
      cx += graph.getNodeAttribute(atomId, 'x')
      cy += graph.getNodeAttribute(atomId, 'y')
      count++
    }
    if (count === 0) continue
    cx /= count
    cy /= count
    const pos = sigma.graphToViewport({ x: cx, y: cy })
    const labelY = pos.y - 20
    const metrics = ctx.measureText(cluster.label || cluster.id)
    const pillW = metrics.width + 16
    const pillH = clusterFontSize + 8
    const rect = { x: pos.x - pillW / 2, y: labelY - pillH / 2, w: pillW, h: pillH }

    if (collides(rect, 24)) continue
    placed.push(rect)
    clusterCount++

    ctx.fillStyle = t.labelBg
    ctx.beginPath()
    ctx.roundRect(rect.x, rect.y, pillW, pillH, pillH / 2)
    ctx.fill()
    ctx.strokeStyle = t.labelBorder
    ctx.lineWidth = 1
    ctx.stroke()

    ctx.fillStyle = t.labelColor
    ctx.fillText(cluster.label || cluster.id, pos.x, labelY)
  }

  // Node labels
  const atomFontSize = 12
  ctx.font = `${atomFontSize}px system-ui, -apple-system, sans-serif`
  ctx.textBaseline = 'middle'

  const candidates = []
  const minRenderedSize = 4

  graph.forEachNode((id, attrs) => {
    const rsize = sigma.scaleSize(attrs.size || 4)
    if (rsize < minRenderedSize) return
    const pos = sigma.graphToViewport({ x: attrs.x, y: attrs.y })
    if (pos.x < -200 || pos.x > width + 50 || pos.y < -30 || pos.y > height + 30) return
    const label = attrs.label || ''
    if (!label) return
    candidates.push({ vx: pos.x, vy: pos.y, rsize, label })
  })
  candidates.sort((a, b) => b.rsize - a.rsize)

  const atomLabelPad = 20
  ctx.fillStyle = t.nodeLabelColor
  for (const c of candidates) {
    const tw = ctx.measureText(c.label).width
    const rightX = c.vx + c.rsize + 4
    const leftX = c.vx - c.rsize - 4
    const rightFits = rightX + tw <= width - 2
    const leftFits = leftX - tw >= 2
    const onLeft = !rightFits && leftFits
    const rect = onLeft
      ? { x: leftX - tw, y: c.vy - atomFontSize / 2, w: tw, h: atomFontSize }
      : { x: rightX, y: c.vy - atomFontSize / 2, w: tw, h: atomFontSize }
    if (collides(rect, atomLabelPad)) continue
    placed.push(rect)
    ctx.textAlign = onLeft ? 'right' : 'left'
    ctx.fillText(c.label, onLeft ? leftX : rightX, c.vy)
  }

  // Hover ring
  const hoveredId = hoveredNodeRef
  const hAnim = hoverAnimRef
  const pill = hoverPillRef.value
  if (hoveredId && hAnim > 0.01 && graph.hasNode(hoveredId)) {
    const hAttrs = graph.getNodeAttributes(hoveredId)
    const hPos = sigma.graphToViewport({ x: hAttrs.x, y: hAttrs.y })
    const hSize = sigma.scaleSize(hAttrs.size || 4)
    const hLabel = hAttrs.fullLabel || hAttrs.label || ''

    ctx.globalAlpha = hAnim
    ctx.beginPath()
    ctx.arc(hPos.x, hPos.y, hSize + 2, 0, Math.PI * 2)
    ctx.strokeStyle = isLight.value ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.globalAlpha = 1

    if (pill) {
      pill.textContent = hLabel
      pill.style.display = 'block'
      pill.style.left = `${hPos.x + hSize + 4}px`
      pill.style.top = `${hPos.y - 10}px`
      pill.style.opacity = String(hAnim)
    }
  } else if (pill) {
    pill.style.display = 'none'
  }
}

function mountSigma () {
  const container = containerRef.value
  const data = canvasData.value
  if (!container || !data || data.atoms.length === 0) {
    isLoading.value = false
    return
  }

  unmountSigma()

  const graph = buildGraph(data)
  graphInstance = graph

  // Build neighbors map
  const neighbors = new Map()
  graph.forEachEdge((edge, attrs, source, target) => {
    if (!neighbors.has(source)) neighbors.set(source, new Set())
    if (!neighbors.has(target)) neighbors.set(target, new Set())
    neighbors.get(source).add(target)
    neighbors.get(target).add(source)
  })
  neighborsRef = neighbors

  edgeThresholdRef = edgeThreshold.value
  hoveredNodeRef = null
  hoverAnimRef = 0
  hoverTargetRef = 0

  const sigma = new Sigma(graph, container, {
    renderLabels: false,
    labelFont: 'system-ui, -apple-system, sans-serif',
    defaultEdgeColor: '#333',
    defaultNodeColor: '#555',
    defaultEdgeType: 'curved',
    zIndex: true,
    edgeProgramClasses: { curved: EdgeCurveProgram },
    minCameraRatio: 0.01,
    maxCameraRatio: 10,
    stagePadding: 40,
    defaultDrawNodeHover: () => {},
    nodeReducer: (node, attrs) => {
      const hovered = hoveredNodeRef
      if (hovered) {
        if (node === hovered) return { ...attrs, zIndex: 2 }
        const isNeighbor = neighborsRef.get(hovered)?.has(node)
        if (isNeighbor) return { ...attrs, zIndex: 1 }
        const dim = hoverAnimRef
        const rgb = parseRgbColor(attrs.color)
        const color = rgb
          ? `rgb(${Math.round(rgb[0] + (60 - rgb[0]) * dim)},${Math.round(rgb[1] + (60 - rgb[1]) * dim)},${Math.round(rgb[2] + (60 - rgb[2]) * dim)})`
          : attrs.color
        return { ...attrs, color, size: (attrs.size || 4) * (1 - 0.45 * dim) }
      }
      return attrs
    },
    edgeReducer: (edge, attrs) => {
      const w = attrs.weight ?? 0.5
      const hovered = hoveredNodeRef
      const t = theme.value
      if (hovered) {
        const g = graphInstance
        if (!g) return attrs
        const src = g.source(edge)
        const dst = g.target(edge)
        const touchesHovered = src === hovered || dst === hovered
        const h = hoverAnimRef
        if (touchesHovered) {
          const bright = w * (1 + 0.4 * h)
          return {
            ...attrs,
            color: edgeColor(t, Math.min(1, bright)),
            size: 0.2 + w * 0.7 + 0.5 * h,
            zIndex: 1,
          }
        }
        return {
          ...attrs,
          color: edgeColor(t, w * (1 - h)),
          size: (0.2 + w * 0.7) * (1 - h),
        }
      }
      if (w < edgeThresholdRef) {
        return { ...attrs, hidden: true }
      }
      return {
        ...attrs,
        color: edgeColor(t, w),
        size: 0.2 + w * 0.7,
      }
    },
  })

  sigmaRef.value = sigma

  // Label canvas overlay
  labelCanvas = document.createElement('canvas')
  labelCanvas.style.position = 'absolute'
  labelCanvas.style.inset = '0'
  labelCanvas.style.pointerEvents = 'none'
  labelCanvas.style.zIndex = '10'
  container.appendChild(labelCanvas)

  const drawLabelsBound = () => drawLabels(sigma, graph, container, data)
  sigma.on('afterRender', drawLabelsBound)
  requestAnimationFrame(drawLabelsBound)

  // Bounding box
  let xMin = Infinity; let xMax = -Infinity; let yMin = Infinity; let yMax = -Infinity
  graph.forEachNode((id, attrs) => {
    if (attrs.x < xMin) xMin = attrs.x
    if (attrs.x > xMax) xMax = attrs.x
    if (attrs.y < yMin) yMin = attrs.y
    if (attrs.y > yMax) yMax = attrs.y
  })
  sigma.setCustomBBox({ x: [xMin, xMax], y: [yMin, yMax] })

  // Animate entry
  const pendingFocus = canvasStore.pendingFocusNoteId
  if (pendingFocus && graph.hasNode(pendingFocus)) {
    canvasStore.clearPendingFocus()
    const gx = graph.getNodeAttribute(pendingFocus, 'x')
    const gy = graph.getNodeAttribute(pendingFocus, 'y')
    const bboxW = xMax - xMin || 1
    const bboxH = yMax - yMin || 1
    const camX = (gx - xMin) / bboxW
    const camY = (gy - yMin) / bboxH
    sigma.getCamera().animate({ x: camX, y: camY, ratio: 0.35 }, { duration: 600 })
  }

  // Hover animation loop
  let hoverRaf = null
  const tickHover = () => {
    const diff = hoverTargetRef - hoverAnimRef
    if (Math.abs(diff) < 0.005) {
      hoverAnimRef = hoverTargetRef
      if (hoverTargetRef === 0) hoveredNodeRef = null
      sigma.refresh()
      hoverRaf = null
      return
    }
    hoverAnimRef += diff * 0.22
    sigma.refresh()
    hoverRaf = requestAnimationFrame(tickHover)
  }
  const startHoverAnim = () => {
    if (hoverRaf !== null) return
    hoverRaf = requestAnimationFrame(tickHover)
  }

  sigma.on('enterNode', ({ node }) => {
    hoveredNodeRef = node
    hoverTargetRef = 1
    startHoverAnim()
  })
  sigma.on('leaveNode', () => {
    hoverTargetRef = 0
    startHoverAnim()
  })
  sigma.on('clickNode', ({ node }) => {
    const note = store.rootEntries.find(e => e.path === node)
    if (note) store.openNote(note)
  })

  // Register controller
  const controller = {
    zoomToCluster (label) {
      const cluster = data.clusters.find(c => (c.label || c.id).toLowerCase() === label.toLowerCase())
      if (!cluster) return
      let cx = 0; let cy = 0; let count = 0
      for (const atomId of cluster.atom_ids) {
        if (!graph.hasNode(atomId)) continue
        cx += graph.getNodeAttribute(atomId, 'x')
        cy += graph.getNodeAttribute(atomId, 'y')
        count++
      }
      if (count === 0) return
      cx /= count
      cy /= count
      const bboxW = xMax - xMin || 1
      const bboxH = yMax - yMin || 1
      const camX = (cx - xMin) / bboxW
      const camY = (cy - yMin) / bboxH
      sigma.getCamera().animate({ x: camX, y: camY, ratio: 0.3 }, { duration: 800 })
    },
    focusAtom (noteId) {
      if (!graph.hasNode(noteId)) return
      const gx = graph.getNodeAttribute(noteId, 'x')
      const gy = graph.getNodeAttribute(noteId, 'y')
      const bboxW = xMax - xMin || 1
      const bboxH = yMax - yMin || 1
      const camX = (gx - xMin) / bboxW
      const camY = (gy - yMin) / bboxH
      sigma.getCamera().animate({ x: camX, y: camY, ratio: 0.35 }, { duration: 600 })
    },
    getCameraState () {
      if (!sigma) return null
      const s = sigma.getCamera().getState()
      return { x: s.x, y: s.y, ratio: s.ratio, angle: s.angle }
    },
  }
  canvasStore.registerController(controller)
  isLoading.value = false
}

function unmountSigma () {
  if (sigmaRef.value) {
    canvasStore.unregisterController()
    sigmaRef.value.kill()
    sigmaRef.value = null
  }
  if (labelCanvas && labelCanvas.parentNode) {
    labelCanvas.remove()
    labelCanvas = null
  }
  graphInstance = null
}

onMounted(() => {
  searchStore.inspect().catch(() => {})
  canvasStore.loadPositions(store.activeVaultId || 'default')
  mountSigma()
})

onBeforeUnmount(() => {
  unmountSigma()
})

watch(canvasData, () => {
  nextTick(() => mountSigma())
})

watch(theme, () => {
  if (!graphInstance || !sigmaRef.value) return
  const t = theme.value
  const data = canvasData.value
  const { edgeCounts, maxEdges } = data
  graphInstance.forEachNode((node, attrs) => {
    const connectivity = (edgeCounts.get(node) || 0) / maxEdges
    graphInstance.setNodeAttribute(node, 'color', nodeColor(t, connectivity, attrs.clusterIndex))
  })
  sigmaRef.value.refresh()
})

watch(edgeThreshold, (to) => {
  const sigma = sigmaRef.value
  if (!sigma) {
    edgeThresholdRef = to
    return
  }
  const from = edgeThresholdRef
  if (Math.abs(from - to) < 0.001) return

  const start = performance.now()
  const duration = 400
  function tick (now) {
    const t = Math.min(1, (now - start) / duration)
    const eased = 1 - (1 - t) ** 2
    edgeThresholdRef = from + (to - from) * eased
    sigma.refresh()
    if (t < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})

watch(() => store.activeVaultId, () => {
  searchStore.inspect().catch(() => {})
  canvasStore.loadPositions(store.activeVaultId || 'default')
  nextTick(() => mountSigma())
})
</script>

<style scoped>
.en-sigma-canvas {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  position: relative;
}

.en-sigma-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 28px 12px;
}

.en-sigma-header h1 {
  margin: 0;
  font-size: 28px;
}

.en-sigma-header p {
  margin: 0;
  color: var(--en-muted);
  font-size: 13px;
}

.en-sigma-controls {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.en-sigma-theme-btn {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.2);
  cursor: pointer;
  transition: border-color 0.2s;
}

.en-sigma-theme-btn:hover {
  border-color: rgba(255,255,255,0.4);
}

.en-sigma-theme-picker {
  display: flex;
  gap: 4px;
}

.en-sigma-theme-swatch {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(255,255,255,0.15);
  cursor: pointer;
  transition: border-color 0.2s;
}

.en-sigma-theme-swatch:hover {
  border-color: rgba(255,255,255,0.4);
}

.en-sigma-stage {
  position: relative;
  min-height: 0;
  margin: 0 0 28px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  overflow: hidden;
  background: v-bind('theme.background');
}

.en-sigma-loading,
.en-sigma-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  color: var(--en-muted);
  font-size: 14px;
}

.en-sigma-edge-slider {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 6px;
}

.en-sigma-edge-slider input[type="range"] {
  width: 80px;
  height: 4px;
  appearance: none;
  background: var(--en-border);
  border-radius: 4px;
  cursor: pointer;
}

.en-sigma-edge-slider input[type="range"]::-webkit-slider-thumb {
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--en-muted);
}

.en-sigma-edge-slider span {
  font-size: 9px;
  color: var(--en-muted);
}

.en-sigma-hover-pill {
  position: absolute;
  pointer-events: none;
  white-space: nowrap;
  z-index: 30;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.2;
  background: var(--en-hover-pill-bg, rgba(20,20,20,0.92));
  color: var(--en-hover-pill-color, #e8e8e8);
  border: 1px solid var(--en-hover-pill-border, rgba(255,255,255,0.1));
}

.en-shell.en-theme-light .en-sigma-hover-pill {
  --en-hover-pill-bg: rgba(255,255,255,0.94);
  --en-hover-pill-color: #1a1a1a;
  --en-hover-pill-border: rgba(0,0,0,0.15);
}

.en-sigma-local-overlay {
  position: absolute;
  inset: 0;
  z-index: 25;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.en-sigma-local-overlay > * {
  width: 90%;
  height: 85%;
  background: var(--en-bg);
  border-radius: 12px;
  overflow: hidden;
}
</style>

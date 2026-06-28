<template>
  <div class="en-local-graph">
    <div class="en-local-header">
      <button
        type="button"
        class="en-local-close"
        @click="canvasStore.closeLocalGraph()"
      >
        ✕
      </button>
      <h3>{{ centerTitle }}</h3>
      <span class="en-local-count">
        {{ neighborhood.atoms.length }} nodes · {{ semanticEdgeCount }} semantic links
      </span>
    </div>
    <div
      ref="containerRef"
      class="en-local-stage"
    />
    <div class="en-local-legend">
      <span class="en-local-legend-item en-local-legend-center">Center</span>
      <span class="en-local-legend-item en-local-legend-semantic">Semantic</span>
      <span class="en-local-legend-item en-local-legend-explicit">Explicit link</span>
      <span class="en-local-legend-item en-local-legend-folder">Structure</span>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch, nextTick } from 'vue'
import Graph from 'graphology'
import Sigma from 'sigma'
import EdgeCurveProgram from '@sigma/edge-curve'
import { useVaultStore } from '../../stores/vaultStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { useSearchStore } from '../../stores/searchStore'
import { lerpRgb, rgbString } from '../../graph/graphThemes'
import { buildSemanticNeighborhood } from './semanticGraphViewHelpers'

const store = useVaultStore()
const canvasStore = useCanvasStore()
const searchStore = useSearchStore()

const containerRef = ref(null)
const sigmaRef = ref(null)
const graphRef = ref(null)
const theme = computed(() => canvasStore.activeTheme)
const isLight = computed(() => theme.value?.isLight)

let labelCanvas = null
let hoveredNodeRef = null
let neighborsRef = new Map()
let hoverAnimRef = 0
let hoverTargetRef = 0

const centerNoteId = computed(() => canvasStore.localGraphCenter)

const centerNote = computed(() => {
  if (!centerNoteId.value) return null
  const semanticNode = searchStore.indexInspection?.graph?.nodes?.find((node) => {
    return String(node.relativePath || node.path || node.id || '') === centerNoteId.value
  })
  if (semanticNode) return semanticNode
  return store.rootEntries.find(e => e.path === centerNoteId.value)
})

const centerTitle = computed(() => {
  return centerNote.value?.title || 'Neighborhood'
})

const semanticEdgeCount = computed(() => {
  return neighborhood.value.edges.filter((edge) => edge.edge_type === 'semantic').length
})

const neighborhood = computed(() => {
  const centerId = centerNoteId.value
  if (!centerId) return { atoms: [], edges: [] }
  const semantic = buildSemanticNeighborhood({
    graph: searchStore.indexInspection?.graph,
    centerId,
    depth: Math.max(1, Number(canvasStore.localGraphDepth) || 1),
    maxNodes: 32
  })
  const atoms = semantic.nodes.map((node) => ({
    id: node.id,
    title: node.title || 'Untitled',
    summary: node.summary || '',
    tags: node.tags || [],
    kind: node.kind || 'note',
    depth: node.id === centerId ? 0 : 1,
    sourceCount: node.sourceCount || 0,
    chunkCount: node.chunkCount || 0
  }))
  const edges = semantic.edges.map((edge) => ({
    source_id: edge.source,
    target_id: edge.target,
    edge_type: edge.type || 'semantic',
    strength: Number(edge.weight || 0),
    reason: edge.reason || edge.type || 'semantic',
    shared_tag_count: edge.shared_tag_count || 0,
    similarity_score: edge.weight || 0
  }))
  return { atoms, edges }
})

function computeLayout (nb) {
  const positions = {}
  const centerId = canvasStore.localGraphCenter
  positions[centerId] = { x: 0, y: 0 }

  const depth1 = nb.atoms.filter(a => a.depth === 1)
  const angleStep1 = depth1.length > 0 ? (Math.PI * 2) / depth1.length : 0
  const startAngle = -Math.PI / 2
  const RADIUS1 = 280

  depth1.sort((a, b) => {
    const ea = nb.edges.find(e => (e.source_id === centerId && e.target_id === a.id) || (e.target_id === centerId && e.source_id === a.id))
    const eb = nb.edges.find(e => (e.source_id === centerId && e.target_id === b.id) || (e.target_id === centerId && e.source_id === b.id))
    const sa = ea?.strength ?? 0
    const sb = eb?.strength ?? 0
    return sb - sa
  })

  for (let i = 0; i < depth1.length; i++) {
    const angle = startAngle + i * angleStep1
    positions[depth1[i].id] = { x: Math.cos(angle) * RADIUS1, y: Math.sin(angle) * RADIUS1 }
  }

  return positions
}

function neighborhoodEdgeStyle (edge) {
  const t = theme.value
  const s = edge.strength
  switch (edge.edge_type) {
    case 'semantic':
      return { color: rgbString(t.edgeMax), size: 0.95 + s * 1.4 }
    case 'explicit-link':
      return { color: lerpRgb(t.edgeMax, isLight.value ? [20, 120, 110] : [150, 220, 210], 0.42), size: 1.3 + s * 1.3 }
    case 'folder':
      return { color: lerpRgb(t.edgeMin, isLight.value ? [180, 110, 40] : [220, 170, 90], 0.6), size: 0.8 + s * 0.85 }
    case 'lexical':
      return { color: lerpRgb(t.edgeMax, isLight.value ? [125, 70, 220] : [186, 146, 255], 0.22), size: 0.7 + s * 1.05 }
    default: return { color: lerpRgb(t.edgeMin, isLight.value ? [100, 100, 110] : [110, 110, 120], 0.7), size: 0.5 + s * 0.9 }
  }
}

function mountSigma () {
  const container = containerRef.value
  const nb = neighborhood.value
  if (!container || nb.atoms.length <= 1) return
  const t = theme.value

  unmountSigma()

  const graph = new Graph()
  graphRef.value = graph
  const positions = computeLayout(nb)

  const depth1List = nb.atoms.filter(a => a.depth === 1).map(a => a.id)
  const paletteIndex = new Map()
  depth1List.forEach((id, i) => paletteIndex.set(id, i % t.palette.length))

  for (const atom of nb.atoms) {
    const pos = positions[atom.id] || { x: 0, y: 0 }
    let size, color
    if (atom.depth === 0) {
      size = 18
      color = rgbString(t.nodeMax)
    } else {
      size = atom.depth === 1 ? 11 : 7
      const idx = paletteIndex.get(atom.id) ?? 0
      const factor = atom.depth === 1 ? 0.95 : 0.55
      const base = t.palette[idx]
      color = `rgb(${Math.round(base[0] * factor)},${Math.round(base[1] * factor)},${Math.round(base[2] * factor)})`
    }
    graph.addNode(atom.id, {
      x: pos.x,
      y: pos.y,
      size,
      color,
      depth: atom.depth,
      label: (atom.title || '').split('\n')[0].replace(/^#+\s*/, '').substring(0, 30),
      primaryTagName: (atom.tags || [])[0] || null,
      extraTagCount: Math.max(0, (atom.tags || []).length - 1),
    })
  }

  const neighbors = new Map()
  for (const edge of nb.edges) {
    if (!graph.hasNode(edge.source_id) || !graph.hasNode(edge.target_id)) continue
    if (graph.hasEdge(edge.source_id, edge.target_id) || graph.hasEdge(edge.target_id, edge.source_id)) continue
    const style = neighborhoodEdgeStyle(edge)
    graph.addEdge(edge.source_id, edge.target_id, {
      type: 'curved',
      weight: edge.strength,
      edgeType: edge.edge_type,
      color: style.color,
      size: style.size,
    })
    if (!neighbors.has(edge.source_id)) neighbors.set(edge.source_id, new Set())
    if (!neighbors.has(edge.target_id)) neighbors.set(edge.target_id, new Set())
    neighbors.get(edge.source_id).add(edge.target_id)
    neighbors.get(edge.target_id).add(edge.source_id)
  }
  neighborsRef = neighbors

  let sigma
  try {
    sigma = new Sigma(graph, container, {
      renderLabels: false,
      defaultEdgeColor: '#333',
      defaultNodeColor: '#555',
      defaultEdgeType: 'curved',
      zIndex: true,
      edgeProgramClasses: { curved: EdgeCurveProgram },
      minCameraRatio: 0.2,
      maxCameraRatio: 4,
      stagePadding: 80,
      defaultDrawNodeHover: () => {},
      nodeReducer: (node, attrs) => {
        const hovered = hoveredNodeRef
        if (!hovered) return attrs
        if (node === hovered) return { ...attrs, zIndex: 2 }
        const isNeighbor = neighborsRef.get(hovered)?.has(node)
        if (isNeighbor) return { ...attrs, zIndex: 1 }
        const dim = hoverAnimRef
        const rgb = (attrs.color || '').match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
        const color = rgb
          ? `rgb(${Math.round(+rgb[1] + (60 - +rgb[1]) * dim)},${Math.round(+rgb[2] + (60 - +rgb[2]) * dim)},${Math.round(+rgb[3] + (60 - +rgb[3]) * dim)})`
          : attrs.color
        return { ...attrs, color }
      },
      edgeReducer: (edge, attrs) => {
        const hovered = hoveredNodeRef
        if (!hovered) return attrs
        const src = graph.source(edge)
        const dst = graph.target(edge)
        const incident = src === hovered || dst === hovered
        if (incident) return { ...attrs, zIndex: 1 }
        const dim = hoverAnimRef
        const rgb = (attrs.color || '').match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
        const bg = t.isLight ? [245, 245, 245] : [30, 30, 30]
        const color = rgb
          ? `rgb(${Math.round(+rgb[1] + (bg[0] - +rgb[1]) * dim * 0.85)},${Math.round(+rgb[2] + (bg[1] - +rgb[2]) * dim * 0.85)},${Math.round(+rgb[3] + (bg[2] - +rgb[3]) * dim * 0.85)})`
          : attrs.color
        return { ...attrs, color }
      },
    })
  } catch (err) {
    console.error('LocalGraphView: failed to initialize Sigma', err)
    return
  }

  sigmaRef.value = sigma

  // Label canvas
  labelCanvas = document.createElement('canvas')
  labelCanvas.style.position = 'absolute'
  labelCanvas.style.inset = '0'
  labelCanvas.style.pointerEvents = 'none'
  labelCanvas.style.zIndex = '10'
  container.appendChild(labelCanvas)

  function drawLabels () {
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

    const placed = []
    function collides (rect, pad) {
      for (const p of placed) {
        if (rect.x - pad < p.x + p.w && rect.x + rect.w + pad > p.x &&
            rect.y - pad < p.y + p.h && rect.y + rect.h + pad > p.y) return true
      }
      return false
    }

    const cands = []
    graph.forEachNode((id, attrs) => {
      const pos = sigma.graphToViewport({ x: attrs.x, y: attrs.y })
      if (pos.x < -300 || pos.x > width + 300 || pos.y < -100 || pos.y > height + 100) return
      cands.push({
        id,
        vx: pos.x,
        vy: pos.y,
        rsize: sigma.scaleSize(attrs.size || 4),
        depth: attrs.depth || 0,
        label: attrs.label || '',
        tag: attrs.primaryTagName || null,
        extra: attrs.extraTagCount || 0,
      })
    })
    cands.sort((a, b) => a.depth !== b.depth ? a.depth - b.depth : b.rsize - a.rsize)

    for (const c of cands) {
      const isCenter = c.depth === 0
      const fontSize = isCenter ? 14 : c.depth === 1 ? 12 : 11
      const labelY = c.vy + c.rsize + fontSize / 2 + 6

      ctx.font = `${isCenter ? 600 : 500} ${fontSize}px system-ui, -apple-system, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const maxChars = isCenter ? 56 : c.depth === 1 ? 38 : 28
      const labelText = c.label.length > maxChars ? c.label.substring(0, maxChars - 1) + '\u2026' : c.label

      const tw = ctx.measureText(labelText).width
      const padX = isCenter ? 10 : 8
      const padY = isCenter ? 5 : 4
      const pillW = tw + padX * 2
      const pillH = fontSize + padY * 2
      const rect = { x: c.vx - pillW / 2, y: labelY - pillH / 2, w: pillW, h: pillH }

      if (!isCenter && collides(rect, 6)) continue
      placed.push(rect)

      ctx.fillStyle = t.labelBg
      ctx.beginPath()
      ctx.roundRect(rect.x, rect.y, pillW, pillH, pillH / 2)
      ctx.fill()
      ctx.strokeStyle = isCenter ? (t.isLight ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.35)') : t.labelBorder
      ctx.lineWidth = isCenter ? 1.5 : 1
      ctx.stroke()
      ctx.fillStyle = isCenter ? (t.isLight ? '#1a1a1a' : '#f0f0f0') : t.nodeLabelColor
      ctx.fillText(labelText, c.vx, labelY)

      if (c.tag && c.depth <= 1) {
        ctx.font = '500 9px system-ui, -apple-system, sans-serif'
        const display = c.extra > 0 ? `${c.tag.toUpperCase()}  +${c.extra}` : c.tag.toUpperCase()
        ctx.globalAlpha = 0.65
        ctx.fillStyle = t.nodeLabelColor
        ctx.fillText(display, c.vx, labelY + pillH / 2 + 8 + 4.5)
        ctx.globalAlpha = 1
      }
    }

    // Hover ring
    const hAnim = hoverAnimRef
    const hId = hoveredNodeRef
    if (hId && hAnim > 0.01 && graph.hasNode(hId)) {
      const hAttrs = graph.getNodeAttributes(hId)
      const hPos = sigma.graphToViewport({ x: hAttrs.x, y: hAttrs.y })
      const hSize = sigma.scaleSize(hAttrs.size || 4)
      ctx.globalAlpha = hAnim
      ctx.beginPath()
      ctx.arc(hPos.x, hPos.y, hSize + 3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.globalAlpha = 1
    }
  }

  sigma.on('afterRender', drawLabels)
  requestAnimationFrame(drawLabels)

  // Hover animation
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
    const centerId = canvasStore.localGraphCenter
    if (node === centerId) {
      const note = store.rootEntries.find(e => e.path === node)
      if (note) store.openNote(note)
    } else {
      canvasStore.navigateLocalGraph(node)
    }
  })
}

function unmountSigma () {
  if (sigmaRef.value) {
    sigmaRef.value.kill()
    sigmaRef.value = null
  }
  if (labelCanvas && labelCanvas.parentNode) {
    labelCanvas.remove()
    labelCanvas = null
  }
  graphRef.value = null
}

watch(neighborhood, () => {
  nextTick(() => mountSigma())
})

onMounted(() => {
  searchStore.inspect().catch(() => {})
  mountSigma()
})

watch(() => store.activeVault?.path, () => {
  searchStore.inspect().catch(() => {})
})

onBeforeUnmount(() => {
  unmountSigma()
  // Release WebGL contexts
  const container = containerRef.value
  if (container) {
    for (const canvas of container.querySelectorAll('canvas')) {
      try {
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')
        gl?.getExtension('WEBGL_lose_context')?.loseContext()
      } catch { /* ignore */ }
    }
  }
})
</script>

<style scoped>
.en-local-graph {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--en-bg);
}

.en-local-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--en-border);
}

.en-local-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}

.en-local-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--en-muted);
  padding: 4px 8px;
  border-radius: 4px;
}

.en-local-close:hover {
  background: var(--en-soft);
}

.en-local-count {
  color: var(--en-muted);
  font-size: 12px;
  margin-left: auto;
}

.en-local-stage {
  flex: 1;
  min-height: 0;
  background: v-bind('theme.background');
  position: relative;
  overflow: hidden;
}

.en-local-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 6px 16px;
  border-top: 1px solid var(--en-border);
  font-size: 11px;
  color: var(--en-muted);
}

.en-local-legend-center::before,
.en-local-legend-tag::before,
.en-local-legend-semantic::before,
.en-local-legend-both::before {
  display: inline-block;
  content: '';
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 4px;
  vertical-align: middle;
}

.en-local-legend-center::before { background: var(--en-primary, rgb(100, 140, 255)); }
.en-local-legend-semantic { display: flex; align-items: center; gap: 0; }
.en-local-legend-semantic::before { content: ''; width: 16px; height: 2px; background: var(--en-muted, rgb(80, 65, 160)); }
.en-local-legend-explicit { display: flex; align-items: center; gap: 0; }
.en-local-legend-explicit::before { content: ''; width: 16px; height: 2px; background: color-mix(in srgb, var(--en-primary) 55%, #14b8a6); }
.en-local-legend-folder { display: flex; align-items: center; gap: 0; }
.en-local-legend-folder::before { content: ''; width: 16px; height: 1.5px; border-top: 1.5px dashed color-mix(in srgb, var(--en-muted) 70%, #f59e0b); }
</style>

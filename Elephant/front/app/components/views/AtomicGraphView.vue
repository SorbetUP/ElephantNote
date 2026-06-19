<template>
  <section class="en-atomic-graph">
    <header class="en-atomic-header">
      <div class="en-atomic-header-copy">
        <h1>Semantic Graph</h1>
        <p v-if="graphData">
          {{ graphData.nodes.length }} nodes · {{ renderedEdges.length }} links ·
          {{ graphData.clusters.length }} clusters
          <span v-if="graphData.semanticLinks?.length"> · {{ graphData.semanticLinks.length }} semantic links</span>
        </p>
        <p v-else>
          Graph built from semantic links, citations, and note structure.
        </p>
      </div>

      <div class="en-atomic-actions">
        <label class="en-atomic-slider">
          <span>Min semantic</span>
          <input
            v-model.number="semanticThreshold"
            type="range"
            min="0"
            max="1"
            step="0.01"
          >
        </label>
        <label class="en-atomic-toggle">
          <input
            v-model="showStructure"
            type="checkbox"
          >
          <span>Show structure</span>
        </label>
        <button
          type="button"
          :disabled="loading"
          @click="loadGraph()"
        >
          {{ loading ? 'Loading' : 'Refresh' }}
        </button>
        <button
          type="button"
          :disabled="loading"
          @click="loadGraph({ build: true })"
        >
          Build index
        </button>
      </div>
    </header>

    <div class="en-atomic-summary-row">
      <span class="en-atomic-summary-chip">
        {{ graphSummary.documentCount }} notes
      </span>
      <span class="en-atomic-summary-chip">
        {{ graphSummary.semanticEdgeCount }} semantic links
      </span>
      <span class="en-atomic-summary-chip">
        {{ graphSummary.structureEdgeCount }} structure links
      </span>
      <span class="en-atomic-summary-chip">
        {{ graphSummary.clusterCount }} clusters
      </span>
      <span class="en-atomic-summary-chip">
        {{ graphSummary.sourceCount }} cited sources
      </span>
    </div>

    <div class="en-atomic-body">
      <div class="en-atomic-stage-wrap">
        <div
          ref="containerRef"
          class="en-atomic-stage"
        />
        <p
          v-if="statusMessage"
          class="en-atomic-status"
        >
          {{ statusMessage }}
        </p>
      </div>

      <aside class="en-atomic-panel">
        <template v-if="selectedNode">
          <div class="en-atomic-panel-head">
            <div>
              <h2>{{ selectedNode.title }}</h2>
              <p>
                {{ selectedNode.kind || 'note' }}
                <span v-if="selectedNode.cluster"> · {{ selectedNode.cluster }}</span>
              </p>
            </div>
            <button
              type="button"
              class="en-atomic-primary"
              @click="openSelectedNode"
            >
              Open note
            </button>
          </div>

          <p class="en-atomic-summary">
            {{ selectedNode.summary || 'No summary yet.' }}
          </p>

          <div class="en-atomic-stats">
            <span>{{ selectedNode.sourceCount || 0 }} sources</span>
            <span>{{ selectedNode.chunkCount || 0 }} chunks</span>
            <span>{{ selectedNode.tags?.length || 0 }} tags</span>
          </div>

          <div
            v-if="selectedNode.tags?.length"
            class="en-atomic-tags"
          >
            <button
              v-for="tag in selectedNode.tags"
              :key="tag"
              type="button"
              class="en-atomic-tag"
            >
              #{{ tag }}
            </button>
          </div>

          <section
            v-if="selectedNode.sources?.length"
            class="en-atomic-section"
          >
            <h3>Sources</h3>
            <button
              v-for="source in selectedNode.sources"
              :key="source.id || source.url"
              type="button"
              class="en-atomic-source-pill"
              @click="selectSource(source)"
            >
              {{ source.title || source.path || source.url }}
            </button>
          </section>

          <section
            v-if="selectedSource"
            class="en-atomic-source-card"
          >
            <div class="en-atomic-panel-head">
              <strong>{{ selectedSource.title || 'Source' }}</strong>
              <button
                v-if="selectedSource.url"
                type="button"
                class="en-atomic-secondary"
                @click="openSelectedSource"
              >
                Open
              </button>
            </div>
            <p>{{ selectedSource.excerpt || selectedSource.summary || selectedSource.url || 'Source' }}</p>
            <small>{{ selectedSource.url || selectedSource.path || selectedSource.type || 'source' }}</small>
          </section>

          <section
            v-if="selectedRelatedNodes.length"
            class="en-atomic-section"
          >
            <h3>Connected notes</h3>
            <div class="en-atomic-related-grid">
              <button
                v-for="node in selectedRelatedNodes"
                :key="node.id"
                type="button"
                class="en-atomic-related-card"
                @click="openNoteByPath(node.id)"
              >
                <strong>{{ node.title }}</strong>
                <span>{{ node.summary || node.kind || 'note' }}</span>
                <small>
                  {{ node.linkTypes.join(', ') }}
                </small>
              </button>
            </div>
          </section>

          <div class="en-atomic-panel-actions">
            <button
              type="button"
              @click="focusSelectedNode"
            >
              Focus
            </button>
            <button
              type="button"
              @click="openGraphInLibrary"
            >
              Open in notes
            </button>
          </div>
        </template>

        <template v-else>
          <h2>Graph focus</h2>
          <p>Select a node to inspect its semantic links, citations, and source notes.</p>
        </template>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Graph from 'graphology'
import Sigma from 'sigma'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { buildSemanticGraphSurface } from './semanticGraphViewHelpers'

const store = useVaultStore()
const searchStore = useSearchStore()

const containerRef = ref(null)
const graphData = ref(null)
const loading = ref(false)
const error = ref('')
const semanticThreshold = ref(0.24)
const showStructure = ref(false)
const selectedNode = ref(null)
const selectedSource = ref(null)
const selectedRelatedNodes = ref([])
let renderer = null
let graph = null

const graphSummary = computed(() => {
  const nodes = Array.isArray(graphData.value?.nodes) ? graphData.value.nodes : []
  const edges = Array.isArray(graphData.value?.edges) ? graphData.value.edges : []
  return {
    documentCount: nodes.length,
    semanticEdgeCount: edges.filter((edge) => edge.type === 'semantic').length,
    structureEdgeCount: edges.filter((edge) => edge.type !== 'semantic').length,
    clusterCount: Array.isArray(graphData.value?.clusters) ? graphData.value.clusters.length : 0,
    sourceCount: nodes.reduce((count, node) => count + Number(node.sourceCount || 0), 0)
  }
})

const renderedEdges = computed(() => {
  const edges = Array.isArray(graphData.value?.edges) ? graphData.value.edges : []
  return edges.filter((edge) => {
    const weight = Number(edge.weight || 0)
    if (edge.type === 'semantic') return weight >= semanticThreshold.value
    return showStructure.value && weight >= 0.08
  })
})

const statusMessage = computed(() => {
  if (error.value) return error.value
  if (searchStore.status.status === 'indexing') return searchStore.status.message || 'Indexing...'
  if (graphData.value) return searchStore.status.message || 'Semantic graph ready.'
  return searchStore.status.message || 'Semantic graph not built yet.'
})

const palette = ['#2563eb', '#9333ea', '#16a34a', '#f97316', '#0891b2', '#be123c', '#4f46e5']

const resolveNodeId = (node = {}) => String(node.relativePath || node.path || node.id || '').trim()

const clusterColor = (cluster = '') => {
  const hash = String(cluster || 'none').split('').reduce((total, char) => total + char.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

const edgeColor = (type = '') => {
  if (type === 'semantic') return '#2563eb'
  if (type === 'explicit-link') return '#0f766e'
  if (type === 'folder') return '#f97316'
  if (type === 'lexical') return '#7c3aed'
  return '#64748b'
}

const destroyGraph = () => {
  if (renderer) {
    renderer.kill()
    renderer = null
  }
  graph = null
}

const buildSelectedRelatedNodes = (nodeId) => {
  const edges = Array.isArray(graphData.value?.edges) ? graphData.value.edges : []
  const nodes = Array.isArray(graphData.value?.nodes) ? graphData.value.nodes : []
  const byId = new Map(nodes.map((node) => [resolveNodeId(node), node]))
  const related = new Map()
  for (const edge of edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue
    const otherId = edge.source === nodeId ? edge.target : edge.source
    const node = byId.get(otherId)
    if (!node) continue
    const current = related.get(otherId) || {
      id: otherId,
      title: node.title || node.name || otherId,
      summary: node.summary || '',
      kind: node.kind || 'note',
      tags: Array.isArray(node.tags) ? node.tags : [],
      linkTypes: new Set()
    }
    current.linkTypes.add(edge.type || 'related')
    related.set(otherId, current)
  }
  selectedRelatedNodes.value = [...related.values()]
    .sort((a, b) => String(a.title).localeCompare(String(b.title)))
    .slice(0, 8)
    .map((entry) => ({ ...entry, linkTypes: [...entry.linkTypes] }))
}

const renderGraph = () => {
  if (!containerRef.value || !graphData.value) return
  destroyGraph()
  graph = new Graph()
  const nodes = Array.isArray(graphData.value.nodes) ? graphData.value.nodes : []
  const edges = renderedEdges.value
  const radius = Math.max(180, Math.sqrt(Math.max(1, nodes.length)) * 84)

  nodes.forEach((node, index) => {
    const nodeId = resolveNodeId(node)
    const angle = index * 2.399963229728653
    const ring = 1 + (index % 9) * 0.08
    graph.addNode(nodeId, {
      x: Math.cos(angle) * radius * ring,
      y: Math.sin(angle) * radius * ring,
      size: 6 + Math.min(8, Number(node.sourceCount || 0) * 0.8 + Math.min(4, Number(node.tags?.length || 0) * 0.35)),
      label: node.title,
      color: clusterColor(node.cluster || node.kind || 'note'),
      data: node
    })
  })

  edges.forEach((edge) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return
    if (graph.hasEdge(edge.source, edge.target) || graph.hasEdge(edge.target, edge.source)) return
    graph.addEdge(edge.source, edge.target, {
      size: edge.type === 'semantic'
        ? 0.8 + Number(edge.weight || 0) * 2.3
        : 0.45 + Number(edge.weight || 0) * 1.5,
      color: edgeColor(edge.type)
    })
  })

  renderer = new Sigma(graph, containerRef.value, {
    defaultNodeColor: '#2563eb',
    defaultEdgeColor: '#94a3b8',
    renderEdgeLabels: false,
    renderLabels: true,
    labelDensity: 0.11,
    labelGridCellSize: 70,
    defaultEdgeType: 'line'
  })

  renderer.on('clickNode', ({ node }) => {
    const data = graph.getNodeAttribute(node, 'data')
    selectedNode.value = data
    selectedSource.value = null
    buildSelectedRelatedNodes(node)
  })
}

const loadGraph = async ({ build = false } = {}) => {
  if (!store.activeVault?.path) return
  loading.value = true
  error.value = ''
  try {
    if (build) {
      await searchStore.rebuild()
    }
    await searchStore.inspect()
    graphData.value = buildSemanticGraphSurface({
      graph: searchStore.indexInspection?.graph,
      includeStructure: showStructure.value
    })
    selectedNode.value = null
    selectedSource.value = null
    selectedRelatedNodes.value = []
    await nextTick()
    renderGraph()
  } catch (err) {
    error.value = err?.message || 'Unable to build the semantic graph.'
  } finally {
    loading.value = false
  }
}

const openSelectedNode = () => {
  if (!selectedNode.value?.relativePath) return
  const note = [...store.entries, ...store.rootEntries, ...store.openedNotes]
    .find((entry) => entry?.path === selectedNode.value.relativePath)
  if (note) {
    store.openNote(note)
    return
  }
  store.openNote({
    kind: 'note',
    type: 'note',
    path: selectedNode.value.relativePath,
    title: selectedNode.value.title,
    updatedAt: selectedNode.value.updatedAt
  })
}

const openGraphInLibrary = () => {
  store.setWorkspaceView('graph')
}

const focusSelectedNode = () => {
  if (!selectedNode.value?.relativePath || !graph || !renderer) return
  const nodeId = selectedNode.value.relativePath
  if (!graph.hasNode(nodeId)) return
  const gx = graph.getNodeAttribute(nodeId, 'x')
  const gy = graph.getNodeAttribute(nodeId, 'y')
  renderer.getCamera().animate({ x: gx, y: gy, ratio: 0.35 }, { duration: 550 })
}

const selectSource = (source) => {
  selectedSource.value = source
}

const openSelectedSource = async () => {
  const source = selectedSource.value
  if (!source) return
  if (source.url) {
    await elephantnoteClient.sitePreview.openExternal(source.url)
    return
  }
  if (source.path) {
    const note = [...store.entries, ...store.rootEntries, ...store.openedNotes]
      .find((entry) => entry?.path === source.path)
    if (note) {
      store.openNote(note)
      return
    }
    store.openNote({
      kind: 'note',
      type: 'note',
      path: source.path,
      title: source.title || source.path
    })
  }
}

const openNoteByPath = (notePath) => {
  if (!notePath) return
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
    title: notePath.split('/').pop()?.replace(/\.md$/i, '') || notePath
  })
}

watch(semanticThreshold, renderGraph)
watch(showStructure, async () => {
  if (!searchStore.indexInspection?.graph) return
  graphData.value = buildSemanticGraphSurface({
    graph: searchStore.indexInspection?.graph,
    includeStructure: showStructure.value
  })
  await nextTick()
  renderGraph()
})
watch(() => store.activeVault?.path, () => loadGraph())

watch(() => searchStore.indexInspection?.graph, () => {
  if (!searchStore.indexInspection?.graph) return
  graphData.value = buildSemanticGraphSurface({
    graph: searchStore.indexInspection?.graph,
    includeStructure: showStructure.value
  })
  renderGraph()
})

onMounted(() => {
  loadGraph().catch(() => {})
})

onBeforeUnmount(destroyGraph)
</script>

<style scoped>
.en-atomic-graph {
  position: relative;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(circle at top left, rgba(37, 99, 235, 0.08), transparent 38%),
    radial-gradient(circle at bottom right, rgba(147, 51, 234, 0.06), transparent 40%),
    var(--en-bg);
}

.en-atomic-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--en-border);
  background: color-mix(in srgb, var(--en-surface) 92%, transparent);
  backdrop-filter: blur(18px);
}

.en-atomic-header-copy h1 {
  margin: 0;
  font-size: 22px;
}

.en-atomic-header-copy p {
  margin: 3px 0 0;
  color: var(--en-muted);
}

.en-atomic-actions,
.en-atomic-panel-actions,
.en-atomic-stats,
.en-atomic-tags,
.en-atomic-summary-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.en-atomic-actions {
  justify-content: flex-end;
  align-items: center;
}

.en-atomic-summary-row {
  padding: 10px 18px 0;
}

.en-atomic-summary-chip,
.en-atomic-tag,
.en-atomic-source-pill {
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 6px 10px;
  background: var(--en-bg);
  color: var(--en-text);
  font: inherit;
}

.en-atomic-slider,
.en-atomic-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 0 12px;
  min-height: 36px;
  background: var(--en-bg);
}

.en-atomic-slider span,
.en-atomic-toggle span {
  color: var(--en-muted);
  font-size: 12px;
}

.en-atomic-slider input {
  width: 120px;
}

.en-atomic-actions button,
.en-atomic-panel button {
  border: 1px solid var(--en-border);
  border-radius: 10px;
  min-height: 36px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-atomic-body {
  position: relative;
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 380px;
  gap: 16px;
  padding: 16px 18px 18px;
}

.en-atomic-stage-wrap {
  position: relative;
  min-height: 0;
}

.en-atomic-stage {
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 1px solid var(--en-border);
  border-radius: 20px;
  background:
    linear-gradient(color-mix(in srgb, var(--en-border) 20%, transparent) 1px, transparent 1px),
    linear-gradient(90deg, color-mix(in srgb, var(--en-border) 20%, transparent) 1px, transparent 1px),
    color-mix(in srgb, var(--en-surface) 94%, transparent);
  background-size: 32px 32px;
  overflow: hidden;
}

.en-atomic-status {
  position: absolute;
  left: 16px;
  bottom: 16px;
  margin: 0;
  max-width: min(78%, 680px);
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 8px 12px;
  color: var(--en-muted);
  font-size: 12px;
  background: color-mix(in srgb, var(--en-surface) 94%, transparent);
  backdrop-filter: blur(16px);
}

.en-atomic-panel {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--en-border);
  border-radius: 20px;
  padding: 18px;
  background: color-mix(in srgb, var(--en-surface) 94%, transparent);
  box-shadow: 0 26px 80px color-mix(in srgb, #020617 24%, transparent);
  backdrop-filter: blur(18px);
}

.en-atomic-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.en-atomic-panel-head h2 {
  margin: 0;
  font-size: 18px;
}

.en-atomic-panel-head p,
.en-atomic-summary,
.en-atomic-panel p,
.en-atomic-source-card small {
  color: var(--en-muted);
  line-height: 1.45;
}

.en-atomic-primary {
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-bg));
}

.en-atomic-secondary {
  background: var(--en-bg);
}

.en-atomic-summary {
  margin: 12px 0 0;
}

.en-atomic-stats {
  margin-top: 12px;
  color: var(--en-muted);
  font-size: 12px;
}

.en-atomic-tags,
.en-atomic-section {
  margin-top: 14px;
}

.en-atomic-section h3 {
  margin: 0 0 8px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--en-muted);
}

.en-atomic-source-card {
  margin-top: 10px;
  border: 1px solid var(--en-border);
  border-radius: 16px;
  padding: 12px;
  background: var(--en-bg);
}

.en-atomic-source-card p {
  margin: 8px 0 0;
}

.en-atomic-related-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 8px;
}

.en-atomic-related-card {
  display: grid;
  gap: 4px;
  align-content: start;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  padding: 10px 12px;
  text-align: left;
  background: var(--en-bg);
}

.en-atomic-related-card strong {
  font-size: 13px;
}

.en-atomic-related-card span,
.en-atomic-related-card small {
  color: var(--en-muted);
  font-size: 12px;
}
</style>

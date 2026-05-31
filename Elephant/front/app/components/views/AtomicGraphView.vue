<template>
  <section class="en-atomic-graph">
    <header class="en-atomic-header">
      <div>
        <h1>Note Graph</h1>
        <p v-if="graphData">
          {{ graphData.nodes.length }} notes, {{ visibleEdges.length }} rendered links, {{ graphData.clusters.length }} clusters
          <span v-if="graphData.stats"> · {{ graphData.stats.totalCandidateEdges }} candidate links</span>
        </p>
        <p v-else>
          Scalable graph from tags, folders, markdown links, keywords and embeddings.
        </p>
      </div>
      <div class="en-atomic-actions">
        <label>
          <span>Min link</span>
          <input
            v-model.number="minWeight"
            type="range"
            min="0"
            max="1"
            step="0.01"
          >
        </label>
        <button
          type="button"
          :disabled="loading"
          @click="loadGraph"
        >
          {{ loading ? 'Building' : 'Refresh' }}
        </button>
      </div>
    </header>

    <div class="en-atomic-body">
      <div
        ref="containerRef"
        class="en-atomic-stage"
      />
      <aside
        v-if="selectedNode"
        class="en-atomic-panel"
      >
        <h2>{{ selectedNode.title }}</h2>
        <p>{{ selectedNode.summary }}</p>
        <div class="en-atomic-tags">
          <span
            v-for="tag in selectedNode.tags"
            :key="tag"
          >#{{ tag }}</span>
        </div>
        <div class="en-atomic-panel-actions">
          <button
            type="button"
            @click="openSelectedNode"
          >
            Open
          </button>
          <button
            type="button"
            @click="summarizeSelectedNode"
          >
            Summary
          </button>
          <button
            type="button"
            @click="structureSelectedNode"
          >
            Structure
          </button>
          <button
            type="button"
            @click="autoNameSelectedNode"
          >
            Auto-name
          </button>
        </div>
        <p
          v-if="analysis"
          class="en-atomic-analysis"
        >
          {{ analysis }}
        </p>
      </aside>
    </div>

    <p
      v-if="error"
      class="en-atomic-error"
    >
      {{ error }}
    </p>
  </section>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Graph from 'graphology'
import Sigma from 'sigma'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { useVaultStore } from '../../stores/vaultStore'

const store = useVaultStore()
const containerRef = ref(null)
const graphData = ref(null)
const loading = ref(false)
const error = ref('')
const minWeight = ref(0.24)
const selectedNode = ref(null)
const analysis = ref('')
let renderer = null
let graph = null

const visibleEdges = computed(() => (graphData.value?.edges || [])
  .filter((edge) => Number(edge.weight || 0) >= minWeight.value))

const palette = ['#2563eb', '#9333ea', '#16a34a', '#f97316', '#0891b2', '#be123c', '#4f46e5']

const clusterColor = (cluster = '') => {
  const hash = String(cluster || 'none').split('').reduce((total, char) => total + char.charCodeAt(0), 0)
  return palette[hash % palette.length]
}

const edgeColor = (type = '') => {
  if (type === 'semantic') return '#2563eb'
  if (type === 'explicit-link') return '#16a34a'
  if (type === 'tag') return '#9333ea'
  if (type === 'folder') return '#f97316'
  return '#64748b'
}

const destroyGraph = () => {
  if (renderer) {
    renderer.kill()
    renderer = null
  }
  graph = null
}

const renderGraph = () => {
  if (!containerRef.value || !graphData.value) return
  destroyGraph()
  graph = new Graph()
  const nodes = graphData.value.nodes || []
  const radius = Math.max(120, Math.sqrt(Math.max(1, nodes.length)) * 72)

  nodes.forEach((node, index) => {
    const angle = index * 2.399963229728653
    const ring = 1 + (index % 7) * 0.11
    graph.addNode(node.id, {
      x: Math.cos(angle) * radius * ring,
      y: Math.sin(angle) * radius * ring,
      size: 4 + Math.min(7, (node.tags?.length || 0) * 1.1) + (node.weakTitle ? 1 : 0),
      label: node.title,
      color: clusterColor(node.cluster),
      data: node
    })
  })

  visibleEdges.value.forEach((edge) => {
    if (!graph.hasNode(edge.source) || !graph.hasNode(edge.target)) return
    if (graph.hasEdge(edge.source, edge.target) || graph.hasEdge(edge.target, edge.source)) return
    graph.addEdge(edge.source, edge.target, {
      size: 0.7 + Number(edge.weight || 0) * 2.5,
      color: edgeColor(edge.type)
    })
  })

  renderer = new Sigma(graph, containerRef.value, {
    defaultNodeColor: '#2563eb',
    defaultEdgeColor: '#94a3b8',
    renderEdgeLabels: false,
    labelDensity: 0.08,
    labelGridCellSize: 80
  })
  renderer.on('clickNode', ({ node }) => {
    selectedNode.value = graph.getNodeAttribute(node, 'data')
    analysis.value = ''
  })
}

const loadGraph = async () => {
  if (!store.activeVault?.path) return
  loading.value = true
  error.value = ''
  try {
    graphData.value = await elephantnoteClient.atomicFeatures.graph(store.activeVault.path, {
      semanticThreshold: 0.28,
      lexicalThreshold: 0.24,
      maxNotes: 5000,
      maxLinksPerNote: 8,
      maxEdges: 12000
    })
    await nextTick()
    renderGraph()
  } catch (err) {
    error.value = err?.message || 'Unable to build the Note Graph.'
  } finally {
    loading.value = false
  }
}

const openSelectedNode = () => {
  if (!selectedNode.value) return
  store.openNote({
    kind: 'note',
    type: 'note',
    path: selectedNode.value.path,
    title: selectedNode.value.title,
    updatedAt: selectedNode.value.updatedAt
  })
}

const summarizeSelectedNode = async () => {
  if (!selectedNode.value || !store.activeVault?.path) return
  analysis.value = 'Summarizing...'
  const result = await elephantnoteClient.atomicFeatures.summarize(store.activeVault.path, selectedNode.value.path)
  analysis.value = result.summary
}

const structureSelectedNode = async () => {
  if (!selectedNode.value || !store.activeVault?.path) return
  analysis.value = 'Structuring...'
  const result = await elephantnoteClient.atomicFeatures.structure(store.activeVault.path, selectedNode.value.path)
  analysis.value = result.restructuring
}

const autoNameSelectedNode = async () => {
  if (!selectedNode.value || !store.activeVault?.path) return
  analysis.value = 'Renaming note...'
  const result = await elephantnoteClient.atomicFeatures.autoNameNote(store.activeVault.path, selectedNode.value.path, { apply: true })
  analysis.value = result.changed
    ? `Renamed: ${result.oldPath} -> ${result.newPath}`
    : `Name already good: ${result.newPath}`
  await store.openDirectory(store.currentPath || '', { record: false })
  await loadGraph()
}

watch(minWeight, renderGraph)
watch(() => store.activeVault?.path, loadGraph)

onMounted(loadGraph)
onBeforeUnmount(destroyGraph)
</script>

<style scoped>
.en-atomic-graph {
  position: relative;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--en-bg);
}
.en-atomic-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--en-border);
  background: var(--en-surface);
}
.en-atomic-header h1 { margin: 0; font-size: 22px; }
.en-atomic-header p { margin: 3px 0 0; color: var(--en-muted); }
.en-atomic-actions, .en-atomic-panel-actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.en-atomic-actions button, .en-atomic-panel button {
  border: 1px solid var(--en-border);
  border-radius: 8px;
  min-height: 32px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}
.en-atomic-body { position: relative; min-height: 0; flex: 1; }
.en-atomic-stage { width: 100%; height: 100%; }
.en-atomic-panel {
  position: absolute;
  right: 18px;
  top: 18px;
  width: min(380px, calc(100vw - 48px));
  max-height: calc(100% - 36px);
  overflow: auto;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  padding: 16px;
  background: var(--en-surface);
  box-shadow: var(--en-card-shadow);
}
.en-atomic-panel h2 { margin: 0 0 8px; font-size: 18px; }
.en-atomic-panel p { color: var(--en-muted); line-height: 1.45; }
.en-atomic-tags { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 12px; }
.en-atomic-tags span { border: 1px solid var(--en-border); border-radius: 999px; padding: 3px 8px; color: var(--en-muted); font-size: 12px; }
.en-atomic-analysis { white-space: pre-wrap; border-radius: 10px; padding: 10px; background: var(--en-soft); }
.en-atomic-error { position: absolute; left: 18px; bottom: 18px; color: var(--en-danger); }
</style>

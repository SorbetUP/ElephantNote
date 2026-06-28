<template>
  <section class="en-workspace-view">
    <header class="en-graph-hero">
      <div>
        <p class="en-graph-kicker">Semantic graph</p>
        <h1>Graph overview</h1>
        <p>
          {{ graph.nodes.length }} notes · {{ graph.edges.length }} links
          <span v-if="semanticGraph?.clusters?.length"> · {{ semanticGraph.clusters.length }} clusters</span>
        </p>
      </div>
      <div class="en-graph-summary">
        <span>{{ graphSummary.semantic }} semantic</span>
        <span>{{ graphSummary.cited }} cited</span>
        <span>{{ graphSummary.folder }} structure</span>
      </div>
    </header>

    <div
      v-if="graph.nodes.length"
      class="en-graph-layout"
    >
      <div class="en-graph-stage-wrap">
        <svg
          class="en-graph-canvas"
          viewBox="0 0 800 520"
          role="img"
          aria-label="Semantic knowledge graph"
        >
          <line
            v-for="edge in positionedEdges"
            :key="`${edge.source.id}-${edge.target.id}-${edge.reason}`"
            :class="edge.type"
            :x1="edge.source.x"
            :y1="edge.source.y"
            :x2="edge.target.x"
            :y2="edge.target.y"
          />
          <g
            v-for="node in positionedNodes"
            :key="node.id"
            class="en-graph-node"
            :class="[node.kind, { selected: selectedNode?.id === node.id }]"
            @click="selectNode(node)"
          >
            <circle
              :cx="node.x"
              :cy="node.y"
              :r="16 + Math.min(8, Number(node.sourceCount || 0) * 1.2)"
            />
            <text
              :x="node.x"
              :y="node.y + 36"
              text-anchor="middle"
            >
              {{ node.title }}
            </text>
          </g>
        </svg>
      </div>

      <aside class="en-graph-panel">
        <template v-if="selectedNode">
          <div class="en-graph-panel-head">
            <div>
              <p class="en-graph-kicker">Selected node</p>
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

          <div class="en-graph-node-meta">
            <span>{{ selectedNode.kind || 'note' }}</span>
            <span>{{ selectedNode.sourceCount || 0 }} sources</span>
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
                @click="selectNode(node)"
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
            Select a node to inspect its semantic links, sources and cluster.
          </p>
        </template>
      </aside>
    </div>

    <p
      v-else
      class="en-empty-view"
    >
      Build the semantic index to visualize note relationships.
    </p>
  </section>
</template>

<script setup>
import { computed, onMounted, watch } from 'vue'
import { useVaultStore } from '../../stores/vaultStore'
import { useSearchStore } from '../../stores/searchStore'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { buildSemanticGraphSurface } from './semanticGraphViewHelpers'

const store = useVaultStore()
const searchStore = useSearchStore()
const semanticGraph = computed(() => buildSemanticGraphSurface({
  graph: searchStore.indexInspection?.graph,
  includeStructure: false
}))
const graph = computed(() => {
  return semanticGraph.value?.nodes?.length
    ? semanticGraph.value
    : { nodes: [], edges: [], clusters: [] }
})
const graphSummary = computed(() => ({
  semantic: graph.value.edges.filter((edge) => edge.type === 'semantic').length,
  cited: graph.value.nodes.reduce((count, node) => count + Number(node.sourceCount || 0), 0),
  folder: graph.value.edges.filter((edge) => edge.type === 'folder').length
}))
const selectedNode = ref(null)
const selectedSource = ref(null)
const selectedRelatedNodes = ref([])
const positionedNodes = computed(() => {
  const count = Math.max(graph.value.nodes.length, 1)
  return graph.value.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / count
    const radius = 220 + Math.min(70, Number(node.sourceCount || 0) * 6)
    return {
      ...node,
      x: 400 + Math.cos(angle) * radius,
      y: 260 + Math.sin(angle) * radius
    }
  })
})
const positionedEdges = computed(() => {
  const byId = new Map(positionedNodes.value.map((node) => [node.id, node]))
  return graph.value.edges
    .map((edge) => ({
      ...edge,
      source: byId.get(edge.source),
      target: byId.get(edge.target)
    }))
    .filter((edge) => edge.source && edge.target)
})

const updateRelatedNodes = (nodeId) => {
  const byId = new Map(graph.value.nodes.map((node) => [node.id, node]))
  const related = new Map()
  for (const edge of graph.value.edges) {
    if (edge.source !== nodeId && edge.target !== nodeId) continue
    const otherId = edge.source === nodeId ? edge.target : edge.source
    const node = byId.get(otherId)
    if (!node) continue
    const current = related.get(otherId) || {
      id: otherId,
      title: node.title || otherId,
      summary: node.summary || '',
      kind: node.kind || 'note',
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

const openNode = (node) => {
  if ((node.kind || 'note') !== 'note') return
  const note = [...store.rootEntries, ...store.entries, ...store.openedNotes].find((entry) => entry.path === node.id)
  if (note) store.openNote(note)
}

const selectNode = (node) => {
  selectedNode.value = node
  selectedSource.value = null
  updateRelatedNodes(node.id)
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
  if (source.path) openNode({ id: source.path, kind: 'note' })
}

onMounted(() => {
  searchStore.inspect().catch(() => {})
})

watch(() => store.activeVault?.path, () => {
  searchStore.inspect().catch(() => {})
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

.en-graph-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.en-graph-summary span,
.en-graph-node-meta span {
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
  grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.8fr);
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
  overflow: hidden;
}

.en-graph-canvas {
  width: 100%;
  height: 100%;
  min-height: 620px;
}

.en-graph-canvas line {
  stroke: color-mix(in srgb, var(--en-border-strong) 72%, transparent);
  stroke-width: 1.4;
}

.en-graph-canvas line.semantic {
  stroke: color-mix(in srgb, var(--en-primary) 80%, transparent);
  stroke-width: 1.8;
}

.en-graph-canvas line.explicit-link {
  stroke: color-mix(in srgb, #0f766e 60%, transparent);
  stroke-dasharray: 4 4;
}

.en-graph-canvas line.folder {
  stroke: color-mix(in srgb, #f59e0b 48%, transparent);
  stroke-dasharray: 5 8;
}

.en-graph-node {
  cursor: pointer;
}

.en-graph-node circle {
  fill: var(--en-soft);
  stroke: var(--en-border-strong);
  stroke-width: 2;
}

.en-graph-node.selected circle {
  fill: color-mix(in srgb, var(--en-primary) 12%, var(--en-soft));
  stroke: var(--en-primary);
}

.en-graph-node.folder circle {
  fill: color-mix(in srgb, var(--en-primary) 26%, var(--en-soft));
}

.en-graph-node text {
  fill: var(--en-muted);
  font-size: 12px;
  pointer-events: none;
}

.en-graph-panel {
  overflow: auto;
  padding: 16px;
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

.en-graph-panel-head button,
.en-graph-section button,
.en-graph-source-card button {
  border: 1px solid var(--en-border);
  border-radius: 10px;
  min-height: 34px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
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
}
</style>

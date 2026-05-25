<template>
  <section class="en-workspace-view">
    <header class="en-workspace-header">
      <h1>Graph</h1>
      <p>{{ graph.nodes.length }} nodes, {{ graph.edges.length }} links from folders and shared tags.</p>
    </header>

    <div
      v-if="graph.nodes.length"
      class="en-graph-layout"
    >
      <svg
        class="en-graph-canvas"
        viewBox="0 0 800 520"
        role="img"
        aria-label="Knowledge graph"
      >
        <line
          v-for="edge in positionedEdges"
          :key="`${edge.source.id}-${edge.target.id}-${edge.reason}`"
          :x1="edge.source.x"
          :y1="edge.source.y"
          :x2="edge.target.x"
          :y2="edge.target.y"
        />
        <g
          v-for="node in positionedNodes"
          :key="node.id"
          class="en-graph-node"
          :class="node.kind"
          @click="openNode(node)"
        >
          <circle
            :cx="node.x"
            :cy="node.y"
            :r="node.kind === 'folder' ? 22 : 16"
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

    <p
      v-else
      class="en-empty-view"
    >
      Add notes to build the local graph.
    </p>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useVaultStore } from '../stores/vaultStore'

const store = useVaultStore()
const graph = computed(() => store.graphModel)
const positionedNodes = computed(() => {
  const count = Math.max(graph.value.nodes.length, 1)
  return graph.value.nodes.map((node, index) => {
    const angle = (Math.PI * 2 * index) / count
    const radius = node.kind === 'folder' ? 150 : 210
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

const openNode = (node) => {
  if (node.kind !== 'note') return
  const note = store.rootEntries.find((entry) => entry.path === node.id)
  if (note) store.openNote(note)
}
</script>

<style scoped>
.en-workspace-view {
  min-height: 0;
  flex: 1;
  padding: 28px;
  overflow: auto;
}

.en-workspace-header h1 {
  margin: 0;
  font-size: 28px;
  line-height: 1.15;
}

.en-workspace-header p,
.en-empty-view {
  margin: 6px 0 0;
  color: var(--en-muted);
}

.en-graph-layout {
  height: min(70vh, 620px);
  margin-top: 24px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  background: var(--en-bg);
}

.en-graph-canvas {
  width: 100%;
  height: 100%;
}

.en-graph-canvas line {
  stroke: color-mix(in srgb, var(--en-border-strong) 72%, transparent);
  stroke-width: 1.4;
}

.en-graph-node {
  cursor: pointer;
}

.en-graph-node circle {
  fill: var(--en-soft);
  stroke: var(--en-border-strong);
  stroke-width: 2;
}

.en-graph-node.folder circle {
  fill: color-mix(in srgb, var(--en-primary) 26%, var(--en-soft));
}

.en-graph-node text {
  fill: var(--en-muted);
  font-size: 12px;
  pointer-events: none;
}
</style>

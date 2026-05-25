<template>
  <section class="en-canvas-view">
    <header class="en-canvas-header">
      <h1>Canvas</h1>
      <div class="en-canvas-controls">
        <button
          type="button"
          @click="scale = Math.max(0.5, scale - 0.1)"
        >
          -
        </button>
        <span>{{ Math.round(scale * 100) }}%</span>
        <button
          type="button"
          @click="scale = Math.min(1.8, scale + 0.1)"
        >
          +
        </button>
      </div>
    </header>
    <div class="en-canvas-stage">
      <svg class="en-canvas-edges">
        <line
          v-for="edge in positionedEdges"
          :key="edge.id"
          :x1="edge.x1"
          :y1="edge.y1"
          :x2="edge.x2"
          :y2="edge.y2"
        />
      </svg>
      <div
        class="en-canvas-plane"
        :style="{ transform: `scale(${scale})` }"
      >
        <button
          v-for="node in positionedNodes"
          :key="node.id"
          class="en-canvas-node"
          type="button"
          :style="{ left: `${node.x}px`, top: `${node.y}px` }"
          @pointerdown="startDrag($event, node)"
          @dblclick="store.openNote(node)"
        >
          <strong>{{ node.title }}</strong>
          <span>{{ node.tags?.slice(0, 3).map((tag) => `#${tag}`).join(' ') }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useVaultStore } from '../stores/vaultStore'

const store = useVaultStore()
const scale = ref(1)
const positions = ref({})
const dragging = ref(null)

const storageKey = computed(() => `elephantnote:canvas:${store.activeVaultId || 'default'}`)
const notes = computed(() => store.rootEntries.filter((entry) => (entry.kind || entry.type) === 'note'))
const positionedNodes = computed(() => notes.value.map((note, index) => ({
  ...note,
  id: note.path,
  x: positions.value[note.path]?.x ?? 80 + (index % 4) * 240,
  y: positions.value[note.path]?.y ?? 80 + Math.floor(index / 4) * 150
})))
const positionedEdges = computed(() => {
  const byPath = new Map(positionedNodes.value.map((node) => [node.path, node]))
  return store.graphModel.edges
    .map((edge) => {
      const source = byPath.get(edge.source)
      const target = byPath.get(edge.target)
      if (!source || !target) return null
      return {
        id: `${edge.source}->${edge.target}`,
        x1: source.x + 90,
        y1: source.y + 42,
        x2: target.x + 90,
        y2: target.y + 42
      }
    })
    .filter(Boolean)
})

const persist = () => {
  window.localStorage.setItem(storageKey.value, JSON.stringify(positions.value))
}

const loadPositions = () => {
  try {
    positions.value = JSON.parse(window.localStorage.getItem(storageKey.value) || '{}')
  } catch {
    positions.value = {}
  }
}

const startDrag = (event, node) => {
  event.currentTarget.setPointerCapture?.(event.pointerId)
  dragging.value = {
    id: node.path,
    startX: event.clientX,
    startY: event.clientY,
    x: node.x,
    y: node.y
  }
}

const moveDrag = (event) => {
  if (!dragging.value) return
  const next = {
    x: dragging.value.x + (event.clientX - dragging.value.startX) / scale.value,
    y: dragging.value.y + (event.clientY - dragging.value.startY) / scale.value
  }
  positions.value = {
    ...positions.value,
    [dragging.value.id]: next
  }
}

const stopDrag = () => {
  if (!dragging.value) return
  dragging.value = null
  persist()
}

watch(storageKey, loadPositions)
onMounted(() => {
  loadPositions()
  window.addEventListener('pointermove', moveDrag)
  window.addEventListener('pointerup', stopDrag)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', moveDrag)
  window.removeEventListener('pointerup', stopDrag)
})
</script>

<style scoped>
.en-canvas-view {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
}

.en-canvas-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 24px 28px 12px;
}

.en-canvas-header h1 {
  margin: 0;
  font-size: 28px;
}

.en-canvas-controls {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.en-canvas-controls button {
  width: 34px;
  height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-canvas-stage {
  position: relative;
  min-height: 0;
  margin: 0 28px 28px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  background:
    linear-gradient(var(--en-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--en-border) 1px, transparent 1px);
  background-size: 32px 32px;
  overflow: auto;
}

.en-canvas-plane,
.en-canvas-edges {
  position: absolute;
  inset: 0;
  width: 1800px;
  height: 1200px;
  transform-origin: 0 0;
}

.en-canvas-edges {
  pointer-events: none;
}

.en-canvas-edges line {
  stroke: color-mix(in srgb, var(--en-muted) 42%, transparent);
  stroke-width: 2;
}

.en-canvas-node {
  position: absolute;
  width: 180px;
  min-height: 84px;
  display: grid;
  gap: 8px;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 12px;
  color: var(--en-text);
  background: var(--en-bg);
  text-align: left;
  box-shadow: 0 12px 30px color-mix(in srgb, #020617 18%, transparent);
  touch-action: none;
}

.en-canvas-node span {
  color: var(--en-muted);
  font-size: 12px;
}
</style>

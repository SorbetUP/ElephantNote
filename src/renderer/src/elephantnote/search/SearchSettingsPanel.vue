<template>
  <div class="en-search-settings">
    <section class="en-search-settings-row">
      <div>
        <h3>Semantic search</h3>
        <p>{{ statusLabel }}</p>
      </div>
      <button
        class="en-search-settings-toggle"
        type="button"
        :class="{ active: store.status.status !== 'disabled' }"
        @click="toggleSearch"
      >
        <Power class="en-icon" />
        {{ store.status.status === 'disabled' ? 'Off' : 'On' }}
      </button>
    </section>

    <section class="en-search-settings-row stacked">
      <div class="en-search-settings-head">
        <div>
          <h3>Index visualization</h3>
          <p>{{ documentCountLabel }} · {{ folderCountLabel }}</p>
        </div>
        <div class="en-search-settings-actions">
          <button
            type="button"
            @click="refresh"
          >
            <RefreshCw class="en-icon" />
            Refresh
          </button>
          <button
            type="button"
            :disabled="store.busy"
            @click="store.rebuild"
          >
            <RotateCcw class="en-icon" />
            Rebuild
          </button>
          <button
            type="button"
            :disabled="store.busy"
            @click="store.clear"
          >
            <Trash2 class="en-icon" />
            Clear
          </button>
        </div>
      </div>

      <div class="en-search-view-switch">
        <button
          v-for="mode in visualizationModes"
          :key="mode.id"
          type="button"
          :class="{ active: store.visualizationMode === mode.id }"
          @click="store.setVisualizationMode(mode.id)"
        >
          <component
            :is="mode.icon"
            class="en-icon"
          />
          {{ mode.label }}
        </button>
      </div>

      <div class="en-index-visualization">
        <svg
          v-if="store.visualizationMode !== 'list'"
          viewBox="0 0 720 320"
          role="img"
          aria-label="Search index visualization"
        >
          <g v-if="store.visualizationMode === 'graph'">
            <line
              v-for="link in graphLinks"
              :key="link.id"
              :x1="link.source.x"
              :y1="link.source.y"
              :x2="link.target.x"
              :y2="link.target.y"
              class="en-index-link"
            />
          </g>
          <g
            v-for="node in visualNodes"
            :key="node.id"
          >
            <circle
              :cx="node.x"
              :cy="node.y"
              :r="node.radius"
              class="en-index-node"
              :style="{ '--node-accent': node.color }"
              @click="openDocument(node.document)"
            />
            <text
              v-if="store.showVisualizationLabels"
              :x="node.x + node.radius + 5"
              :y="node.y + 4"
              class="en-index-label"
            >
              {{ node.label }}
            </text>
          </g>
        </svg>

        <div
          v-else
          class="en-index-document-list"
        >
          <button
            v-for="document in documents"
            :key="document.uri"
            type="button"
            @click="openDocument(document)"
          >
            <FileText class="en-icon" />
            <span>{{ document.title }}</span>
            <small>{{ document.relativePath }}</small>
          </button>
        </div>
      </div>

      <p
        v-if="!documents.length"
        class="en-search-settings-empty"
      >
        No indexed documents yet.
      </p>
    </section>

    <section class="en-search-settings-row stacked">
      <div>
        <h3>Search options</h3>
        <p>{{ store.indexInspection.indexPath || 'Index path unavailable' }}</p>
      </div>
      <div class="en-search-options-grid">
        <label>
          Default mode
          <select
            :value="store.defaultMode"
            @change="store.setDefaultMode($event.target.value)"
          >
            <option value="exact">Exact</option>
            <option value="smart">Smart</option>
            <option value="semantic">Semantic</option>
          </select>
        </label>

        <label>
          Result limit
          <input
            type="range"
            min="1"
            max="50"
            :value="store.queryLimit"
            @input="store.setQueryLimit($event.target.value)"
          >
          <output>{{ store.queryLimit }}</output>
        </label>

        <label>
          Graph density
          <input
            type="range"
            min="1"
            max="8"
            :value="store.graphDensity"
            @input="store.setGraphDensity($event.target.value)"
          >
          <output>{{ store.graphDensity }}</output>
        </label>

        <label class="en-search-check">
          <input
            type="checkbox"
            :checked="store.showVisualizationLabels"
            @change="store.setBooleanOption('showVisualizationLabels', $event.target.checked)"
          >
          Show labels
        </label>

        <label class="en-search-check">
          <input
            type="checkbox"
            :checked="store.showFolderClusters"
            @change="store.setBooleanOption('showFolderClusters', $event.target.checked)"
          >
          Folder clusters
        </label>

        <label class="en-search-check">
          <input
            type="checkbox"
            :checked="store.autoRefreshInspection"
            @change="store.setBooleanOption('autoRefreshInspection', $event.target.checked)"
          >
          Auto refresh
        </label>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue'
import {
  FileText,
  GitBranch,
  List,
  Orbit,
  Power,
  RefreshCw,
  RotateCcw,
  Trash2
} from '@lucide/vue'
import { useSearchStore } from '../stores/searchStore'
import { useVaultStore } from '../stores/vaultStore'

const store = useSearchStore()
const vaultStore = useVaultStore()
let refreshTimer = null

const visualizationModes = [
  { id: 'space', label: 'Space', icon: Orbit },
  { id: 'graph', label: 'Graph', icon: GitBranch },
  { id: 'list', label: 'List', icon: List }
]

const documents = computed(() => store.indexInspection.documents || [])
const folderCountLabel = computed(() => {
  const count = store.indexInspection.folders?.length || 0
  return `${count} folder${count === 1 ? '' : 's'}`
})
const documentCountLabel = computed(() => {
  const count = documents.value.length
  return `${count} document${count === 1 ? '' : 's'}`
})
const statusLabel = computed(() => {
  const status = store.status.status || 'not_initialized'
  if (status === 'ready') return 'Search index ready.'
  if (status === 'indexing') return `${store.status.indexedDocuments}/${store.status.totalDocuments} indexed.`
  if (status === 'disabled') return 'Semantic search disabled.'
  if (status === 'error') return store.status.error || 'Search index error.'
  return store.status.message || 'Search index not initialized.'
})

const hashString = (value) => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

const folderColor = (folder) => {
  const palette = ['#1264ff', '#0f9f6e', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#64748b']
  return palette[hashString(folder || 'root') % palette.length]
}

const visualNodes = computed(() => {
  const byFolder = new Map()
  for (const document of documents.value) {
    const key = store.showFolderClusters ? document.folder || 'Vault root' : 'All notes'
    if (!byFolder.has(key)) byFolder.set(key, [])
    byFolder.get(key).push(document)
  }

  const folders = [...byFolder.keys()]
  return documents.value.map((document, index) => {
    const folder = store.showFolderClusters ? document.folder || 'Vault root' : 'All notes'
    const folderIndex = Math.max(0, folders.indexOf(folder))
    const localIndex = byFolder.get(folder).indexOf(document)
    const ring = 36 + (localIndex % 7) * 13
    const angle = ((hashString(document.relativePath) % 360) * Math.PI) / 180
    const clusterX = 120 + (folderIndex % 4) * 160
    const clusterY = 88 + Math.floor(folderIndex / 4) * 96
    const graphX = 80 + (index % 8) * 82
    const graphY = 64 + Math.floor(index / 8) * 54

    return {
      id: document.uri,
      document,
      label: document.title,
      radius: 6 + Math.min(5, (document.title || '').length / 18),
      color: folderColor(folder),
      x: store.visualizationMode === 'graph' ? graphX : clusterX + Math.cos(angle) * ring,
      y: store.visualizationMode === 'graph' ? graphY : clusterY + Math.sin(angle) * ring
    }
  })
})

const graphLinks = computed(() => {
  const links = []
  const groups = new Map()

  for (const node of visualNodes.value) {
    const folder = node.document.folder || 'Vault root'
    if (!groups.has(folder)) groups.set(folder, [])
    groups.get(folder).push(node)
  }

  for (const group of groups.values()) {
    const maxLinks = Math.min(store.graphDensity, group.length - 1)
    for (let index = 0; index < group.length; index += 1) {
      for (let offset = 1; offset <= maxLinks; offset += 1) {
        const target = group[index + offset]
        if (!target) continue
        links.push({
          id: `${group[index].id}:${target.id}`,
          source: group[index],
          target
        })
      }
    }
  }

  return links
})

const refresh = async () => {
  await store.refreshStatus()
  await store.inspect()
}

const toggleSearch = async () => {
  if (store.status.status === 'disabled') {
    await store.enable()
  } else {
    await store.disable()
  }
  await refresh()
}

const openDocument = (document) => {
  store.vaultPath = vaultStore.activeVault?.path || store.vaultPath
  store.openResult(document)
}

onMounted(() => {
  refresh()
  refreshTimer = window.setInterval(() => {
    if (store.autoRefreshInspection) refresh()
  }, 5000)
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<style scoped>
.en-search-settings {
  display: grid;
  gap: 0;
}

.en-search-settings-row {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  padding: 18px 0;
  border-bottom: 1px solid var(--en-border);
}

.en-search-settings-row.stacked {
  display: grid;
}

.en-search-settings-row h3 {
  margin: 0 0 5px;
  font-size: 16px;
}

.en-search-settings-row p {
  margin: 0;
  color: var(--en-muted);
  overflow-wrap: anywhere;
}

.en-search-settings-head,
.en-search-settings-actions,
.en-search-view-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}

.en-search-settings-head {
  justify-content: space-between;
}

.en-search-settings-toggle,
.en-search-settings-actions button,
.en-search-view-switch button {
  height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  background: var(--en-surface);
  color: var(--en-text);
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.en-search-settings-toggle.active,
.en-search-view-switch button.active {
  border-color: color-mix(in srgb, var(--en-primary) 34%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-surface));
  color: var(--en-primary);
}

.en-search-settings-actions button:disabled {
  opacity: 0.55;
  cursor: progress;
}

.en-index-visualization {
  height: 330px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  background:
    linear-gradient(var(--en-soft) 1px, transparent 1px),
    linear-gradient(90deg, var(--en-soft) 1px, transparent 1px),
    var(--en-surface);
  background-size: 42px 42px;
  overflow: hidden;
}

.en-index-visualization svg {
  width: 100%;
  height: 100%;
}

.en-index-link {
  stroke: var(--en-border-strong);
  stroke-width: 1.3;
  opacity: 0.72;
}

.en-index-node {
  fill: var(--node-accent);
  stroke: var(--en-surface);
  stroke-width: 2;
  cursor: pointer;
}

.en-index-label {
  fill: var(--en-text);
  font-size: 11px;
  font-weight: 700;
  paint-order: stroke;
  stroke: var(--en-surface);
  stroke-width: 3px;
}

.en-index-document-list {
  height: 100%;
  overflow: auto;
  padding: 8px;
}

.en-index-document-list button {
  width: 100%;
  display: grid;
  grid-template-columns: 20px minmax(120px, 1fr) minmax(120px, 1.4fr);
  gap: 10px;
  align-items: center;
  min-height: 36px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--en-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.en-index-document-list button:hover {
  background: var(--en-soft);
}

.en-index-document-list span,
.en-index-document-list small {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.en-index-document-list small {
  color: var(--en-muted);
}

.en-search-options-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.en-search-options-grid label {
  display: grid;
  gap: 7px;
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 700;
}

.en-search-options-grid select,
.en-search-options-grid input[type="range"] {
  width: 100%;
}

.en-search-options-grid select {
  height: 34px;
  padding: 0 10px;
  border: 1px solid var(--en-border);
  border-radius: 9px;
  background: var(--en-surface);
  color: var(--en-text);
}

.en-search-options-grid output {
  color: var(--en-text);
}

.en-search-check {
  grid-template-columns: 18px 1fr;
  align-items: center;
  min-height: 34px;
}

.en-search-check input {
  accent-color: var(--en-primary);
}

.en-search-settings-empty {
  color: var(--en-muted);
}
</style>

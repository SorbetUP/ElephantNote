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
            :disabled="store.busy || store.status.status === 'indexing'"
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

      <div
        v-if="store.visualizationMode !== 'list'"
        class="en-semantic-map-toolbar"
      >
        <div class="en-semantic-topic-strip">
          <button
            type="button"
            :class="{ active: selectedTopicId === '' }"
            @click="selectedTopicId = ''"
          >
            All
          </button>
          <button
            v-for="topic in topicNodes"
            :key="topic.id"
            type="button"
            :class="{ active: selectedTopicId === topic.id }"
            @click="selectedTopicId = selectedTopicId === topic.id ? '' : topic.id"
          >
            {{ topic.label }}
          </button>
        </div>
        <div class="en-semantic-map-actions">
          <span>{{ semanticLinkCountLabel }}</span>
          <button
            type="button"
            @click="resetGraphView"
          >
            Reset
          </button>
        </div>
      </div>

      <div class="en-index-visualization">
        <svg
          v-if="store.visualizationMode !== 'list'"
          viewBox="0 0 720 320"
          role="img"
          aria-label="Search index visualization"
          @wheel.prevent="zoomGraph"
          @pointerdown="startGraphPan"
          @pointermove="moveGraphPan"
          @pointerup="stopGraphPan"
          @pointerleave="stopGraphPan"
        >
          <g :transform="graphTransform">
            <g
              v-for="topic in visibleTopicNodes"
              :key="topic.id"
            >
              <circle
                :cx="topic.x"
                :cy="topic.y"
                :r="topic.radius"
                class="en-topic-node"
                :style="{ '--node-accent': topic.color }"
                @click.stop="selectedTopicId = selectedTopicId === topic.id ? '' : topic.id"
              />
              <text
                :x="topic.x"
                :y="topic.y + 4"
                text-anchor="middle"
                class="en-topic-label"
              >
                {{ topic.label }}
              </text>
            </g>

            <line
              v-for="link in visibleGraphLinks"
              :key="link.id"
              :x1="link.source.x"
              :y1="link.source.y"
              :x2="link.target.x"
              :y2="link.target.y"
              :class="['en-index-link', `type-${link.type}`]"
              :style="{ '--link-strength': link.opacity, '--link-width': link.width }"
            />

            <g
              v-for="node in visibleDocumentNodes"
              :key="node.id"
            >
              <circle
                :cx="node.x"
                :cy="node.y"
                :r="node.radius"
                :class="['en-index-node', { dimmed: selectedTopicId && !node.topicIds.includes(selectedTopicId) }]"
                :style="{ '--node-accent': node.color }"
                @click.stop="openDocument(node.document)"
              />
              <text
                v-if="store.showVisualizationLabels"
                :x="node.x + node.radius + 6"
                :y="node.y + 4"
                class="en-index-label"
              >
                {{ node.label }}
              </text>
            </g>
          </g>
        </svg>

        <div
          v-else
          class="en-index-document-list"
        >
          <button
            v-for="document in filteredDocuments"
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
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
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
const selectedTopicId = ref('')
const graphViewport = ref({ x: 0, y: 0, scale: 1 })
const graphPan = ref(null)

const visualizationModes = [
  { id: 'space', label: 'Space', icon: Orbit },
  { id: 'graph', label: 'Graph', icon: GitBranch },
  { id: 'list', label: 'List', icon: List }
]

const documents = computed(() => store.indexInspection.documents || [])
const semanticLinks = computed(() => store.indexInspection.semanticLinks || [])
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
  const palette = ['#1264ff', '#0f9f6e', '#d97706', '#dc2626', '#0891b2', '#4f46e5', '#64748b', '#be185d']
  return palette[hashString(folder || 'root') % palette.length]
}

const normalizeTopicId = (value) => `topic:${String(value || 'Vault root').toLowerCase()}`

const keywordsForDocument = (document) => {
  const source = `${document.title || ''} ${document.relativePath || ''}`
    .toLowerCase()
    .replace(/\.md\b/g, ' ')
    .replace(/[^a-z0-9\u00c0-\u024f#]+/gi, ' ')
  return source
    .split(/\s+/)
    .map((word) => word.replace(/^#+/, ''))
    .filter((word) => word.length >= 4 && !['note', 'notes', 'untitled', 'getting', 'started'].includes(word))
    .slice(0, 4)
}

const topicNodes = computed(() => {
  const topics = new Map()
  for (const document of documents.value) {
    const folder = store.showFolderClusters ? document.folder || 'Vault root' : 'All notes'
    const folderId = normalizeTopicId(folder)
    if (!topics.has(folderId)) {
      topics.set(folderId, {
        id: folderId,
        kind: 'topic',
        label: folder.split('/').pop() || folder,
        source: folder,
        count: 0,
        color: folderColor(folder)
      })
    }
    topics.get(folderId).count += 1

    for (const keyword of keywordsForDocument(document).slice(0, 2)) {
      const keywordId = normalizeTopicId(keyword)
      if (!topics.has(keywordId)) {
        topics.set(keywordId, {
          id: keywordId,
          kind: 'topic',
          label: keyword,
          source: keyword,
          count: 0,
          color: folderColor(keyword)
        })
      }
      topics.get(keywordId).count += 1
    }
  }

  return [...topics.values()]
    .filter((topic) => topic.count > 0)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 18)
})

const documentTopicIds = (document) => {
  const ids = new Set()
  const folder = store.showFolderClusters ? document.folder || 'Vault root' : 'All notes'
  ids.add(normalizeTopicId(folder))
  for (const keyword of keywordsForDocument(document).slice(0, 2)) {
    ids.add(normalizeTopicId(keyword))
  }
  return [...ids]
}

const filteredDocuments = computed(() => {
  if (!selectedTopicId.value) return documents.value
  return documents.value.filter((document) => documentTopicIds(document).includes(selectedTopicId.value))
})

const graphTransform = computed(() => {
  const viewport = graphViewport.value
  return `translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`
})

const semanticLinkCountLabel = computed(() => {
  const count = semanticLinks.value.length
  if (count) return `${count} semantic link${count === 1 ? '' : 's'}`
  return 'Build the index to reveal semantic links'
})

const topicLayout = computed(() => {
  const layout = new Map()
  const topics = topicNodes.value
  const radius = store.visualizationMode === 'space' ? 104 : 118
  topics.forEach((topic, index) => {
    const angle = (index / Math.max(1, topics.length)) * Math.PI * 2 - Math.PI / 2
    layout.set(topic.id, {
      ...topic,
      x: 360 + Math.cos(angle) * radius,
      y: 160 + Math.sin(angle) * Math.min(radius, 84),
      radius: 18 + Math.min(18, topic.count * 1.7)
    })
  })
  return layout
})

const visibleTopicNodes = computed(() => {
  return [...topicLayout.value.values()]
})

const visualNodes = computed(() => {
  const linksByDocument = new Map()
  for (const link of semanticLinks.value) {
    linksByDocument.set(link.source, (linksByDocument.get(link.source) || 0) + 1)
    linksByDocument.set(link.target, (linksByDocument.get(link.target) || 0) + 1)
  }

  const byFolder = new Map()
  for (const document of documents.value) {
    const folder = store.showFolderClusters ? document.folder || 'Vault root' : 'All notes'
    if (!byFolder.has(folder)) byFolder.set(folder, [])
    byFolder.get(folder).push(document)
  }

  const topics = topicLayout.value
  return documents.value.map((document, index) => {
    const topicIds = documentTopicIds(document)
    const primaryTopic = topics.get(topicIds[0])
    const localGroup = byFolder.get(store.showFolderClusters ? document.folder || 'Vault root' : 'All notes') || []
    const localIndex = Math.max(0, localGroup.indexOf(document))
    const ring = 36 + (localIndex % 7) * 13
    const angle = (((hashString(document.relativePath) % 360) + localIndex * 23) * Math.PI) / 180
    const baseX = primaryTopic?.x || 360
    const baseY = primaryTopic?.y || 160
    const linkPull = Math.min(30, (linksByDocument.get(document.relativePath) || 0) * 4)
    const graphX = 80 + (index % 8) * 82
    const graphY = 64 + Math.floor(index / 8) * 54

    return {
      id: document.uri,
      document,
      topicIds,
      label: document.title,
      radius: 5 + Math.min(7, (linksByDocument.get(document.relativePath) || 0) + (document.indexed ? 2 : 0)),
      color: folderColor(document.folder || 'Vault root'),
      x: store.visualizationMode === 'graph' ? graphX : baseX + Math.cos(angle) * (ring - linkPull),
      y: store.visualizationMode === 'graph' ? graphY : baseY + Math.sin(angle) * Math.max(24, ring - linkPull)
    }
  })
})

const graphLinks = computed(() => {
  const links = []
  const nodeByPath = new Map(visualNodes.value.map((node) => [node.document.relativePath, node]))
  const topicById = topicLayout.value

  for (const node of visualNodes.value) {
    const topic = topicById.get(node.topicIds[0])
    if (topic) {
      links.push({
        id: `${topic.id}:${node.id}`,
        source: topic,
        target: node,
        type: 'topic',
        opacity: 0.22,
        width: 0.8
      })
    }
  }

  for (const link of semanticLinks.value) {
    const source = nodeByPath.get(link.source)
    const target = nodeByPath.get(link.target)
    if (!source || !target) continue
    links.push({
      id: link.id,
      source,
      target,
      type: 'semantic',
      score: link.score,
      opacity: 0.26 + Math.max(0, Math.min(0.62, link.score * 0.62)),
      width: 0.9 + Math.max(0, Math.min(2.8, link.score * 2.8))
    })
  }

  if (!semanticLinks.value.length) {
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
            target,
            type: 'folder',
            opacity: 0.28,
            width: 1
          })
        }
      }
    }
  }

  return links
})

const visibleDocumentNodes = computed(() => {
  if (!selectedTopicId.value) return visualNodes.value
  return visualNodes.value.filter((node) => node.topicIds.includes(selectedTopicId.value))
})

const visibleGraphLinks = computed(() => {
  if (!selectedTopicId.value) return graphLinks.value
  const visibleIds = new Set([
    selectedTopicId.value,
    ...visibleDocumentNodes.value.map((node) => node.id)
  ])
  return graphLinks.value.filter((link) => visibleIds.has(link.source.id) && visibleIds.has(link.target.id))
})

const resetGraphView = () => {
  graphViewport.value = { x: 0, y: 0, scale: 1 }
}

const zoomGraph = (event) => {
  const delta = event.deltaY > 0 ? -0.1 : 0.1
  const nextScale = Math.max(0.55, Math.min(2.8, graphViewport.value.scale + delta))
  graphViewport.value = {
    ...graphViewport.value,
    scale: nextScale
  }
}

const startGraphPan = (event) => {
  if (
    event.button !== 0 ||
    event.target?.classList?.contains('en-index-node') ||
    event.target?.classList?.contains('en-topic-node')
  ) return
  graphPan.value = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: graphViewport.value.x,
    y: graphViewport.value.y
  }
  event.currentTarget?.setPointerCapture?.(event.pointerId)
}

const moveGraphPan = (event) => {
  if (!graphPan.value || graphPan.value.pointerId !== event.pointerId) return
  graphViewport.value = {
    ...graphViewport.value,
    x: graphPan.value.x + event.clientX - graphPan.value.startX,
    y: graphPan.value.y + event.clientY - graphPan.value.startY
  }
}

const stopGraphPan = () => {
  graphPan.value = null
}

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
  gap: 16px;
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  justify-content: initial;
}

.en-search-settings-actions {
  justify-content: flex-end;
}

.en-semantic-map-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.en-semantic-topic-strip {
  display: flex;
  gap: 7px;
  overflow: auto;
  padding-bottom: 2px;
}

.en-semantic-topic-strip button,
.en-semantic-map-actions button {
  height: 30px;
  flex: 0 0 auto;
  border: 1px solid var(--en-border);
  border-radius: 8px;
  padding: 0 10px;
  color: var(--en-muted);
  background: var(--en-surface);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.en-semantic-topic-strip button.active,
.en-semantic-map-actions button:hover {
  border-color: color-mix(in srgb, var(--en-primary) 34%, var(--en-border));
  color: var(--en-primary);
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-surface));
}

.en-semantic-map-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--en-muted);
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
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
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 300px;
  max-height: 430px;
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
  cursor: grab;
  touch-action: none;
}

.en-index-link {
  stroke: var(--en-border-strong);
  stroke-width: calc(var(--link-width, 1) * 1px);
  opacity: var(--link-strength, 0.45);
  vector-effect: non-scaling-stroke;
}

.en-index-link.type-semantic {
  stroke: var(--en-primary);
}

.en-index-link.type-topic {
  stroke-dasharray: 4 5;
  opacity: 0.24;
}

.en-index-node {
  fill: var(--node-accent);
  stroke: var(--en-surface);
  stroke-width: 2;
  cursor: pointer;
}

.en-index-node.dimmed {
  opacity: 0.28;
}

.en-topic-node {
  fill: color-mix(in srgb, var(--node-accent) 22%, var(--en-surface));
  stroke: var(--node-accent);
  stroke-width: 2;
  cursor: pointer;
}

.en-topic-label {
  fill: var(--en-text);
  font-size: 10px;
  font-weight: 900;
  paint-order: stroke;
  stroke: var(--en-surface);
  stroke-width: 4px;
  pointer-events: none;
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

@media (max-width: 760px) {
  .en-search-settings-head {
    grid-template-columns: 1fr;
  }

  .en-search-settings-actions,
  .en-search-view-switch {
    flex-wrap: wrap;
  }

  .en-semantic-map-toolbar {
    grid-template-columns: 1fr;
  }

  .en-semantic-map-actions {
    justify-content: space-between;
  }
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

<template>
  <div class="en-search-settings">
    <section class="en-search-settings-row">
      <div>
        <h3>Atomic search</h3>
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
          <h3>Atomic metadata</h3>
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
            Refresh metadata
          </button>
          <button
            type="button"
            :disabled="store.busy"
            @click="store.clear"
          >
            <Trash2 class="en-icon" />
            Reset metadata
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
          aria-label="Atomic search metadata visualization"
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
        No markdown documents detected yet.
      </p>
    </section>

    <section class="en-search-settings-row stacked">
      <div>
        <h3>Search options</h3>
        <p>{{ store.indexInspection.indexPath || 'Atomic metadata path unavailable' }}</p>
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
  if (status === 'ready') return 'Atomic local search ready.'
  if (status === 'indexing') return `${store.status.indexedDocuments}/${store.status.totalDocuments} inspected.`
  if (status === 'disabled') return 'Atomic local search disabled.'
  if (status === 'error') return store.status.error || 'Atomic search error.'
  return store.status.message || 'Atomic search metadata not initialized.'
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
  const explicitTerms = Array.isArray(document.keyTerms) ? document.keyTerms : []
  if (explicitTerms.length) return explicitTerms.slice(0, 4)
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
  for (const keyword of keywordsForDocument(document).slice(0, 2)) ids.add(normalizeTopicId(keyword))
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
  if (count) return `${count} atomic link${count === 1 ? '' : 's'}`
  return 'Atomic metadata can still search without a separate vector index'
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

const visibleTopicNodes = computed(() => [...topicLayout.value.values()])

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
      type: link.type || 'semantic',
      score: link.score,
      opacity: 0.26 + Math.max(0, Math.min(0.62, link.score * 0.62)),
      width: 0.9 + Math.max(0, Math.min(2.8, link.score * 2.8))
    })
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
  graphViewport.value = { ...graphViewport.value, scale: nextScale }
}

const startGraphPan = (event) => {
  if (event.button !== 0) return
  graphPan.value = { startX: event.clientX, startY: event.clientY, origin: { ...graphViewport.value } }
}

const moveGraphPan = (event) => {
  if (!graphPan.value) return
  graphViewport.value = {
    ...graphViewport.value,
    x: graphPan.value.origin.x + event.clientX - graphPan.value.startX,
    y: graphPan.value.origin.y + event.clientY - graphPan.value.startY
  }
}

const stopGraphPan = () => {
  graphPan.value = null
}

const openDocument = (document) => {
  if (!document?.relativePath) return
  vaultStore.openNote({
    kind: 'note',
    type: 'note',
    path: document.relativePath,
    title: document.title || document.relativePath
  })
}

const refresh = async() => {
  await store.refreshStatus()
  await store.inspect()
}

const toggleSearch = async() => {
  if (store.status.status === 'disabled') await store.enable()
  else await store.disable()
  await refresh()
}

onMounted(async() => {
  await store.ensureActiveVault()
  await refresh()
  if (store.autoRefreshInspection) {
    refreshTimer = window.setInterval(() => {
      store.refreshStatus()
      store.inspect()
    }, 8000)
  }
})

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer)
})
</script>

<style scoped>
.en-search-settings {
  display: grid;
  gap: 12px;
}

.en-search-settings-row {
  border: 1px solid var(--en-border);
  border-radius: 12px;
  padding: 16px;
  background: var(--en-bg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.en-search-settings-row.stacked {
  display: block;
}

.en-search-settings-row h3 {
  margin: 0;
  color: var(--en-text);
  font-size: 17px;
}

.en-search-settings-row p {
  margin: 5px 0 0;
  color: var(--en-muted);
}

.en-search-settings-toggle,
.en-search-settings-actions button,
.en-search-view-switch button,
.en-semantic-topic-strip button,
.en-semantic-map-actions button,
.en-index-document-list button {
  border: 1px solid var(--en-border);
  border-radius: 8px;
  min-height: 34px;
  padding: 0 10px;
  color: var(--en-text);
  background: var(--en-surface);
  cursor: pointer;
}

.en-search-settings-toggle.active,
.en-search-view-switch button.active,
.en-semantic-topic-strip button.active {
  border-color: var(--en-border-strong);
  background: var(--en-soft-strong);
}

.en-search-settings-head,
.en-semantic-map-toolbar,
.en-semantic-map-actions,
.en-search-settings-actions,
.en-search-view-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.en-search-view-switch,
.en-semantic-map-toolbar {
  margin-top: 12px;
}

.en-semantic-topic-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.en-semantic-map-actions span {
  color: var(--en-muted);
  font-size: 12px;
}

.en-index-visualization {
  margin-top: 12px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  background: var(--en-surface);
  min-height: 340px;
  overflow: hidden;
}

.en-index-visualization svg {
  width: 100%;
  min-height: 340px;
}

.en-topic-node,
.en-index-node {
  fill: var(--node-accent);
  stroke: color-mix(in srgb, var(--node-accent) 70%, white);
  stroke-width: 1.5;
  cursor: pointer;
}

.en-topic-node {
  opacity: 0.18;
}

.en-index-node.dimmed {
  opacity: 0.18;
}

.en-index-link {
  stroke: var(--en-border-strong);
  opacity: var(--link-strength);
  stroke-width: var(--link-width);
}

.en-index-link.type-semantic,
.en-index-link.type-tag,
.en-index-link.type-term {
  stroke: var(--en-primary);
}

.en-index-link.type-folder,
.en-index-link.type-topic {
  stroke: var(--en-border-strong);
}

.en-topic-label,
.en-index-label {
  fill: var(--en-muted);
  font-size: 11px;
  pointer-events: none;
}

.en-index-document-list {
  display: grid;
  gap: 8px;
  padding: 12px;
  max-height: 360px;
  overflow: auto;
}

.en-index-document-list button {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  text-align: left;
}

.en-index-document-list small {
  grid-column: 2;
  color: var(--en-muted);
}

.en-search-options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.en-search-options-grid label {
  display: grid;
  gap: 5px;
  color: var(--en-muted);
}

.en-search-check {
  display: flex !important;
  grid-template-columns: auto 1fr;
  align-items: center;
}

select,
input[type="range"] {
  min-height: 34px;
}

.en-icon {
  width: 16px;
  height: 16px;
  vertical-align: middle;
}

.en-search-settings-empty {
  color: var(--en-muted);
}
</style>

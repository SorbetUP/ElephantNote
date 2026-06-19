<template>
  <section class="en-models-view">
    <header class="en-models-hero">
      <div class="en-models-hero-copy">
        <p class="en-models-kicker">Model studio</p>
        <h1>Local and remote GGUF models</h1>
        <span>{{ statusMessage }}</span>
        <div class="en-models-summary">
          <span>{{ modelStats.local }} local</span>
          <span>{{ modelStats.remote }} remote</span>
          <span>{{ modelStats.active }} active</span>
          <span>{{ modelStats.downloading }} downloading</span>
        </div>
      </div>
      <div class="en-models-hero-actions">
        <button
          type="button"
          :class="{ active: activeTab === 'local' }"
          @click="activeTab = 'local'"
        >
          Local
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'discover' }"
          @click="activeTab = 'discover'"
        >
          Discover
        </button>
        <button
          type="button"
          :class="{ active: activeTab === 'active' }"
          @click="activeTab = 'active'"
        >
          Active
        </button>
        <button
          type="button"
          @click="refresh"
        >
          Refresh
        </button>
      </div>
    </header>

    <section class="en-models-toolbar">
      <label>
        <span>Search Hugging Face</span>
        <input
          v-model.trim="query"
          type="search"
          placeholder="smollm2, qwen, nomic..."
          @keyup.enter="searchRemote"
        >
      </label>
      <label>
        <span>Limit</span>
        <input
          v-model.number="limit"
          type="number"
          min="4"
          max="50"
        >
      </label>
      <button
        type="button"
        :disabled="isSearching || !query"
        @click="searchRemote"
      >
        Search
      </button>
    </section>

    <div class="en-models-layout">
      <div class="en-models-main">
        <section class="en-models-section en-models-list-section">
          <div class="en-models-section-head">
            <div>
              <h2>{{ activeTabTitle }}</h2>
              <p>{{ activeTabDescription }}</p>
            </div>
            <span class="en-models-pill">{{ visibleModels.length }} models</span>
          </div>

          <div
            v-if="isLoading"
            class="en-models-empty"
          >
            Loading model data...
          </div>

          <div
            v-else
            class="en-models-grid"
          >
            <article
              v-for="model in visibleModels"
              :key="model.id || model.repoId || model.name"
              class="en-model-card"
              :class="{
                active: model.active,
                selected: isSelectedModel(model),
                downloading: isDownloading(model)
              }"
              @click="selectModel(model)"
            >
              <header>
                <div>
                  <strong>{{ model.name || model.id }}</strong>
                  <span>{{ model.provider || 'node-llama-cpp' }}</span>
                </div>
                <span class="en-model-state">
                  {{ model.active ? 'Active' : model.downloaded ? 'Installed' : 'Available' }}
                </span>
              </header>

              <p>
                {{ model.summary || model.pipelineTag || model.message || model.repoId || 'Model entry.' }}
              </p>

              <div class="en-model-card-meta">
                <span v-if="model.fileName || model.filename">{{ model.fileName || model.filename }}</span>
                <span v-if="model.sizeBytes || model.size">{{ formatSize(model.sizeBytes || model.size) }}</span>
                <span v-if="model.contextSize">ctx {{ model.contextSize }}</span>
                <span v-if="model.embeddingContextSize">emb {{ model.embeddingContextSize }}</span>
                <span v-if="model.downloads != null">{{ formatCompactCount(model.downloads) }} dl</span>
                <span v-if="model.likes != null">{{ formatCompactCount(model.likes) }} likes</span>
              </div>

              <div
                v-if="isDownloading(model)"
                class="en-model-progress"
              >
                <div :style="{ width: `${downloadProgress(model)}%` }" />
              </div>

              <small v-if="downloadMessage(model)">{{ downloadMessage(model) }}</small>

              <div class="en-model-card-actions">
                <button
                  v-if="model.provider === 'huggingface' || model.repoId || model.source === 'huggingface'"
                  type="button"
                  :disabled="isDownloading(model)"
                  @click="download(model)"
                >
                  Download
                </button>
                <button
                  v-if="model.provider === 'huggingface' || model.repoId || model.source === 'huggingface'"
                  type="button"
                  :disabled="isDownloading(model)"
                  @click="downloadAndActivate(model)"
                >
                  Install & activate
                </button>
                <button
                  v-if="model.active"
                  type="button"
                  :disabled="isDownloading(model)"
                  @click="deactivate(model)"
                >
                  Deactivate
                </button>
                <button
                  v-else-if="model.path || model.modelPath || model.fileName || model.filename"
                  type="button"
                  :disabled="isDownloading(model)"
                  @click="activate(model)"
                >
                  Activate
                </button>
                <button
                  v-if="model.path || model.modelPath"
                  type="button"
                  :disabled="isDownloading(model)"
                  @click="remove(model)"
                >
                  Delete
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>

      <aside class="en-models-sidebar">
        <section class="en-models-panel">
          <h3>{{ selectedModelTitle }}</h3>
          <template v-if="selectedModel">
            <div class="en-model-inspector-meta">
              <span>{{ selectedModel.provider || 'node-llama-cpp' }}</span>
              <span>{{ selectedModel.source || selectedModel.category || 'local' }}</span>
              <span v-if="selectedModel.task">{{ selectedModel.task }}</span>
              <span v-if="selectedModel.pipelineTag">{{ selectedModel.pipelineTag }}</span>
            </div>
            <p class="en-model-inspector-summary">
              {{ selectedModel.summary || selectedModel.notes || selectedModel.message || 'Inspect a model entry to see details.' }}
            </p>
            <div class="en-model-inspector-grid">
              <div>
                <small>Path</small>
                <strong>{{ selectedModel.modelPath || selectedModel.path || 'Remote' }}</strong>
              </div>
              <div>
                <small>Size</small>
                <strong>{{ formatSize(selectedModel.sizeBytes || selectedModel.size) || selectedModel.size || 'n/a' }}</strong>
              </div>
              <div>
                <small>Context</small>
                <strong>{{ selectedModel.contextSize || selectedModel.embeddingContextSize || 'auto' }}</strong>
              </div>
              <div>
                <small>Backend</small>
                <strong>{{ selectedModel.backend || selectedModel.engine || selectedModel.provider || 'auto' }}</strong>
              </div>
              <div>
                <small>Repo</small>
                <strong>{{ selectedModel.repoId || selectedModel.model || 'n/a' }}</strong>
              </div>
              <div>
                <small>Downloads</small>
                <strong>{{ selectedModel.downloads != null ? formatCompactCount(selectedModel.downloads) : 'n/a' }}</strong>
              </div>
            </div>
            <div class="en-model-inspector-actions">
              <button
                v-if="selectedModel.provider === 'huggingface' || selectedModel.repoId || selectedModel.source === 'huggingface'"
                type="button"
                :disabled="isDownloading(selectedModel)"
                @click.stop="download(selectedModel)"
              >
                Download
              </button>
              <button
                v-if="selectedModel.provider === 'huggingface' || selectedModel.repoId || selectedModel.source === 'huggingface'"
                type="button"
                :disabled="isDownloading(selectedModel)"
                @click.stop="downloadAndActivate(selectedModel)"
              >
                Install & activate
              </button>
              <button
                v-if="selectedModel.active"
                type="button"
                :disabled="isDownloading(selectedModel)"
                @click.stop="deactivate(selectedModel)"
              >
                Deactivate
              </button>
              <button
                v-else-if="selectedModel.path || selectedModel.modelPath || selectedModel.fileName || selectedModel.filename"
                type="button"
                :disabled="isDownloading(selectedModel)"
                @click.stop="activate(selectedModel)"
              >
                Activate
              </button>
              <button
                v-if="selectedModel.path || selectedModel.modelPath"
                type="button"
                :disabled="isDownloading(selectedModel)"
                @click.stop="remove(selectedModel)"
              >
                Delete
              </button>
            </div>
          </template>
          <p v-else>No model selected.</p>
        </section>

        <section class="en-models-panel">
          <h3>Active runtime</h3>
          <template v-if="activeModel">
            <strong>{{ activeModel.name || activeModel.id }}</strong>
            <p>{{ activeModel.modelPath || activeModel.path }}</p>
            <small>{{ activeModel.source || activeModel.provider || 'local' }}</small>
            <div class="en-models-active-meta">
              <span v-if="activeModel.backend">{{ activeModel.backend }}</span>
              <span v-if="activeModel.fileName">{{ activeModel.fileName }}</span>
              <span v-if="activeModel.contextSize">ctx {{ activeModel.contextSize }}</span>
            </div>
          </template>
          <p v-else>No model is active.</p>
        </section>

        <section class="en-models-panel">
          <h3>Discovery</h3>
          <p>
            Search the Hugging Face catalog, inspect local GGUF models, then activate a model for
            chat or embeddings.
          </p>
        </section>
      </aside>
    </div>
  </section>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import log from 'electron-log'
import { elephantnoteClient } from '../../services/elephantnoteClient'

const activeTab = ref('local')
const isLoading = ref(false)
const isSearching = ref(false)
const query = ref('')
const limit = ref(12)
const localData = ref(null)
const remoteData = ref(null)
const activeModel = ref(null)
const downloads = ref(new Map())
const selectedModel = ref(null)

const statusMessage = computed(() => {
  if (isLoading.value) return 'Loading model catalog...'
  if (isSearching.value) return 'Searching Hugging Face...'
  return localData.value?.message || 'Browse, download, and activate models.'
})

const modelStats = computed(() => ({
  local: allLocalModels.value.length,
  remote: remoteModels.value.length,
  active: activeModel.value ? 1 : 0,
  downloading: downloads.value.size
}))

const allLocalModels = computed(() => Array.isArray(localData.value?.models) ? localData.value.models : [])
const remoteModels = computed(() => Array.isArray(remoteData.value?.models) ? remoteData.value.models : [])

const visibleModels = computed(() => {
  if (activeTab.value === 'active') {
    return activeModel.value ? [activeModel.value] : []
  }
  if (activeTab.value === 'discover') return remoteModels.value
  return allLocalModels.value
})

const activeTabTitle = computed(() => {
  if (activeTab.value === 'active') return 'Current active model'
  if (activeTab.value === 'discover') return 'Hugging Face discovery'
  return 'Installed models'
})

const activeTabDescription = computed(() => {
  if (activeTab.value === 'active') return 'The model currently attached to the local runtime.'
  if (activeTab.value === 'discover') return 'Remote catalog results ready to download.'
  return 'Models present on disk and indexed by node-llama-cpp.'
})

const selectedModelTitle = computed(() => {
  if (selectedModel.value) return selectedModel.value.name || selectedModel.value.id || 'Selected model'
  if (activeModel.value) return activeModel.value.name || activeModel.value.id || 'Active model'
  return 'Model details'
})

let stopDownloadProgress = null

const refresh = async () => {
  isLoading.value = true
  try {
    const [local, active] = await Promise.allSettled([
      elephantnoteClient.models.list(),
      elephantnoteClient.models.active()
    ])
    if (local.status === 'fulfilled') localData.value = local.value
    if (active.status === 'fulfilled') activeModel.value = active.value
    if (!selectedModel.value) {
      selectedModel.value = active.status === 'fulfilled'
        ? active.value
        : local.status === 'fulfilled'
          ? local.value?.models?.[0] || null
          : null
    }
  } catch (error) {
    log.error('[models] refresh failed', error)
  } finally {
    isLoading.value = false
  }
}

const searchRemote = async () => {
  if (!query.value) return
  isSearching.value = true
  try {
    remoteData.value = await elephantnoteClient.models.searchHuggingFace({
      query: query.value,
      limit: Number(limit.value) || 12
    })
    activeTab.value = 'discover'
    selectedModel.value = remoteData.value?.models?.[0] || selectedModel.value
  } catch (error) {
    log.error('[models] searchRemote failed', error)
  } finally {
    isSearching.value = false
  }
}

const download = async (model) => {
  if (!model?.id) return
  downloads.value = new Map(downloads.value).set(model.id, { percent: 1, message: 'Starting download...' })
  try {
    const result = await elephantnoteClient.models.download({
      id: model.id,
      repoId: model.repoId,
      provider: model.provider
    })
    selectedModel.value = model
    await refresh()
    return result
  } catch (error) {
    downloads.value = new Map(downloads.value).set(model.id, {
      percent: 0,
      message: error instanceof Error ? error.message : 'Download failed.'
    })
    return null
  }
}

const downloadAndActivate = async (model) => {
  const result = await download(model)
  if (!result?.modelPath) return
  await elephantnoteClient.models.activate({
    model: {
      ...model,
      id: result.id || model.id,
      path: result.modelPath,
      modelPath: result.modelPath,
      provider: 'node-llama-cpp'
    }
  })
  await refresh()
}

const activate = async (model) => {
  await elephantnoteClient.models.activate({ model })
  selectedModel.value = model
  await refresh()
}

const deactivate = async (model) => {
  await elephantnoteClient.models.deactivate({ modelRef: model?.path || model?.modelPath || model?.id })
  await refresh()
}

const remove = async (model) => {
  await elephantnoteClient.models.remove({ modelRef: model?.path || model?.modelPath || model?.id })
  await refresh()
}

const selectModel = (model) => {
  selectedModel.value = model
}

const isSelectedModel = (model) => {
  const selectedId = selectedModel.value?.id || selectedModel.value?.repoId || selectedModel.value?.name
  const modelId = model?.id || model?.repoId || model?.name
  return Boolean(selectedId && modelId && selectedId === modelId)
}

const isDownloading = (model) => {
  return downloads.value.has(model.id || model.repoId || model.name)
}

const downloadProgress = (model) => {
  return downloads.value.get(model.id || model.repoId || model.name)?.percent || 0
}

const downloadMessage = (model) => {
  return downloads.value.get(model.id || model.repoId || model.name)?.message || ''
}

const formatSize = (value) => {
  const bytes = Number(value) || 0
  if (!bytes) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

const formatCompactCount = (value) => {
  const count = Number(value) || 0
  if (count >= 1000000) return `${(count / 1000000).toFixed(count >= 10000000 ? 0 : 1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1)}K`
  return `${count}`
}

onMounted(() => {
  stopDownloadProgress = elephantnoteClient.models.onDownloadProgress?.((progress) => {
    const key = progress.modelId || progress.id || progress.downloadId
    if (!key) return
    downloads.value = new Map(downloads.value).set(key, {
      percent: Number(progress.percent || 0),
      message: progress.message || progress.phase || 'Downloading...'
    })
  }) || null
  refresh()
})

onBeforeUnmount(() => {
  stopDownloadProgress?.()
  downloads.value = new Map()
})
</script>

<style scoped>
.en-models-view {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 14px;
  padding: 6px 28px 28px;
  overflow: hidden;
}

.en-models-hero {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  padding: 18px;
  border: 1px solid var(--en-border);
  border-radius: 20px;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--en-primary) 10%, transparent), transparent 40%),
    color-mix(in srgb, var(--en-surface) 94%, transparent);
}

.en-models-hero-copy {
  display: grid;
  gap: 8px;
}

.en-models-kicker {
  margin: 0;
  color: var(--en-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 11px;
}

.en-models-hero p {
  margin: 0;
  color: var(--en-muted);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.en-models-hero h1 {
  margin: 0;
  font-size: 28px;
}

.en-models-hero span {
  display: block;
  color: var(--en-muted);
  letter-spacing: normal;
  text-transform: none;
  font-size: 13px;
}

.en-models-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.en-models-summary span,
.en-model-state {
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 5px 10px;
  color: var(--en-muted);
  background: var(--en-bg);
  font-size: 12px;
}

.en-models-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.en-models-hero-actions button,
.en-models-toolbar button,
.en-model-card-actions button {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-models-hero-actions button.active {
  background: color-mix(in srgb, var(--en-primary) 12%, var(--en-bg));
}

.en-models-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
}

.en-models-toolbar label {
  display: grid;
  gap: 6px;
}

.en-models-toolbar span {
  color: var(--en-muted);
  font-size: 12px;
}

.en-models-toolbar input {
  min-height: 38px;
  min-width: 240px;
  border: 1px solid var(--en-border);
  border-radius: 10px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-models-layout {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) 320px;
  gap: 14px;
}

.en-models-main,
.en-models-sidebar {
  min-height: 0;
  overflow: auto;
}

.en-models-section,
.en-models-panel {
  border: 1px solid var(--en-border);
  border-radius: 22px;
  padding: 16px;
  background: color-mix(in srgb, var(--en-surface) 94%, transparent);
  backdrop-filter: blur(14px);
}

.en-models-section-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 14px;
}

.en-models-section h2,
.en-models-panel h3 {
  margin: 0;
  font-size: 18px;
}

.en-models-section p,
.en-models-panel p,
.en-models-panel small,
.en-models-empty,
.en-models-section-head p {
  color: var(--en-muted);
}

.en-models-pill {
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 5px 10px;
  color: var(--en-muted);
  background: var(--en-bg);
}

.en-models-empty {
  padding: 18px;
}

.en-models-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.en-model-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--en-border);
  border-radius: 18px;
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--en-bg) 88%, var(--en-surface)), var(--en-bg));
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
}

.en-model-card.active {
  border-color: color-mix(in srgb, var(--en-primary) 48%, var(--en-border));
  background: color-mix(in srgb, var(--en-primary) 8%, var(--en-bg));
}

.en-model-card.selected {
  border-color: color-mix(in srgb, var(--en-primary) 60%, var(--en-border));
  box-shadow: 0 18px 40px color-mix(in srgb, var(--en-primary) 12%, transparent);
  transform: translateY(-1px);
}

.en-model-card.downloading {
  border-color: color-mix(in srgb, #f59e0b 50%, var(--en-border));
}

.en-model-card header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}

.en-model-card header div {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.en-model-card header strong {
  color: var(--en-text);
}

.en-model-card header span,
.en-model-card p,
.en-model-card small,
.en-model-card-meta {
  color: var(--en-muted);
}

.en-model-card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

.en-model-progress {
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--en-soft-strong);
}

.en-model-progress div {
  height: 100%;
  min-width: 4%;
  border-radius: inherit;
  background: var(--en-primary);
}

.en-model-card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.en-model-card-actions button:disabled {
  opacity: 0.5;
}

.en-models-sidebar {
  display: grid;
  gap: 12px;
}

.en-models-panel {
  display: grid;
  gap: 8px;
  align-content: start;
}

.en-model-inspector-meta,
.en-model-inspector-grid,
.en-model-inspector-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.en-model-inspector-meta span {
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 5px 10px;
  color: var(--en-muted);
  background: var(--en-bg);
  font-size: 12px;
}

.en-model-inspector-summary {
  margin: 4px 0 0;
  color: var(--en-muted);
  line-height: 1.5;
}

.en-model-inspector-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.en-model-inspector-grid div {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--en-border);
  border-radius: 14px;
  background: var(--en-bg);
}

.en-model-inspector-grid small {
  color: var(--en-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.en-model-inspector-grid strong {
  color: var(--en-text);
  font-size: 13px;
  word-break: break-word;
}

.en-model-inspector-actions button {
  min-height: 34px;
  border: 1px solid var(--en-border);
  border-radius: 12px;
  padding: 0 12px;
  color: var(--en-text);
  background: var(--en-bg);
}

.en-model-inspector-actions button:disabled {
  opacity: 0.5;
}

.en-models-active-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.en-models-active-meta span {
  border: 1px solid var(--en-border);
  border-radius: 999px;
  padding: 5px 10px;
  color: var(--en-muted);
  background: var(--en-bg);
  font-size: 12px;
}

@media (max-width: 980px) {
  .en-models-layout {
    grid-template-columns: 1fr;
  }
}
</style>

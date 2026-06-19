<template>
  <section class="en-models-view">
    <header class="en-models-topbar">
      <div class="en-models-searchbar">
        <Search class="en-models-search-icon" />
        <input
          v-model.trim="query"
          type="search"
          placeholder="Search models by name (qwen, smollm2, nomic, bge…)"
          @keyup.enter="searchRemote"
        >
        <button
          v-if="query"
          type="button"
          class="en-models-search-clear"
          @click="query = ''"
        >
          <X class="en-icon" />
        </button>
      </div>

      <div class="en-models-filters">
        <span class="en-models-count">{{ visibleModels.length }} models</span>

        <label class="en-filter-pill">
          <span>Format</span>
          <select v-model="formatFilter">
            <option
              v-for="opt in FORMAT_FILTERS"
              :key="opt.id"
              :value="opt.id"
            >{{ opt.label }}</option>
          </select>
        </label>

        <label class="en-filter-pill">
          <span>Source</span>
          <select v-model="sourceFilter">
            <option
              v-for="opt in SOURCE_FILTERS"
              :key="opt.id"
              :value="opt.id"
            >{{ opt.label }}</option>
          </select>
        </label>

        <label class="en-filter-pill">
          <span>Sort</span>
          <select v-model="sortOption">
            <option
              v-for="opt in SORT_OPTIONS"
              :key="opt.id"
              :value="opt.id"
            >{{ opt.label }}</option>
          </select>
        </label>

        <button
          type="button"
          class="en-models-refresh"
          :disabled="isLoading"
          @click="refresh"
        >
          <RefreshCw
            class="en-icon"
            :class="{ spinning: isLoading }"
          />
        </button>
      </div>
    </header>

    <div class="en-models-body">
      <section class="en-models-list-column">
        <div
          v-if="isLoading && !visibleModels.length"
          class="en-models-empty"
        >
          Loading model data…
        </div>
        <div
          v-else-if="!visibleModels.length"
          class="en-models-empty"
        >
          <p>{{ emptyMessage }}</p>
          <button
            v-if="!query"
            type="button"
            @click="loadPopular"
          >
            Load popular models
          </button>
        </div>

        <ul
          v-else
          class="en-models-list"
        >
          <li
            v-for="model in visibleModels"
            :key="resolveModelId(model)"
            class="en-model-row"
            :class="{
              selected: isSelected(model),
              installed: isLocalModel(model),
              downloading: isDownloadingModel(model)
            }"
            @click="selectModel(model)"
          >
            <div class="en-model-row-icon">
              <Box class="en-icon" />
            </div>
            <div class="en-model-row-main">
              <strong class="en-model-row-name">{{ resolveModelName(model) }}</strong>
              <span class="en-model-row-author">{{ resolveModelAuthor(model) || 'unknown' }}</span>
              <div class="en-model-row-badges">
                <span
                  v-for="cap in getModelCapabilities(model).slice(0, 3)"
                  :key="cap"
                  class="en-cap-badge"
                  :class="`cap-${cap.toLowerCase().replace(/[^a-z]/g, '')}`"
                >{{ cap }}</span>
                <span
                  v-if="isLocalModel(model)"
                  class="en-cap-badge cap-installed"
                >Installed</span>
              </div>
            </div>
            <div class="en-model-row-stats">
              <span
                v-if="model.likes != null"
                class="en-stat"
              >
                <Heart class="en-icon" />
                {{ formatCompactCount(model.likes) }}
              </span>
              <span
                v-if="model.downloads != null"
                class="en-stat"
              >
                <Download class="en-icon" />
                {{ formatCompactCount(model.downloads) }}
              </span>
              <span
                v-if="getModelUpdatedDate(model)"
                class="en-stat en-stat-date"
              >
                {{ formatRelativeDate(getModelUpdatedDate(model)) }}
              </span>
            </div>
          </li>
        </ul>
      </section>

      <section class="en-models-detail-column">
        <template v-if="selectedModel">
          <header class="en-detail-header">
            <div class="en-detail-icon">
              <Box class="en-icon" />
            </div>
            <div class="en-detail-title">
              <strong>{{ resolveModelAuthor(selectedModel) || 'local' }}/{{ resolveModelName(selectedModel) }}</strong>
              <small>{{ getModelSource(selectedModel) }}</small>
            </div>
            <div class="en-detail-actions">
              <button
                type="button"
                class="en-icon-btn"
                title="Copy model id"
                @click="copyModelId"
              >
                <Copy class="en-icon" />
              </button>
              <button
                type="button"
                class="en-icon-btn"
                title="Open model card"
                @click="openModelCard"
              >
                <ExternalLink class="en-icon" />
              </button>
            </div>
          </header>

          <div class="en-detail-stats">
            <span v-if="selectedModel.downloads != null">
              <Download class="en-icon" />
              {{ formatCompactCount(selectedModel.downloads) }} downloads
            </span>
            <span v-if="selectedModel.likes != null">
              <Star class="en-icon" />
              {{ formatCompactCount(selectedModel.likes) }} stars
            </span>
            <span v-if="getModelUpdatedDate(selectedModel)">
              <Clock class="en-icon" />
              Last updated: {{ formatRelativeDate(getModelUpdatedDate(selectedModel)) }}
            </span>
          </div>

          <div class="en-detail-badges">
            <span class="en-meta-badge badge-format">Format: {{ getModelFormat(selectedModel) }}</span>
            <span
              v-if="getModelQuantization(selectedModel)"
              class="en-meta-badge badge-quant"
            >
              Quantization: {{ getModelQuantization(selectedModel) }}
            </span>
            <span class="en-meta-badge badge-runtime">Runtime: {{ getModelRuntime(selectedModel) }}</span>
            <span
              v-if="getModelCapabilities(selectedModel).length"
              class="en-meta-badge badge-caps"
            >
              Capabilities: {{ getModelCapabilities(selectedModel).join(', ') }}
            </span>
            <span class="en-meta-badge badge-source">Source: {{ getModelSource(selectedModel) }}</span>
          </div>

          <section class="en-detail-card en-download-card">
            <header>
              <strong>Download Options</strong>
              <small>{{ downloadOption.status }}</small>
            </header>
            <div class="en-download-row">
              <div class="en-download-info">
                <strong>{{ downloadOption.fileName }}</strong>
                <span>{{ downloadOption.format }}{{ downloadOption.quantization ? ` · ${downloadOption.quantization}` : '' }} · {{ downloadOption.sizeLabel || 'unknown size' }}</span>
              </div>
              <div class="en-download-action">
                <div class="en-use-menu">
                  <button
                    type="button"
                    class="en-btn-primary en-use-trigger"
                    :class="{ assigned: getRoleAssignments(selectedModel, modelSelection).length > 0 }"
                    @click.stop="toggleUseMenu"
                  >
                    <Layers class="en-icon" />
                    <span>Use…</span>
                    <ChevronDown class="en-icon en-chevron" />
                  </button>
                  <div
                    v-if="useMenuOpen"
                    class="en-use-popover"
                  >
                    <p class="en-use-popover-title">
                      Assign model to a role
                    </p>
                    <button
                      v-for="option in useMenuOptions"
                      :key="option.id"
                      type="button"
                      class="en-use-option"
                      :class="{ selected: option.selected }"
                      @click.stop="chooseRole(option.id)"
                    >
                      <span class="en-use-option-main">
                        <strong>{{ option.label }}</strong>
                        <small>{{ option.hint }}</small>
                      </span>
                      <span class="en-use-option-meta">
                        <span
                          v-if="option.recommended"
                          class="en-use-tag recommended"
                        >Recommended</span>
                        <CheckCircle2
                          v-if="option.selected"
                          class="en-icon en-use-check"
                        />
                      </span>
                    </button>
                  </div>
                </div>
                <button
                  v-if="!isLocalModel(selectedModel) && isRemoteModel(selectedModel) && !isDownloadingModel(selectedModel)"
                  type="button"
                  class="en-btn-secondary"
                  @click="download(selectedModel)"
                >
                  <Download class="en-icon" />
                  <span>Download {{ downloadOption.sizeLabel }}</span>
                </button>
                <button
                  v-if="isDownloadingModel(selectedModel)"
                  type="button"
                  class="en-btn-ghost"
                  @click="cancelDownload(selectedModel)"
                >
                  Cancel download
                </button>
                <button
                  v-if="isLocalModel(selectedModel) && selectedModel.provider !== 'local-ocr'"
                  type="button"
                  class="en-btn-danger"
                  :disabled="isDownloadingModel(selectedModel)"
                  @click="remove(selectedModel)"
                >
                  <Trash2 class="en-icon" />
                  <span>Uninstall</span>
                </button>
              </div>
            </div>
            <div
              v-if="isDownloadingModel(selectedModel)"
              class="en-model-progress"
            >
              <div :style="{ width: `${downloadPercent(selectedModel)}%` }" />
            </div>
            <small v-if="downloadMessageFor(selectedModel)">{{ downloadMessageFor(selectedModel) }}</small>
          </section>

          <section class="en-detail-card en-roles-card">
            <header>
              <strong>Active roles for this model</strong>
              <small>{{ getRoleAssignments(selectedModel, modelSelection).length || 0 }} assigned</small>
            </header>
            <ul class="en-role-list">
              <li
                v-for="role in MODEL_ROLES"
                :key="role.id"
              >
                <div class="en-role-row">
                  <div class="en-role-info">
                    <strong>{{ role.label }}</strong>
                    <small>{{ role.hint }}</small>
                  </div>
                  <div class="en-role-current">
                    <template v-if="isAssignedToRole(selectedModel, role.id, modelSelection)">
                      <span class="en-role-active">Assigned</span>
                      <button
                        type="button"
                        class="en-btn-ghost en-role-clear"
                        @click="clearRole(role.id)"
                      >
                        <X class="en-icon" />
                      </button>
                    </template>
                    <span
                      v-else
                      class="en-role-empty"
                    >Not assigned</span>
                  </div>
                </div>
              </li>
            </ul>
          </section>

          <section class="en-detail-card en-readme-card">
            <header>
              <strong>README</strong>
              <small>Technical details</small>
            </header>
            <div class="en-readme-body">
              <h3>{{ readme.original }}</h3>
              <p>{{ readme.description }}</p>
              <dl class="en-readme-meta">
                <div>
                  <dt>Model creator</dt>
                  <dd>{{ readme.creator }}</dd>
                </div>
                <div>
                  <dt>Original model</dt>
                  <dd>{{ readme.original }}</dd>
                </div>
                <div>
                  <dt>Format</dt>
                  <dd>{{ readme.format }}</dd>
                </div>
                <div>
                  <dt>Runtime</dt>
                  <dd>{{ readme.runtime }}</dd>
                </div>
                <div>
                  <dt>License</dt>
                  <dd>{{ readme.license }}</dd>
                </div>
                <div v-if="selectedModel.repoId">
                  <dt>Repository</dt>
                  <dd>{{ selectedModel.repoId }}</dd>
                </div>
                <div v-if="selectedModel.modelPath || selectedModel.path">
                  <dt>Local path</dt>
                  <dd>{{ selectedModel.modelPath || selectedModel.path }}</dd>
                </div>
              </dl>
            </div>
          </section>
        </template>

        <div
          v-else
          class="en-detail-empty"
        >
          <Box class="en-detail-empty-icon" />
          <p>Select a model from the list to see details</p>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import log from 'electron-log/renderer'
import {
  Box,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Heart,
  Layers,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X
} from '@lucide/vue'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import {
  FORMAT_FILTERS,
  MODEL_ROLES,
  SORT_OPTIONS,
  SOURCE_FILTERS,
  USE_NONE,
  applyCatalogFilters,
  applyRoleChoice,
  clearSpecificRole,
  downloadMessage,
  downloadProgress,
  formatCompactCount,
  formatRelativeDate,
  getDownloadOption,
  getModelCapabilities,
  getModelFormat,
  getModelQuantization,
  getModelReadme,
  getModelRuntime,
  getModelSource,
  getModelUpdatedDate,
  getPopularModels,
  getRoleAssignments,
  getUseMenuOptions,
  isAssignedToRole,
  isDownloading,
  isLocalModel,
  isRemoteModel,
  normalizeSelection,
  resolveModelAuthor,
  resolveModelId,
  resolveModelName,
  sortByPopularity
} from './modelsViewHelpers'
import { ATOMIC_MODEL_CATALOG } from 'common/elephantnote/atomicWorkspace'

const formatFilter = ref('all')
const sourceFilter = ref('all')
const sortOption = ref('best')
const query = ref('')
const isLoading = ref(false)
const isSearching = ref(false)
const localData = ref(null)
const remoteData = ref(null)
const popularData = ref(null)
const modelSelection = ref(normalizeSelection({}))
const downloads = ref(new Map())
const selectedModel = ref(null)
const useMenuOpen = ref(false)

let stopDownloadProgress = null

const allLocalModels = computed(() =>
  Array.isArray(localData.value?.models) ? localData.value.models : []
)
const remoteModels = computed(() =>
  Array.isArray(remoteData.value?.models) ? remoteData.value.models : []
)
const popularModels = computed(() => {
  if (Array.isArray(popularData.value?.models) && popularData.value.models.length) {
    return popularData.value.models
  }
  return getPopularModels({
    catalog: ATOMIC_MODEL_CATALOG,
    remote: remoteModels.value,
    limit: 12
  })
})

const allCatalogModels = computed(() =>
  sortByPopularity([...allLocalModels.value, ...remoteModels.value, ...popularModels.value])
)

const visibleModels = computed(() =>
  applyCatalogFilters({
    models: allCatalogModels.value,
    query: query.value,
    format: formatFilter.value,
    source: sourceFilter.value,
    sort: sortOption.value
  })
)

const emptyMessage = computed(() => {
  if (query.value) return `No models found for "${query.value}".`
  if (sourceFilter.value !== 'all' || formatFilter.value !== 'all') {
    return 'No models match the current filters.'
  }
  return 'No models available yet. Try refreshing or searching Hugging Face.'
})

const useMenuOptions = computed(() => getUseMenuOptions(selectedModel.value || {}, modelSelection.value))
const readme = computed(() => getModelReadme(selectedModel.value || {}))
const downloadOption = computed(() => getDownloadOption(selectedModel.value || {}))

const isSelected = (model) => {
  const selectedId = resolveModelId(selectedModel.value)
  const modelId = resolveModelId(model)
  return Boolean(selectedId && modelId && selectedId === modelId)
}

const isDownloadingModel = (model) => isDownloading(model, downloads.value)
const downloadPercent = (model) => downloadProgress(model, downloads.value)
const downloadMessageFor = (model) => downloadMessage(model, downloads.value)

const selectModel = (model) => {
  selectedModel.value = model
  useMenuOpen.value = false
}

const toggleUseMenu = () => {
  useMenuOpen.value = !useMenuOpen.value
}

const chooseRole = async (choice) => {
  const role = choice === USE_NONE ? '' : choice
  const next = applyRoleChoice(modelSelection.value, role, selectedModel.value, choice)
  modelSelection.value = next
  useMenuOpen.value = false
  try {
    await elephantnoteClient.models.setSelection?.(next)
  } catch (error) {
    log.error('[models] setSelection failed', error)
  }
  const model = selectedModel.value
  if (role && model && isRemoteModel(model) && !isLocalModel(model) && !isDownloadingModel(model)) {
    download(model)
  }
}

const clearRole = async (role) => {
  const next = clearSpecificRole(modelSelection.value, role)
  modelSelection.value = next
  try {
    await elephantnoteClient.models.setSelection?.(next)
  } catch (error) {
    log.error('[models] clearRole failed', error)
  }
}

const copyModelId = () => {
  const id = resolveModelId(selectedModel.value)
  if (id && navigator?.clipboard) {
    navigator.clipboard.writeText(id).catch(() => {})
  }
}

const openModelCard = () => {
  const repoId = selectedModel.value?.repoId || selectedModel.value?.id
  if (!repoId) return
  const url = repoId.includes('/')
    ? `https://huggingface.co/${repoId}`
    : `https://huggingface.co/models?search=${encodeURIComponent(repoId)}`
  if (window?.open) window.open(url, '_blank', 'noopener')
}

const refresh = async () => {
  isLoading.value = true
  try {
    const [local, selection] = await Promise.allSettled([
      elephantnoteClient.models.list(),
      elephantnoteClient.models.getSelection?.()
    ])
    if (local.status === 'fulfilled') {
      localData.value = local.value
    }
    if (selection.status === 'fulfilled' && selection.value) {
      modelSelection.value = normalizeSelection(selection.value)
    }
    if (!selectedModel.value && visibleModels.value.length) {
      selectedModel.value = visibleModels.value[0]
    }
  } catch (error) {
    log.error('[models] refresh failed', error)
  } finally {
    isLoading.value = false
  }
}

const loadPopular = async () => {
  try {
    const result = await elephantnoteClient.models.searchHuggingFace({
      query: '',
      limit: 24,
      sort: 'downloads',
      direction: -1
    })
    popularData.value = result
    if (!remoteData.value?.models?.length) remoteData.value = result
    if (!selectedModel.value && visibleModels.value.length) {
      selectedModel.value = visibleModels.value[0]
    }
  } catch (error) {
    log.error('[models] loadPopular failed', error)
  }
}

const searchRemote = async () => {
  if (!query.value) return
  isSearching.value = true
  try {
    remoteData.value = await elephantnoteClient.models.searchHuggingFace({
      query: query.value,
      limit: 24,
      sort: 'downloads',
      direction: -1
    })
    if (visibleModels.value.length && !isSelected(selectedModel.value)) {
      selectedModel.value = visibleModels.value[0]
    }
  } catch (error) {
    log.error('[models] searchRemote failed', error)
    remoteData.value = { models: [], message: error instanceof Error ? error.message : 'Search failed.' }
  } finally {
    isSearching.value = false
  }
}

const download = async (model) => {
  const id = resolveModelId(model)
  if (!id) return
  downloads.value = new Map(downloads.value).set(id, { percent: 1, message: 'Starting download…' })
  try {
    await elephantnoteClient.models.download({
      id,
      repoId: model.repoId,
      provider: model.provider
    })
    await refresh()
  } catch (error) {
    downloads.value = new Map(downloads.value).set(id, {
      percent: 0,
      message: error instanceof Error ? error.message : 'Download failed.'
    })
  }
}

const cancelDownload = async (model) => {
  const id = resolveModelId(model)
  if (!id) return
  try {
    await elephantnoteClient.models.cancelDownload?.({ id })
    const next = new Map(downloads.value)
    next.delete(id)
    downloads.value = next
  } catch (error) {
    log.error('[models] cancelDownload failed', error)
  }
}

const remove = async (model) => {
  const ref = model.path || model.modelPath || resolveModelId(model)
  if (!ref) return
  try {
    await elephantnoteClient.models.remove({ modelRef: ref })
    const next = applyRoleChoice(modelSelection.value, '', model, USE_NONE)
    modelSelection.value = next
    await elephantnoteClient.models.setSelection?.(next)
    await refresh()
  } catch (error) {
    log.error('[models] remove failed', error)
  }
}

const handleDocumentClick = (event) => {
  if (!useMenuOpen.value) return
  const target = event.target
  if (!target || !target.closest || !target.closest('.en-use-menu')) {
    useMenuOpen.value = false
  }
}

const handleEscape = (event) => {
  if (event.key === 'Escape') useMenuOpen.value = false
}

watch(visibleModels, (models) => {
  if (!selectedModel.value && models.length) {
    selectedModel.value = models[0]
  } else if (selectedModel.value && !models.some((m) => isSelected(m))) {
    selectedModel.value = models[0] || null
  }
})

onMounted(() => {
  stopDownloadProgress = elephantnoteClient.models.onDownloadProgress?.((progress) => {
    const key = progress.modelId || progress.id || progress.downloadId
    if (!key) return
    downloads.value = new Map(downloads.value).set(key, {
      percent: Number(progress.percent || 0),
      message: progress.message || progress.phase || 'Downloading…'
    })
  }) || null
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleEscape)
  refresh()
  loadPopular()
})

onBeforeUnmount(() => {
  stopDownloadProgress?.()
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleEscape)
  downloads.value = new Map()
})
</script>

<style scoped>
.en-models-view {
  --lms-bg-app: #181818;
  --lms-bg-surface: #222222;
  --lms-bg-card: #2a2a2a;
  --lms-bg-card-hover: #303030;
  --lms-bg-input: #383838;
  --lms-border-subtle: #3a3a3a;
  --lms-border-strong: #505050;
  --lms-text-primary: #f2f2f2;
  --lms-text-secondary: #b8b8b8;
  --lms-text-muted: #858585;
  --lms-accent: #3f7df3;
  --lms-accent-hover: #4d8cff;
  --lms-accent-soft: rgba(63, 125, 243, 0.16);
  --lms-purple: #6c5cff;
  --lms-green: #4caf5c;
  --lms-yellow: #d6a531;
  --lms-danger: #ef5350;

  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  padding: 16px 18px;
  overflow: hidden;
  background: var(--lms-bg-app);
  color: var(--lms-text-primary);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
}

.en-models-topbar {
  display: grid;
  gap: 10px;
}

.en-models-searchbar {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 38px;
  min-height: 40px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 12px;
  background: var(--lms-bg-input);
}

.en-models-search-icon {
  position: absolute;
  left: 12px;
  width: 16px;
  height: 16px;
  color: var(--lms-text-muted);
}

.en-models-searchbar input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  color: var(--lms-text-primary);
  font-size: 14px;
}

.en-models-searchbar input:focus {
  outline: none;
}

.en-models-search-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  color: var(--lms-text-muted);
  background: transparent;
}

.en-models-search-clear:hover {
  color: var(--lms-text-primary);
  background: rgba(255, 255, 255, 0.08);
}

.en-models-filters {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.en-models-count {
  color: var(--lms-text-muted);
  font-size: 12px;
  margin-right: 4px;
}

.en-filter-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 999px;
  background: var(--lms-bg-card);
  color: var(--lms-text-secondary);
  font-size: 12px;
}

.en-filter-pill span {
  color: var(--lms-text-muted);
}

.en-filter-pill select {
  border: 0;
  background: transparent;
  color: var(--lms-text-primary);
  font-size: 12px;
  font-weight: 500;
}

.en-filter-pill select:focus {
  outline: none;
}

.en-models-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 8px;
  color: var(--lms-text-secondary);
  background: var(--lms-bg-card);
}

.en-models-refresh:hover {
  color: var(--lms-text-primary);
  border-color: var(--lms-border-strong);
}

.en-models-refresh:disabled {
  opacity: 0.5;
}

.en-models-body {
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(280px, 38fr) minmax(0, 62fr);
  gap: 12px;
  overflow: hidden;
}

.en-models-list-column {
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 14px;
  background: var(--lms-bg-surface);
}

.en-models-detail-column {
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 12px;
  align-content: start;
  padding: 4px;
}

.en-models-empty {
  padding: 48px 24px;
  text-align: center;
  color: var(--lms-text-muted);
  font-size: 13px;
}

.en-models-empty p {
  margin: 0 0 12px;
}

.en-models-empty button {
  min-height: 32px;
  padding: 0 14px;
  border: 1px solid var(--lms-border-strong);
  border-radius: 8px;
  color: var(--lms-text-primary);
  background: var(--lms-bg-card);
  font-size: 12px;
}

.en-models-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  display: grid;
  gap: 2px;
}

.en-model-row {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: background-color 100ms ease, border-color 100ms ease;
}

.en-model-row:hover {
  background: var(--lms-bg-card-hover);
  border-color: var(--lms-border-subtle);
}

.en-model-row.selected {
  background: var(--lms-accent);
  border-color: var(--lms-accent-hover);
  color: #fff;
}

.en-model-row.selected .en-model-row-author,
.en-model-row.selected .en-stat,
.en-model-row.selected .en-stat-date,
.en-model-row.selected .en-cap-badge {
  color: rgba(255, 255, 255, 0.9);
}

.en-model-row.selected .en-cap-badge {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.28);
}

.en-model-row.selected .en-model-row-icon,
.en-model-row.selected .en-stat .en-icon {
  color: rgba(255, 255, 255, 0.85);
}

.en-model-row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--lms-bg-card);
  color: var(--lms-text-secondary);
}

.en-model-row.selected .en-model-row-icon {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.en-model-row-main {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.en-model-row-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--lms-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-model-row-author {
  font-size: 11px;
  color: var(--lms-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-model-row-badges {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 2px;
}

.en-cap-badge {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 999px;
  background: var(--lms-bg-card);
  color: var(--lms-text-muted);
  font-size: 10px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.en-cap-badge.cap-vision {
  color: var(--lms-yellow);
  border-color: rgba(214, 165, 49, 0.4);
}

.en-cap-badge.cap-tooluse {
  color: var(--lms-accent);
  border-color: rgba(63, 125, 243, 0.4);
}

.en-cap-badge.cap-installed {
  color: var(--lms-green);
  border-color: rgba(76, 175, 92, 0.4);
}

.en-model-row-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 11px;
  color: var(--lms-text-muted);
  text-align: right;
}

.en-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.en-stat .en-icon {
  width: 11px;
  height: 11px;
}

.en-stat-date {
  color: var(--lms-text-muted);
  font-size: 10px;
}

.en-detail-empty {
  display: grid;
  gap: 12px;
  justify-items: center;
  align-content: center;
  height: 100%;
  color: var(--lms-text-muted);
  text-align: center;
}

.en-detail-empty-icon {
  width: 48px;
  height: 48px;
  color: var(--lms-border-strong);
}

.en-detail-empty p {
  margin: 0;
  font-size: 13px;
}

.en-detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 14px;
  background: var(--lms-bg-surface);
}

.en-detail-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--lms-bg-card);
  color: var(--lms-text-secondary);
}

.en-detail-icon .en-icon {
  width: 18px;
  height: 18px;
}

.en-detail-title {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}

.en-detail-title strong {
  font-size: 16px;
  font-weight: 600;
  color: var(--lms-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-detail-title small {
  color: var(--lms-text-muted);
  font-size: 12px;
}

.en-detail-actions {
  display: flex;
  gap: 6px;
}

.en-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 8px;
  color: var(--lms-text-secondary);
  background: var(--lms-bg-card);
}

.en-icon-btn:hover {
  color: var(--lms-text-primary);
  border-color: var(--lms-border-strong);
}

.en-detail-stats {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  padding: 0 4px;
  color: var(--lms-text-secondary);
  font-size: 12px;
}

.en-detail-stats span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.en-detail-stats .en-icon {
  width: 13px;
  height: 13px;
  color: var(--lms-text-muted);
}

.en-detail-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.en-meta-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 10px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 999px;
  background: var(--lms-bg-card);
  color: var(--lms-text-secondary);
  font-size: 11px;
  font-weight: 500;
}

.en-meta-badge.badge-format {
  color: var(--lms-accent);
  border-color: rgba(63, 125, 243, 0.4);
  background: rgba(63, 125, 243, 0.1);
}

.en-meta-badge.badge-quant {
  color: var(--lms-purple);
  border-color: rgba(108, 92, 255, 0.4);
  background: rgba(108, 92, 255, 0.1);
}

.en-meta-badge.badge-caps {
  color: var(--lms-yellow);
  border-color: rgba(214, 165, 49, 0.4);
  background: rgba(214, 165, 49, 0.1);
}

.en-detail-card {
  border: 1px solid var(--lms-border-subtle);
  border-radius: 14px;
  background: var(--lms-bg-surface);
  overflow: hidden;
}

.en-detail-card header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--lms-border-subtle);
  background: var(--lms-bg-card);
}

.en-detail-card header strong {
  font-size: 13px;
  font-weight: 600;
  color: var(--lms-text-primary);
}

.en-detail-card header small {
  color: var(--lms-text-muted);
  font-size: 11px;
}

.en-download-card .en-download-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
}

.en-download-info {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.en-download-info strong {
  font-size: 13px;
  color: var(--lms-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.en-download-info span {
  font-size: 12px;
  color: var(--lms-text-muted);
}

.en-download-action {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.en-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--lms-accent);
  border-radius: 9px;
  background: var(--lms-accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
}

.en-btn-primary:hover {
  background: var(--lms-accent-hover);
  border-color: var(--lms-accent-hover);
}

.en-btn-primary.assigned {
  background: var(--lms-accent-soft);
  color: var(--lms-accent);
}

.en-btn-primary .en-chevron {
  width: 13px;
  height: 13px;
}

.en-btn-secondary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 14px;
  border: 1px solid var(--lms-border-strong);
  border-radius: 9px;
  background: var(--lms-bg-card);
  color: var(--lms-text-primary);
  font-size: 13px;
  font-weight: 500;
}

.en-btn-secondary:hover {
  border-color: var(--lms-accent);
  color: var(--lms-accent);
}

.en-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--lms-text-secondary);
  font-size: 13px;
}

.en-btn-ghost:hover {
  color: var(--lms-text-primary);
  background: var(--lms-bg-card-hover);
}

.en-btn-danger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 12px;
  border: 1px solid rgba(239, 83, 80, 0.4);
  border-radius: 9px;
  background: transparent;
  color: var(--lms-danger);
  font-size: 13px;
}

.en-btn-danger:hover {
  background: rgba(239, 83, 80, 0.1);
}

.en-btn-danger:disabled {
  opacity: 0.5;
}

.en-use-menu {
  position: relative;
}

.en-use-popover {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  z-index: 30;
  min-width: 256px;
  padding: 8px;
  border: 1px solid var(--lms-border-strong);
  border-radius: 12px;
  background: var(--lms-bg-surface);
  box-shadow: 0 24px 56px rgba(0, 0, 0, 0.5);
  display: grid;
  gap: 4px;
}

.en-use-popover-title {
  margin: 2px 8px 6px;
  color: var(--lms-text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.en-use-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--lms-text-primary);
  text-align: left;
}

.en-use-option:hover {
  background: var(--lms-bg-card-hover);
}

.en-use-option.selected {
  border-color: rgba(63, 125, 243, 0.4);
  background: var(--lms-accent-soft);
}

.en-use-option-main {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.en-use-option-main strong {
  font-size: 13px;
}

.en-use-option-main small {
  color: var(--lms-text-muted);
  font-size: 11px;
}

.en-use-option-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.en-use-tag.recommended {
  display: inline-flex;
  align-items: center;
  height: 16px;
  padding: 0 6px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 999px;
  background: var(--lms-bg-card);
  color: var(--lms-text-muted);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.en-use-check {
  width: 15px;
  height: 15px;
  color: var(--lms-accent);
}

.en-model-progress {
  height: 4px;
  background: var(--lms-bg-input);
}

.en-model-progress div {
  height: 100%;
  min-width: 4%;
  background: var(--lms-accent);
  transition: width 160ms ease;
}

.en-download-card small {
  display: block;
  padding: 8px 16px 12px;
  color: var(--lms-text-muted);
  font-size: 11px;
}

.en-roles-card .en-role-list {
  list-style: none;
  margin: 0;
  padding: 8px;
  display: grid;
  gap: 6px;
}

.en-role-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 9px;
  background: var(--lms-bg-card);
}

.en-role-info {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.en-role-info strong {
  font-size: 13px;
  color: var(--lms-text-primary);
}

.en-role-info small {
  color: var(--lms-text-muted);
  font-size: 11px;
}

.en-role-current {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.en-role-active {
  color: var(--lms-green);
  font-size: 12px;
  font-weight: 500;
}

.en-role-empty {
  color: var(--lms-text-muted);
  font-size: 12px;
}

.en-role-clear {
  min-height: 26px;
  padding: 0 8px;
  font-size: 12px;
}

.en-readme-body {
  padding: 16px;
  color: var(--lms-text-secondary);
}

.en-readme-body h3 {
  margin: 0 0 8px;
  font-size: 16px;
  color: var(--lms-text-primary);
}

.en-readme-body p {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
}

.en-readme-meta {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  margin: 0;
}

.en-readme-meta div {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--lms-border-subtle);
  border-radius: 9px;
  background: var(--lms-bg-card);
}

.en-readme-meta dt {
  color: var(--lms-text-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.en-readme-meta dd {
  margin: 0;
  color: var(--lms-text-primary);
  font-size: 13px;
  word-break: break-word;
}

.en-icon.spinning {
  animation: en-models-spin 0.9s linear infinite;
}

@keyframes en-models-spin {
  to { transform: rotate(360deg); }
}

@media (max-width: 920px) {
  .en-models-body {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(220px, 38fr) minmax(0, 62fr);
  }
  .en-models-view {
    padding: 12px;
  }
}
</style>

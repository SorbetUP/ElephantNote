<template>
  <section class="en-models-view">
    <aside class="en-models-list-column">
      <div class="en-models-searchbar">
        <Search class="en-models-search-icon" />
        <input v-model.trim="query" type="search" placeholder="Search GGUF models" @keyup.enter="loadRemoteModels" />
        <button v-if="query" type="button" class="en-models-search-clear" @click="query = ''"><X class="en-icon" /></button>
      </div>
      <div class="en-models-filters">
        <span class="en-models-count">{{ visibleModels.length }} models</span>
        <label class="en-filter-pill"><span>Format</span><select v-model="formatFilter"><option v-for="opt in FORMAT_FILTERS" :key="opt.id" :value="opt.id">{{ opt.label }}</option></select></label>
        <label class="en-filter-pill"><span>Source</span><select v-model="sourceFilter"><option v-for="opt in SOURCE_FILTERS" :key="opt.id" :value="opt.id">{{ opt.label }}</option></select></label>
        <label class="en-filter-pill"><span>Sort</span><select v-model="sortOption"><option v-for="opt in SORT_OPTIONS" :key="opt.id" :value="opt.id">{{ opt.label }}</option></select></label>
        <button type="button" class="en-models-refresh" :disabled="isLoading" @click="refreshAll"><RefreshCw class="en-icon" :class="{ spinning: isLoading }" /></button>
      </div>
      <div v-if="isLoading && !visibleModels.length" class="en-models-empty">Loading model library…</div>
      <div v-else-if="!visibleModels.length" class="en-models-empty"><p>{{ emptyMessage }}</p><button type="button" @click="refreshAll">Refresh library</button></div>
      <ul v-else class="en-models-list">
        <li v-for="model in visibleModels" :key="getModelKey(model)" class="en-model-row" :class="{ selected: isSelected(model), installed: isInstalled(model), downloading: isDownloadingModel(model) }" @click="selectModel(model)">
          <div class="en-model-row-icon"><Box class="en-icon" /></div>
          <div class="en-model-row-main"><strong class="en-model-row-name">{{ resolveModelName(model) }}</strong><span class="en-model-row-author">{{ resolveModelAuthor(model) || getModelSource(model) }}</span><div class="en-model-row-badges"><span v-for="cap in getModelCapabilities(model).slice(0, 3)" :key="cap" class="en-cap-badge">{{ cap }}</span><span v-if="isInstalled(model)" class="en-cap-badge cap-installed">Installed</span></div></div>
          <div class="en-model-row-stats"><span v-if="model.likes != null">♡ {{ formatCompactCount(model.likes) }}</span><span v-if="model.downloads != null">↓ {{ formatCompactCount(model.downloads) }}</span><span v-if="getModelUpdatedDate(model)">{{ formatRelativeDate(getModelUpdatedDate(model)) }}</span></div>
        </li>
      </ul>
    </aside>

    <main class="en-models-detail-column">
      <template v-if="selectedModel">
        <header class="en-detail-header"><div class="en-detail-icon"><Box class="en-icon" /></div><div class="en-detail-title"><strong>{{ detailTitle }}</strong><small>{{ detailSubtitle }}</small></div><button type="button" class="en-icon-btn" @click="copyModelId"><Copy class="en-icon" /></button><button type="button" class="en-icon-btn" @click="openModelCard"><ExternalLink class="en-icon" /></button></header>
        <div class="en-detail-stats"><span v-if="selectedModel.downloads != null">↓ {{ formatCompactCount(selectedModel.downloads) }} downloads</span><span v-if="selectedModel.likes != null">☆ {{ formatCompactCount(selectedModel.likes) }} stars</span><span v-if="getModelUpdatedDate(selectedModel)">Updated {{ formatRelativeDate(getModelUpdatedDate(selectedModel)) }}</span></div>
        <div class="en-detail-badges"><span class="en-meta-badge">Format: {{ getModelFormat(selectedModel) }}</span><span v-if="getModelQuantization(selectedModel)" class="en-meta-badge">Quantization: {{ getModelQuantization(selectedModel) }}</span><span class="en-meta-badge">Runtime: {{ getModelRuntime(selectedModel) }}</span><span class="en-meta-badge">Source: {{ getModelSource(selectedModel) }}</span></div>
        <section class="en-detail-card en-download-card"><header><strong>Model options</strong><small>{{ modelOptionStatus }}</small></header><div class="en-download-row"><div class="en-download-info"><strong>{{ downloadOption.fileName }}</strong><span>{{ downloadOption.format }}{{ downloadOption.quantization ? ` · ${downloadOption.quantization}` : '' }} · {{ downloadOption.sizeLabel || 'unknown size' }}</span></div><div class="en-download-action"><button type="button" class="en-btn-primary" :disabled="!canDownload || isDownloadingModel(selectedModel)" @click="download(selectedModel)"><Download class="en-icon" />{{ canDownload ? 'Download' : 'Downloaded' }}</button><button v-for="role in MODEL_ROLES" :key="role.id" type="button" class="en-btn-secondary" :class="{ assigned: isAssignedToRole(selectedModel, role.id, modelSelection) }" :disabled="isDownloadingModel(selectedModel)" @click="useFor(role.id)">{{ isAssignedToRole(selectedModel, role.id, modelSelection) ? `Used for ${role.label}` : `Use for ${role.label}` }}</button><button v-if="isDownloadingModel(selectedModel)" type="button" class="en-btn-ghost" @click="cancelDownload(selectedModel)">Cancel</button><button v-if="selectedInstalledModel && selectedInstalledModel.provider !== 'local-ocr'" type="button" class="en-btn-danger" @click="remove(selectedInstalledModel)">Uninstall</button></div></div><div v-if="isDownloadingModel(selectedModel)" class="en-model-progress"><div :style="{ width: `${downloadPercent(selectedModel)}%` }" /></div><small v-if="downloadMessageFor(selectedModel)">{{ downloadMessageFor(selectedModel) }}</small></section>
        <section class="en-detail-card en-readme-card"><header><strong>README</strong><small>{{ readmeStatus }}</small></header><div class="en-readme-body"><pre>{{ readmeLoading ? 'Loading Hugging Face README…' : (readmeText || readmeMessage) }}</pre></div></section>
      </template>
      <div v-else class="en-detail-empty"><Box class="en-detail-empty-icon" /><p>Select a model from the library to see details</p></div>
    </main>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import log from 'electron-log/renderer'
import { Box, Copy, Download, ExternalLink, RefreshCw, Search, X } from '@lucide/vue'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { FORMAT_FILTERS, MODEL_ROLES, SORT_OPTIONS, SOURCE_FILTERS, USE_NONE, applyCatalogFilters, applyRoleChoice, downloadMessage, downloadProgress, formatCompactCount, formatRelativeDate, getDownloadOption, getModelCapabilities, getModelFormat, getModelQuantization, getModelRuntime, getModelSource, getModelUpdatedDate, isAssignedToRole, isDownloading, isLocalModel, isRemoteModel, normalizeSelection, resolveModelAuthor, resolveModelId, resolveModelName, sortByPopularity } from './modelsViewHelpers'

const formatFilter = ref('all')
const sourceFilter = ref('all')
const sortOption = ref('best')
const query = ref('')
const isLoading = ref(false)
const localData = ref(null)
const remoteData = ref(null)
const modelSelection = ref(normalizeSelection({}))
const downloads = ref(new Map())
const selectedModel = ref(null)
const readmeText = ref('')
const readmeMessage = ref('')
const readmeLoading = ref(false)
let stopDownloadProgress = null
let readmeRequestId = 0
let searchTimer = null

const localModels = computed(() => Array.isArray(localData.value?.models) ? localData.value.models : [])
const remoteModels = computed(() => Array.isArray(remoteData.value?.models) ? remoteData.value.models : [])
const getModelKey = (model = {}) => String(model.repoId || model.id || model.modelId || model.path || model.modelPath || resolveModelName(model)).toLowerCase()
const dedupeModels = (models = []) => Array.from(models.reduce((map, model) => {
  const key = getModelKey(model)
  if (!key) return map
  const previous = map.get(key)
  if (!previous || isLocalModel(model) || Number(model.downloads || 0) > Number(previous.downloads || 0)) map.set(key, model)
  return map
}, new Map()).values())
const allModels = computed(() => sortByPopularity(dedupeModels([...localModels.value, ...remoteModels.value])))
const visibleModels = computed(() => dedupeModels(applyCatalogFilters({ models: allModels.value, query: query.value, format: formatFilter.value, source: sourceFilter.value, sort: sortOption.value })))
const emptyMessage = computed(() => query.value ? `No GGUF models found for "${query.value}".` : 'No GGUF models returned by the model library yet.')
const selectedInstalledModel = computed(() => findInstalledMatch(selectedModel.value))
const downloadOption = computed(() => getDownloadOption(selectedInstalledModel.value || selectedModel.value || {}))
const canDownload = computed(() => selectedModel.value && isRemoteModel(selectedModel.value) && !selectedInstalledModel.value)
const modelOptionStatus = computed(() => selectedInstalledModel.value ? 'Applicable model file already downloaded' : downloadOption.value.status)
const detailTitle = computed(() => {
  const model = selectedModel.value || {}
  const repoId = String(model.repoId || model.id || '').trim()
  if (repoId.includes('/')) return repoId
  const author = resolveModelAuthor(model)
  return author ? `${author}/${resolveModelName(model)}` : resolveModelName(model)
})
const detailSubtitle = computed(() => selectedInstalledModel.value ? `Installed · ${selectedInstalledModel.value.path || selectedInstalledModel.value.modelPath || ''}` : getModelSource(selectedModel.value || {}))
const readmeStatus = computed(() => readmeLoading.value ? 'Loading' : readmeText.value ? 'Hugging Face' : 'Unavailable')

const sortForBackend = () => sortOption.value === 'likes' ? 'likes' : sortOption.value === 'updated' ? 'lastModified' : 'downloads'
const isSelected = (model) => getModelKey(model) === getModelKey(selectedModel.value || {})
const isInstalled = (model) => Boolean(findInstalledMatch(model))
const isDownloadingModel = (model) => isDownloading(model, downloads.value)
const downloadPercent = (model) => downloadProgress(model, downloads.value)
const downloadMessageFor = (model) => downloadMessage(model, downloads.value)

const firstGgufFile = (model = {}) => model.fileName || model.filename || (Array.isArray(model.siblings) ? model.siblings.find((s) => String(s.rfilename || '').toLowerCase().endsWith('.gguf'))?.rfilename : '') || ''
const findInstalledMatch = (model = {}) => {
  if (!model) return null
  const lookup = [model.repoId, model.id, model.modelId, model.fileName, model.filename, firstGgufFile(model)].filter(Boolean).map(String)
  return localModels.value.find((item) => {
    const values = new Set([item.repoId, item.id, item.modelId, item.name, item.fileName, item.filename, item.path, item.modelPath].filter(Boolean).map(String))
    return lookup.some((value) => values.has(value))
  }) || null
}

const loadLocalModels = async() => {
  localData.value = await (elephantnoteClient.models.listLocal?.() || elephantnoteClient.models.list())
  const selection = await elephantnoteClient.models.getSelection?.().catch(() => null)
  if (selection) modelSelection.value = normalizeSelection(selection)
}
const loadRemoteModels = async() => {
  remoteData.value = await elephantnoteClient.models.searchHuggingFace({
    query: query.value,
    limit: 48,
    sort: sortForBackend(),
    direction: -1,
    libraryName: 'gguf'
  })
}
const refreshAll = async() => {
  isLoading.value = true
  try {
    await Promise.all([loadLocalModels(), loadRemoteModels()])
    if (!selectedModel.value && visibleModels.value.length) selectModel(visibleModels.value[0])
  } catch (error) {
    log.error('[models] refreshAll failed', error)
  } finally {
    isLoading.value = false
  }
}

const stripFrontmatter = (text = '') => String(text || '').replace(/^---\s*[\r\n]+[\s\S]*?[\r\n]+---\s*[\r\n]*/, '').trim()
const loadReadme = async(model = {}) => {
  const requestId = ++readmeRequestId
  readmeText.value = ''
  readmeMessage.value = ''
  const repoId = String(model.repoId || model.id || '').trim()
  if (!repoId.includes('/')) {
    readmeMessage.value = 'No Hugging Face README for this local model.'
    return
  }
  readmeLoading.value = true
  try {
    for (const branch of ['main', 'master']) {
      const response = await fetch(`https://huggingface.co/${repoId}/raw/${branch}/README.md`).catch(() => null)
      if (!response?.ok) continue
      const text = stripFrontmatter(await response.text())
      if (requestId === readmeRequestId) readmeText.value = text || 'README is empty.'
      break
    }
    if (requestId === readmeRequestId && !readmeText.value) readmeMessage.value = 'README not found.'
  } catch (error) {
    if (requestId === readmeRequestId) readmeMessage.value = error instanceof Error ? error.message : 'Unable to load README.'
  } finally {
    if (requestId === readmeRequestId) readmeLoading.value = false
  }
}
const loadSelectedInfo = async(model = {}) => {
  if (!model?.repoId && !String(model?.id || '').includes('/')) return
  try {
    const info = await elephantnoteClient.models.info({ modelRef: model.repoId || model.id })
    if (selectedModel.value && getModelKey(selectedModel.value) === getModelKey(model)) selectedModel.value = { ...selectedModel.value, ...info }
  } catch (error) {
    log.warn('[models] info failed', error)
  }
}
const selectModel = (model) => {
  selectedModel.value = model
  loadSelectedInfo(model)
  loadReadme(model)
}

const setDownloadState = (model, state) => {
  const keys = [resolveModelId(model), model?.id, model?.repoId, state?.id, state?.modelId, state?.downloadId].filter(Boolean).map(String)
  const next = new Map(downloads.value)
  keys.forEach((key) => next.set(key, { ...(next.get(key) || {}), ...state }))
  downloads.value = next
}
const download = async(model) => {
  if (!model) return null
  setDownloadState(model, { percent: 1, message: 'Starting download…' })
  try {
    const result = await elephantnoteClient.models.download({ ...model, id: resolveModelId(model), repoId: model.repoId || model.id, provider: model.provider || 'huggingface', source: model.source || 'huggingface', fileName: firstGgufFile(model) })
    setDownloadState(model, { percent: 100, message: result?.message || 'Download complete.', downloadId: result?.downloadId })
    await loadLocalModels()
    return result
  } catch (error) {
    setDownloadState(model, { percent: 0, message: error instanceof Error ? error.message : 'Download failed.' })
    return null
  }
}
const useFor = async(role) => {
  if (!selectedModel.value) return
  let target = selectedInstalledModel.value || selectedModel.value
  if (!selectedInstalledModel.value && isRemoteModel(selectedModel.value)) {
    await download(selectedModel.value)
    target = findInstalledMatch(selectedModel.value) || selectedModel.value
  }
  const next = applyRoleChoice(modelSelection.value, role, target, role)
  modelSelection.value = next
  await elephantnoteClient.models.setSelection?.(next).catch((error) => log.error('[models] setSelection failed', error))
}
const cancelDownload = async(model) => {
  const id = resolveModelId(model)
  await elephantnoteClient.models.cancelDownload?.({ id }).catch((error) => log.error('[models] cancelDownload failed', error))
  const next = new Map(downloads.value)
  ;[id, model?.id, model?.repoId].filter(Boolean).forEach((key) => next.delete(String(key)))
  downloads.value = next
}
const remove = async(model) => {
  if (!model) return
  await elephantnoteClient.models.remove({ modelRef: model.path || model.modelPath || resolveModelId(model) })
  const next = applyRoleChoice(modelSelection.value, '', model, USE_NONE)
  modelSelection.value = next
  await elephantnoteClient.models.setSelection?.(next)
  await loadLocalModels()
}
const copyModelId = () => {
  const id = resolveModelId(selectedModel.value)
  if (id && navigator?.clipboard) navigator.clipboard.writeText(id).catch(() => {})
}
const openModelCard = () => {
  const id = selectedModel.value?.repoId || selectedModel.value?.id
  if (id && window?.open) window.open(id.includes('/') ? `https://huggingface.co/${id}` : `https://huggingface.co/models?search=${encodeURIComponent(id)}`, '_blank', 'noopener')
}

watch([query, sortOption], () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => loadRemoteModels().catch((error) => log.error('[models] remote search failed', error)), 350)
})
watch(visibleModels, (models) => {
  if (!selectedModel.value && models.length) selectModel(models[0])
  else if (selectedModel.value && !models.some((model) => isSelected(model))) selectModel(models[0] || null)
})
onMounted(() => {
  stopDownloadProgress = elephantnoteClient.models.onDownloadProgress?.((progress) => setDownloadState({ id: progress.modelId || progress.id }, { percent: Number(progress.percent || 0), message: progress.message || progress.phase || 'Downloading…', ...progress })) || null
  refreshAll()
})
onBeforeUnmount(() => {
  window.clearTimeout(searchTimer)
  stopDownloadProgress?.()
  downloads.value = new Map()
})
</script>

<style scoped>
.en-models-view{--bg:#181818;--surface:#222;--card:#2a2a2a;--input:#383838;--line:#3a3a3a;--strong:#505050;--text:#f2f2f2;--muted:#858585;--accent:#3f7df3;display:grid;grid-template-columns:minmax(300px,34fr) minmax(0,66fr);gap:12px;min-height:0;flex:1;padding:16px;background:var(--bg);color:var(--text);font:14px Inter,system-ui,sans-serif;overflow:hidden}.en-models-list-column,.en-models-detail-column{min-height:0;overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.en-models-list-column{display:grid;grid-template-rows:auto auto minmax(0,1fr)}.en-models-detail-column{display:grid;align-content:start;gap:12px;padding:14px}.en-models-searchbar{position:relative;display:flex;align-items:center;gap:8px;margin:12px;padding:0 10px 0 38px;min-height:40px;border:1px solid var(--line);border-radius:12px;background:var(--input)}.en-models-search-icon{position:absolute;left:12px;width:16px;height:16px;color:var(--muted)}input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text)}button,select{border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--text);min-height:30px}.en-models-search-clear{width:24px;height:24px}.en-models-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:0 12px 12px;color:var(--muted);font-size:12px}.en-filter-pill{display:inline-flex;align-items:center;gap:6px;padding:0 10px;height:30px;border:1px solid var(--line);border-radius:999px;background:var(--card)}.en-filter-pill select{border:0;background:transparent}.en-models-list{list-style:none;margin:0;padding:6px;overflow:auto}.en-model-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border-radius:10px;cursor:pointer}.en-model-row:hover{background:#303030}.en-model-row.selected{background:var(--accent);color:#fff}.en-model-row-icon,.en-detail-icon{display:flex;align-items:center;justify-content:center;border-radius:10px;background:var(--card)}.en-model-row-icon{width:28px;height:28px}.en-model-row-main{min-width:0;display:grid;gap:2px}.en-model-row-name,.en-model-row-author{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.en-model-row-author,.en-model-row-stats,.en-detail-stats,.en-detail-title small,.en-download-info span,.en-detail-card header small,.en-readme-body pre,.en-models-empty{color:var(--muted)}.en-model-row-badges,.en-detail-badges,.en-download-action{display:flex;gap:6px;flex-wrap:wrap}.en-cap-badge,.en-meta-badge{display:inline-flex;align-items:center;padding:2px 7px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:11px}.cap-installed{color:#bfe7c5}.en-model-row-stats{display:grid;justify-items:end;font-size:11px}.en-detail-header{display:grid;grid-template-columns:40px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.en-detail-icon{width:40px;height:40px}.en-detail-title strong{font-size:18px;overflow-wrap:anywhere}.en-icon-btn{width:32px}.en-detail-stats,.en-detail-badges{padding:0 4px}.en-detail-card{border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden}.en-detail-card header,.en-download-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 16px}.en-detail-card header{border-bottom:1px solid var(--line);background:var(--card)}.en-download-info{min-width:0;display:grid;gap:4px}.en-download-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.en-download-action{justify-content:flex-end}.en-btn-primary{background:var(--accent);border-color:var(--accent);padding:0 14px}.en-btn-primary:disabled{opacity:.55}.en-btn-secondary{padding:0 12px}.en-btn-secondary.assigned{border-color:#4caf5c;color:#bfe7c5}.en-btn-danger{color:#ef5350;padding:0 12px}.en-btn-ghost{padding:0 12px}.en-model-progress{height:4px;background:var(--input)}.en-model-progress div{height:100%;background:var(--accent)}.en-download-card small{display:block;padding:8px 16px 12px}.en-readme-body{padding:16px}.en-readme-body pre{max-height:min(58vh,680px);min-height:260px;overflow:auto;margin:0;padding:14px;border:1px solid var(--line);border-radius:12px;background:#1d1d1d;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.55 Inter,system-ui,sans-serif}.en-detail-empty{height:100%;display:grid;place-items:center;color:var(--muted)}.en-icon{width:16px;height:16px}@keyframes spin{to{transform:rotate(360deg)}}.spinning{animation:spin .9s linear infinite}@media(max-width:920px){.en-models-view{grid-template-columns:1fr}.en-download-row{display:grid}.en-download-action{justify-content:flex-start}}
</style>

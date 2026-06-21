<template>
  <section class="en-models-view">
    <aside class="en-models-list-column">
      <div class="en-models-searchbar">
        <Search class="en-models-search-icon" />
        <input v-model.trim="query" type="text" placeholder="Search GGUF models" autocomplete="off" spellcheck="false" @keyup.enter="loadRemoteModels" />
        <button v-if="query" type="button" class="en-models-search-clear" aria-label="Clear search" @click="query = ''"><X class="en-icon" /></button>
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
          <div class="en-model-row-main">
            <strong class="en-model-row-name">{{ resolveModelName(model) }}</strong>
            <span class="en-model-row-author">{{ resolveModelAuthor(model) || getModelSource(model) }}</span>
            <div class="en-model-row-badges"><span v-for="cap in getModelCapabilities(model).slice(0, 3)" :key="cap" class="en-cap-badge">{{ cap }}</span><span v-if="isInstalled(model)" class="en-cap-badge cap-installed">Installed</span></div>
          </div>
          <div class="en-model-row-stats"><span v-if="model.likes != null">♡ {{ formatCompactCount(model.likes) }}</span><span v-if="model.downloads != null">↓ {{ formatCompactCount(model.downloads) }}</span><span v-if="getModelUpdatedDate(model)">{{ formatRelativeDate(getModelUpdatedDate(model)) }}</span></div>
        </li>
      </ul>
    </aside>

    <main class="en-models-detail-column">
      <template v-if="selectedModel">
        <header class="en-detail-header">
          <div class="en-detail-icon"><Box class="en-icon" /></div>
          <div class="en-detail-title"><strong>{{ detailTitle }}</strong></div>
          <button type="button" class="en-icon-btn" title="Copy model id" aria-label="Copy model id" @click="copyModelId"><Copy class="en-icon" /></button>
          <a class="en-icon-btn" :href="modelCardUrl" target="_blank" rel="noreferrer" title="Open model card" aria-label="Open model card"><ExternalLink class="en-icon" /></a>
        </header>

        <div class="en-detail-stats"><span v-if="selectedModel.downloads != null">↓ {{ formatCompactCount(selectedModel.downloads) }} downloads</span><span v-if="selectedModel.likes != null">☆ {{ formatCompactCount(selectedModel.likes) }} stars</span><span v-if="getModelUpdatedDate(selectedModel)">Updated {{ formatRelativeDate(getModelUpdatedDate(selectedModel)) }}</span></div>
        <div class="en-detail-badges"><span class="en-meta-badge">Format: {{ getModelFormat(selectedModel) }}</span><span v-if="getModelQuantization(selectedModel)" class="en-meta-badge">Quantization: {{ getModelQuantization(selectedModel) }}</span><span class="en-meta-badge">Runtime: {{ getModelRuntime(selectedModel) }}</span><span class="en-meta-badge">Source: {{ getModelSource(selectedModel) }}</span></div>

        <section class="en-detail-card en-download-card">
          <div class="en-download-row">
            <div class="en-download-info"><strong>{{ downloadOption.fileName }}</strong><span>{{ downloadOption.format }}{{ downloadOption.quantization ? ` · ${downloadOption.quantization}` : '' }} · {{ downloadOption.sizeLabel || 'unknown size' }}</span></div>
            <div class="en-model-actions">
              <button v-if="canDownload && !isDownloadingModel(selectedModel)" type="button" class="en-btn-primary" @click="download(selectedModel)"><Download class="en-icon" />Download</button>
              <button v-if="isDownloadingModel(selectedModel)" type="button" class="en-btn-secondary" @click="cancelDownload(selectedModel)">Cancel</button>
              <span v-if="!canDownload && !isDownloadingModel(selectedModel)" class="en-status-pill">Downloaded</span>
              <button v-if="selectedInstalledModel && selectedInstalledModel.provider !== 'local-ocr'" type="button" class="en-btn-danger" @click="remove(selectedInstalledModel)">Uninstall</button>
            </div>
          </div>
          <div class="en-role-grid" aria-label="Model roles">
            <button v-for="role in MODEL_ROLES" :key="role.id" type="button" class="en-role-button" :class="{ selected: isRoleSelected(role.id), unavailable: !canUseRole(role.id) }" :disabled="isDownloadingModel(selectedModel) || !canUseRole(role.id)" :title="roleTitle(role.id)" @click="toggleRole(role.id)">{{ role.label }}</button>
          </div>
          <div v-if="isDownloadingModel(selectedModel)" class="en-model-progress"><div :style="{ width: `${downloadPercent(selectedModel)}%` }" /></div>
          <small v-if="downloadMessageFor(selectedModel)">{{ downloadMessageFor(selectedModel) }}</small>
        </section>

        <section class="en-detail-card en-readme-card">
          <header><strong>README</strong><small>{{ readmeStatus }}</small></header>
          <div v-if="readmeLoading" class="en-readme-loading">Loading Hugging Face README…</div>
          <div v-else class="en-readme-body markdown-body" v-html="readmeHtml" />
        </section>
      </template>
      <div v-else class="en-detail-empty"><Box class="en-detail-empty-icon" /><p>Select a model from the library to see details</p></div>
    </main>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import DOMPurify from 'dompurify'
import log from 'electron-log/renderer'
import { Box, Copy, Download, ExternalLink, RefreshCw, Search, X } from '@lucide/vue'
import { elephantnoteClient } from '../../services/elephantnoteClient'
import { FORMAT_FILTERS, MODEL_ROLES, SORT_OPTIONS, SOURCE_FILTERS, USE_NONE, applyCatalogFilters, applyRoleChoice, downloadMessage, downloadProgress, formatBytes, formatCompactCount, formatRelativeDate, getDownloadOption, getModelCapabilities, getModelFormat, getModelQuantization, getModelRuntime, getModelSource, getModelUpdatedDate, isAssignedToRole, isDownloading, isLocalModel, isRemoteModel, normalizeSelection, resolveModelAuthor, resolveModelId, resolveModelName, sortByPopularity } from './modelsViewHelpers'

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
const selectedFileName = ref('')
const selectedFileSizeBytes = ref(0)
const activeDownloadModel = ref(null)
const readmeText = ref('')
const readmeMessage = ref('')
const readmeLoading = ref(false)
const hfInfoCache = new Map()
let stopDownloadProgress = null
let readmeRequestId = 0
let searchTimer = null
let downloadRunId = 0

const localModels = computed(() => Array.isArray(localData.value?.models) ? localData.value.models : [])
const remoteModels = computed(() => Array.isArray(remoteData.value?.models) ? remoteData.value.models : [])
const getModelKey = (model = {}) => String(model.repoId || model.id || model.modelId || model.path || model.modelPath || resolveModelName(model)).toLowerCase()
const firstGgufFile = (model = {}) => model.fileName || model.filename || (Array.isArray(model.siblings) ? model.siblings.find((s) => String(s.rfilename || '').toLowerCase().endsWith('.gguf'))?.rfilename : '') || ''
const getRepoId = (model = {}) => String(model.repoId || model.id || model.modelId || model.originalRepoId || '').trim()
const dedupeModels = (models = []) => Array.from(models.reduce((map, model) => {
  const key = getModelKey(model)
  if (!key) return map
  const previous = map.get(key)
  if (!previous || isLocalModel(model) || Number(model.downloads || 0) > Number(previous.downloads || 0)) map.set(key, model)
  return map
}, new Map()).values())
const allModels = computed(() => sortByPopularity(dedupeModels([...localModels.value, ...remoteModels.value])))
const visibleModels = computed(() => dedupeModels(applyCatalogFilters({ models: allModels.value, query: query.value, format: formatFilter.value, source: sourceFilter.value, sort: sortOption.value })))
const emptyMessage = computed(() => query.value ? `No models found for "${query.value}".` : 'No models returned by the model library yet.')
const selectedInstalledModel = computed(() => findInstalledMatch(selectedModel.value))
const roleTargetModel = computed(() => selectedInstalledModel.value || selectedModel.value)
const downloadOption = computed(() => {
  const base = getDownloadOption(selectedInstalledModel.value || selectedModel.value || {})
  const sizeLabel = selectedFileSizeBytes.value > 0 ? formatBytes(selectedFileSizeBytes.value) : base.sizeLabel
  return { ...base, fileName: selectedFileName.value || base.fileName, sizeLabel }
})
const canDownload = computed(() => selectedModel.value && isRemoteModel(selectedModel.value) && !selectedInstalledModel.value)
const detailTitle = computed(() => {
  const repoId = getRepoId(selectedModel.value || {})
  if (repoId.includes('/')) return repoId
  const author = resolveModelAuthor(selectedModel.value || {})
  return author ? `${author}/${resolveModelName(selectedModel.value || {})}` : resolveModelName(selectedModel.value || {})
})
const modelCardUrl = computed(() => {
  const id = getRepoId(selectedModel.value || {}) || resolveModelId(selectedModel.value || {})
  return id.includes('/') ? `https://huggingface.co/${id}` : `https://huggingface.co/models?search=${encodeURIComponent(id)}`
})
const readmeStatus = computed(() => readmeLoading.value ? 'Loading' : readmeText.value ? 'Hugging Face' : 'Unavailable')

const sortForBackend = () => sortOption.value === 'likes' ? 'likes' : sortOption.value === 'updated' ? 'lastModified' : 'downloads'
const isSelected = (model) => getModelKey(model) === getModelKey(selectedModel.value || {})
const isInstalled = (model) => Boolean(findInstalledMatch(model))
const isDownloadingModel = (model) => isDownloading(model, downloads.value)
const downloadPercent = (model) => downloadProgress(model, downloads.value)
const downloadMessageFor = (model) => downloadMessage(model, downloads.value)
const isRoleSelected = (role) => Boolean(roleTargetModel.value && isAssignedToRole(roleTargetModel.value, role, modelSelection.value))
const selectedCapabilities = computed(() => new Set(getModelCapabilities(roleTargetModel.value || selectedModel.value || {}).map((capability) => String(capability).toLowerCase())))
const isGgufChatModel = (model = roleTargetModel.value || selectedModel.value || {}) => getModelFormat(model).toLowerCase() === 'gguf' || Boolean(firstGgufFile(model)) || /gguf|\.gguf$/i.test([model.repoId, model.id, model.name, model.fileName, model.filename].filter(Boolean).join(' '))
const canUseRole = (role = '') => role === 'chat' ? (selectedCapabilities.value.has('chat') || isGgufChatModel()) : selectedCapabilities.value.has(role)
const roleTitle = (role = '') => canUseRole(role) ? '' : `This model is not compatible with the ${role} role.`

const findInstalledMatch = (model = {}) => {
  if (!model) return null
  const lookup = [model.repoId, model.originalRepoId, model.id, model.modelId, model.fileName, model.filename, firstGgufFile(model)].filter(Boolean).map(String)
  return localModels.value.find((item) => {
    const values = new Set([item.repoId, item.originalRepoId, item.id, item.modelId, item.name, item.fileName, item.filename, item.path, item.modelPath].filter(Boolean).map(String))
    return lookup.some((value) => values.has(value))
  }) || null
}

const loadLocalModels = async() => {
  localData.value = await (elephantnoteClient.models.listLocal?.() || elephantnoteClient.models.list())
  const selection = await elephantnoteClient.models.getSelection?.().catch(() => null)
  if (selection) modelSelection.value = normalizeSelection(selection)
}
const loadRemoteModels = async() => {
  const searchQuery = query.value ? `${query.value} gguf` : 'gguf'
  remoteData.value = await elephantnoteClient.models.searchHuggingFace({ query: searchQuery, limit: 48, sort: sortForBackend(), direction: -1, libraryName: 'gguf' })
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
  const repoId = getRepoId(model)
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
  if (!model?.path && !model?.modelPath) return
  try {
    const info = await elephantnoteClient.models.info({ modelRef: model.path || model.modelPath })
    if (selectedModel.value && getModelKey(selectedModel.value) === getModelKey(model)) selectedModel.value = { ...selectedModel.value, ...info }
  } catch (error) {
    log.warn('[models] local info failed', error)
  }
}
const resetSelectedFileInfo = (model = {}) => {
  selectedFileName.value = firstGgufFile(model) || model.fileName || model.filename || ''
  selectedFileSizeBytes.value = Number(model.sizeBytes || model.size || model.lfs?.size || 0) || 0
}
const selectModel = (model) => {
  selectedModel.value = model
  resetSelectedFileInfo(model)
  loadSelectedInfo(model)
  loadSelectedRemoteFileInfo(model)
  loadReadme(model)
}

const fetchHuggingFaceInfo = async(repoId = '') => {
  const normalizedRepoId = String(repoId || '').trim()
  if (!normalizedRepoId || !normalizedRepoId.includes('/')) return null
  if (hfInfoCache.has(normalizedRepoId)) return hfInfoCache.get(normalizedRepoId)
  const response = await fetch(`https://huggingface.co/api/models/${normalizedRepoId}?blobs=true`, { headers: { accept: 'application/json' } })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error || `Hugging Face info returned HTTP ${response.status}.`)
  hfInfoCache.set(normalizedRepoId, data)
  return data
}
const getSiblingName = (item = {}) => String(item.rfilename || item.path || item.name || '').trim()
const getSiblingSizeBytes = (item = {}) => Number(item.sizeBytes || item.size || item.lfs?.size || item.blob?.size || 0) || 0
const pickGgufFileInfo = (info = {}) => {
  const siblings = Array.isArray(info?.siblings) ? info.siblings : []
  const ggufFiles = siblings.map((item) => ({ name: getSiblingName(item), sizeBytes: getSiblingSizeBytes(item) })).filter((item) => item.name.toLowerCase().endsWith('.gguf'))
  return ggufFiles.find((item) => /q4_k_m/i.test(item.name)) || ggufFiles.find((item) => /q4/i.test(item.name)) || ggufFiles[0] || { name: '', sizeBytes: 0 }
}
const loadSelectedRemoteFileInfo = async(model = {}) => {
  const repoId = getRepoId(model)
  if (!repoId.includes('/') || firstGgufFile(model)) return
  try {
    const file = pickGgufFileInfo(await fetchHuggingFaceInfo(repoId))
    if (!file.name) return
    if (selectedModel.value && getModelKey(selectedModel.value) === getModelKey(model)) {
      selectedFileName.value = file.name
      selectedFileSizeBytes.value = file.sizeBytes
      selectedModel.value = { ...selectedModel.value, fileName: file.name, filename: file.name, sizeBytes: file.sizeBytes || selectedModel.value.sizeBytes }
    }
  } catch (error) {
    log.warn('[models] remote file info failed', error)
  }
}
const resolveGgufFileInfo = async(model = {}) => {
  const existing = firstGgufFile(model)
  if (existing) return { name: existing, sizeBytes: Number(model.sizeBytes || model.size || selectedFileSizeBytes.value || 0) || 0 }
  const repoId = getRepoId(model)
  if (!repoId.includes('/')) return { name: '', sizeBytes: 0 }
  return pickGgufFileInfo(await fetchHuggingFaceInfo(repoId))
}

const setDownloadState = (model, state) => {
  const keys = [resolveModelId(model), model?.id, model?.repoId, model?.originalRepoId, state?.id, state?.modelId, state?.downloadId].filter(Boolean).map(String)
  const next = new Map(downloads.value)
  keys.forEach((key) => next.set(key, { ...(next.get(key) || {}), ...state }))
  downloads.value = next
}
const clearDownloadState = (model = {}) => {
  const keys = [resolveModelId(model), model.id, model.repoId, model.originalRepoId, selectedFileName.value].filter(Boolean).map(String)
  const next = new Map(downloads.value)
  keys.forEach((key) => next.delete(key))
  downloads.value = next
}
const buildDownloadPayload = async(model = {}) => {
  const repoId = getRepoId(model)
  const file = await resolveGgufFileInfo(model)
  if (repoId.includes('/')) {
    if (!file.name) throw new Error(`No GGUF file found in ${repoId}.`)
    return { id: file.name, name: file.name, provider: 'node-llama-cpp', source: 'remote', uri: `hf:${repoId}/${file.name}`, fileName: file.name, filename: file.name, sizeBytes: file.sizeBytes, originalRepoId: repoId }
  }
  return { ...model, id: resolveModelId(model), repoId: model.repoId || model.id, provider: model.provider || 'node-llama-cpp', source: model.source || 'local', fileName: file.name || firstGgufFile(model) }
}
const download = async(model) => {
  if (!model) return null
  const runId = ++downloadRunId
  activeDownloadModel.value = model
  setDownloadState(model, { percent: 1, message: 'Resolving GGUF file…' })
  try {
    const payload = await buildDownloadPayload(model)
    if (runId !== downloadRunId) return null
    selectedFileName.value = payload.fileName || selectedFileName.value
    selectedFileSizeBytes.value = Number(payload.sizeBytes || selectedFileSizeBytes.value || 0) || 0
    setDownloadState(model, { id: payload.id, modelId: payload.id, downloadId: payload.id, percent: 2, message: 'Starting download…' })
    const result = await elephantnoteClient.models.download(payload)
    if (runId !== downloadRunId) return result
    setDownloadState(model, { percent: 100, message: result?.message || 'Download complete.', downloadId: result?.downloadId || payload.id })
    await loadLocalModels()
    activeDownloadModel.value = null
    return result
  } catch (error) {
    if (runId === downloadRunId) setDownloadState(model, { percent: 0, message: error instanceof Error ? error.message : 'Download failed.' })
    activeDownloadModel.value = null
    return null
  }
}
const cancelDownload = async(model) => {
  downloadRunId += 1
  const id = selectedFileName.value || resolveModelId(model)
  await elephantnoteClient.models.cancelDownload?.({ id, modelId: id, downloadId: id }).catch((error) => log.warn('[models] cancelDownload failed', error))
  clearDownloadState(model)
  activeDownloadModel.value = null
}
const clearRole = async(role) => {
  const next = { ...modelSelection.value, [role]: '' }
  modelSelection.value = next
  await elephantnoteClient.models.setSelection?.(next).catch((error) => log.error('[models] clear role failed', error))
}
const toggleRole = async(role) => {
  if (!selectedModel.value || !canUseRole(role)) return
  if (isRoleSelected(role)) return clearRole(role)
  let target = selectedInstalledModel.value || selectedModel.value
  if (!selectedInstalledModel.value && isRemoteModel(selectedModel.value)) {
    await download(selectedModel.value)
    target = findInstalledMatch(selectedModel.value) || selectedModel.value
  }
  const next = applyRoleChoice(modelSelection.value, role, target, role)
  modelSelection.value = next
  await elephantnoteClient.models.setSelection?.(next).catch((error) => log.error('[models] setSelection failed', error))
}
const remove = async(model) => {
  if (!model) return
  await elephantnoteClient.models.remove({ modelRef: model.path || model.modelPath || resolveModelId(model) })
  const next = applyRoleChoice(modelSelection.value, '', model, USE_NONE)
  modelSelection.value = next
  await elephantnoteClient.models.setSelection?.(next)
  await loadLocalModels()
}

const copyText = async(text = '') => {
  const value = String(text || '').trim()
  if (!value) return false
  if (navigator?.clipboard?.writeText) {
    await navigator.clipboard.writeText(value)
    return true
  }
  const bridgeWrite = globalThis.window?.elephantnote?.clipboard?.writeText
  if (typeof bridgeWrite === 'function') {
    await bridgeWrite(value)
    return true
  }
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  document.body.removeChild(textarea)
  return true
}
const copyModelId = async() => {
  try {
    await copyText(getRepoId(selectedModel.value || {}) || resolveModelId(selectedModel.value))
  } catch (error) {
    log.error('[models] copy model id failed', error)
  }
}

const escapeHtml = (value = '') => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char])
const isHtmlLine = (line = '') => /^\s*<\/?[a-zA-Z][\s\S]*>\s*$/.test(line)
const splitTableRow = (line = '') => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
const isTableSeparator = (line = '') => line.includes('|') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
const inlineMarkdown = (value = '') => escapeHtml(value)
  .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, '<img alt="$1" src="$2" />')
  .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
const renderTable = (rows = []) => {
  if (rows.length < 2) return ''
  const head = splitTableRow(rows[0])
  const body = rows.slice(2).map(splitTableRow)
  return `<table><thead><tr>${head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join('')}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
}
const renderBasicMarkdown = (markdown = '') => {
  const lines = String(markdown || '').split(/\r?\n/)
  const html = []
  let inList = false
  let inCode = false
  let code = []
  const closeList = () => { if (inList) { html.push('</ul>'); inList = false } }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (/^```/.test(line)) {
      if (inCode) { html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`); code = []; inCode = false } else { closeList(); inCode = true }
      continue
    }
    if (inCode) { code.push(line); continue }
    if (!line.trim()) { closeList(); continue }
    if (line.includes('|') && isTableSeparator(lines[i + 1] || '')) {
      closeList()
      const rows = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) { rows.push(lines[i]); i += 1 }
      i -= 1
      html.push(renderTable(rows))
      continue
    }
    if (isHtmlLine(line)) { closeList(); html.push(line); continue }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) { closeList(); const level = heading[1].length; html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`); continue }
    const bullet = line.match(/^[-*]\s+(.+)$/)
    if (bullet) { if (!inList) { html.push('<ul>'); inList = true } html.push(`<li>${inlineMarkdown(bullet[1])}</li>`); continue }
    closeList()
    html.push(`<p>${inlineMarkdown(line)}</p>`)
  }
  closeList()
  if (inCode) html.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
  return html.join('\n')
}
const getAppMarkdownRenderer = () => [globalThis.window?.elephantnote?.markdown?.render, globalThis.window?.elephantnote?.markdown?.renderToHtml, globalThis.window?.elephantnote?.editor?.markdown?.render, globalThis.window?.elephantnote?.preview?.renderMarkdown].find((renderer) => typeof renderer === 'function')
const renderMarkdown = (markdown = '') => {
  const renderer = getAppMarkdownRenderer()
  if (renderer) {
    const result = renderer(markdown)
    if (typeof result === 'string') return result
    if (typeof result?.html === 'string') return result.html
  }
  return renderBasicMarkdown(markdown)
}
const readmeHtml = computed(() => DOMPurify.sanitize(renderMarkdown(readmeText.value || readmeMessage.value || ''), { ADD_ATTR: ['target', 'rel', 'style'] }))

watch([query, sortOption], () => {
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => loadRemoteModels().catch((error) => log.error('[models] remote search failed', error)), 350)
})
watch(visibleModels, (models) => {
  if (!selectedModel.value && models.length) selectModel(models[0])
  else if (selectedModel.value && !models.some((model) => isSelected(model))) selectModel(models[0] || null)
})
onMounted(() => {
  stopDownloadProgress = elephantnoteClient.models.onDownloadProgress?.((progress) => {
    const target = activeDownloadModel.value || { id: progress.modelId || progress.id }
    setDownloadState(target, { percent: Number(progress.percent || 0), message: progress.message || progress.phase || 'Downloading…', ...progress })
  }) || null
  refreshAll()
})
onBeforeUnmount(() => {
  window.clearTimeout(searchTimer)
  stopDownloadProgress?.()
  downloads.value = new Map()
})
</script>

<style scoped>
.en-models-view{--bg:var(--en-bg);--surface:var(--en-surface);--card:var(--en-soft);--input:color-mix(in srgb,var(--en-soft) 78%,var(--en-bg));--line:var(--en-border);--strong:var(--en-border-strong,var(--en-border));--text:var(--en-text);--muted:var(--en-muted);--accent:var(--en-primary);--success:#4caf5c;--success-text:#2f9f48;--danger:#ef5350;display:grid;grid-template-columns:minmax(300px,30fr) minmax(0,70fr);gap:0;width:100%;height:100%;min-height:0;flex:1;padding:0;background:var(--bg);color:var(--text);font:14px Inter,system-ui,sans-serif;overflow:hidden}.en-models-list-column,.en-models-detail-column{min-height:0;background:var(--bg)}.en-models-list-column{display:grid;grid-template-rows:auto auto minmax(0,1fr);overflow:hidden;border-right:1px solid color-mix(in srgb,var(--line) 72%,transparent);background:var(--surface)}.en-models-detail-column{display:grid;grid-template-rows:auto auto auto auto minmax(0,1fr);align-content:stretch;gap:10px;overflow:auto;padding:14px 22px 18px 18px}.en-models-searchbar{position:relative;display:flex;align-items:center;gap:8px;margin:12px;padding:0 44px 0 38px;min-height:40px;border:1px solid var(--line);border-radius:12px;background:var(--input)}.en-models-search-icon{position:absolute;left:12px;width:16px;height:16px;color:var(--muted)}input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--text)}input::-webkit-search-cancel-button{display:none}.en-models-search-clear{position:absolute;right:8px;width:28px;height:28px;padding:0;border:0;border-radius:8px;background:transparent;color:var(--muted);display:inline-flex;align-items:center;justify-content:center}.en-models-search-clear:hover{background:var(--card);color:var(--text)}button,select{border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--text);min-height:30px}.en-models-filters{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:0 12px 12px;color:var(--muted);font-size:12px}.en-filter-pill{display:inline-flex;align-items:center;gap:6px;padding:0 10px;height:30px;border:1px solid var(--line);border-radius:999px;background:var(--card)}.en-filter-pill select{border:0;background:transparent}.en-models-list{list-style:none;margin:0;padding:6px 8px 10px;overflow:auto}.en-model-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border-radius:10px;cursor:pointer}.en-model-row:hover{background:var(--card)}.en-model-row.selected{background:var(--accent);color:#fff}.en-model-row-icon,.en-detail-icon{display:flex;align-items:center;justify-content:center;border-radius:10px;background:var(--card)}.en-model-row-icon{width:28px;height:28px}.en-model-row-main{min-width:0;display:grid;gap:2px}.en-model-row-name,.en-model-row-author{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.en-model-row-author,.en-model-row-stats,.en-detail-stats,.en-download-info span,.en-readme-loading,.en-models-empty{color:var(--muted)}.en-model-row-badges,.en-detail-badges,.en-model-actions,.en-role-grid{display:flex;gap:6px;flex-wrap:wrap}.en-cap-badge,.en-meta-badge,.en-status-pill{display:inline-flex;align-items:center;padding:2px 7px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:11px}.en-status-pill{height:30px;padding:0 12px;color:var(--success-text);border-color:var(--success)}.cap-installed{color:var(--success-text)}.en-model-row-stats{display:grid;justify-items:end;font-size:11px}.en-detail-header{display:grid;grid-template-columns:40px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:16px;border:1px solid var(--line);border-radius:14px;background:var(--surface)}.en-detail-icon{width:40px;height:40px}.en-detail-title strong{font-size:18px;overflow-wrap:anywhere}.en-icon-btn{width:32px;min-height:30px;border:1px solid var(--line);border-radius:9px;background:var(--card);color:var(--text);display:inline-flex;align-items:center;justify-content:center}.en-detail-stats,.en-detail-badges{padding:0 4px}.en-detail-card{border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden}.en-download-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px 10px}.en-download-info{min-width:0;display:grid;gap:4px}.en-download-info strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.en-model-actions{justify-content:flex-end;align-items:center}.en-btn-primary{background:var(--accent);border-color:var(--accent);color:#fff;padding:0 14px}.en-btn-secondary{padding:0 12px}.en-btn-danger{color:var(--danger);padding:0 12px}.en-role-grid{justify-content:flex-end;padding:0 16px 14px}.en-role-button{min-width:112px;padding:0 16px;border-color:var(--strong);font-weight:600}.en-role-button.selected{border-color:var(--success);color:var(--success-text);background:color-mix(in srgb,var(--success) 12%,var(--surface))}.en-role-button.unavailable,.en-role-button:disabled{cursor:not-allowed;opacity:.45;border-color:var(--line);color:var(--muted);background:color-mix(in srgb,var(--card) 62%,var(--bg))}.en-model-progress{height:4px;background:var(--input)}.en-model-progress div{height:100%;background:var(--accent)}.en-download-card small{display:block;padding:8px 16px 12px}.en-readme-card{min-height:0;display:flex;flex-direction:column}.en-readme-card header{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--card)}.en-readme-card header small{color:var(--muted)}.en-readme-loading{padding:16px}.en-readme-body{user-select:text;flex:1;min-height:0;overflow:auto;margin:16px;padding:18px;border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--surface) 72%,var(--bg));color:color-mix(in srgb,var(--text) 78%,var(--muted));line-height:1.65}.en-readme-body :deep(h1),.en-readme-body :deep(h2),.en-readme-body :deep(h3){color:var(--text);margin:1.1em 0 .45em}.en-readme-body :deep(p){margin:.65em 0}.en-readme-body :deep(a){color:var(--accent)}.en-readme-body :deep(code){border-radius:4px;background:var(--card);padding:.1em .35em}.en-readme-body :deep(pre){overflow:auto;border-radius:8px;background:color-mix(in srgb,var(--bg) 82%,var(--surface));padding:12px}.en-readme-body :deep(ul){padding-left:1.5em}.en-readme-body :deep(img){max-width:100%;height:auto}.en-readme-body :deep(table){width:100%;border-collapse:collapse;margin:1em 0;display:block;overflow:auto}.en-readme-body :deep(th),.en-readme-body :deep(td){border:1px solid var(--line);padding:6px 8px;vertical-align:top}.en-readme-body :deep(th){color:var(--text);background:var(--card)}.en-detail-empty{height:100%;display:grid;place-items:center;color:var(--muted)}.en-icon{width:16px;height:16px}@keyframes spin{to{transform:rotate(360deg)}}.spinning{animation:spin .9s linear infinite}@media(max-width:920px){.en-models-view{grid-template-columns:1fr}.en-models-list-column{border-right:0;border-bottom:1px solid color-mix(in srgb,var(--line) 72%,transparent)}.en-models-detail-column{padding:12px}.en-download-row{display:grid}.en-model-actions,.en-role-grid{justify-content:flex-start}}
</style>

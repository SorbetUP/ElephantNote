import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { NodeLlamaCppRuntime } from './runtime/nodeLlamaCppRuntime.js'
import log from 'electron-log'

const DEFAULT_HF_API_BASE_URL = 'https://huggingface.co'
const DEFAULT_INDEX_FILE_NAME = 'model-index.json'
const DEFAULT_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000

const nowIso = () => new Date().toISOString()
const createDownloadId = () => `download-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`

const readJsonFile = async(filePath) => {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}

const writeJsonFile = async(filePath, data) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  return filePath
}

const normalizePathLike = (value = '') => String(value || '').trim()

const mapHfModelInfo = (data = {}) => ({
  id: String(data.id || '').trim(),
  name: String(data.id || data.modelId || '').trim(),
  provider: 'huggingface',
  repoId: String(data.id || '').trim(),
  modelId: String(data.id || '').trim(),
  pipelineTag: data.pipeline_tag || '',
  libraryName: data.library_name || '',
  tags: Array.isArray(data.tags) ? data.tags : [],
  likes: Number(data.likes || 0),
  downloads: Number(data.downloads || 0),
  sha: data.sha || '',
  private: Boolean(data.private),
  gated: Boolean(data.gated),
  disabled: Boolean(data.disabled),
  author: data.author || '',
  createdAt: data.createdAt || data.created_at || '',
  updatedAt: data.lastModified || data.last_modified || '',
  cardData: data.cardData || data.card_data || null,
  siblings: Array.isArray(data.siblings)
    ? data.siblings.map((item) => ({
      rfilename: item.rfilename || '',
      size: Number(item.size || 0),
      blobId: item.blobId || '',
      lfs: item.lfs || null
    }))
    : []
})

const pickModelFilename = (info = {}, model = {}) => {
  const explicit = String(model.fileName || model.filename || model.modelPath || '').trim()
  if (explicit) return explicit

  const siblingMatch = (info.siblings || []).find((item) => /\.gguf$/i.test(item.rfilename))
  if (siblingMatch?.rfilename) return siblingMatch.rfilename

  const name = String(model.name || model.id || info.id || '').trim()
  if (/\.gguf$/i.test(name)) return name

  return ''
}

const safeLookup = (value = '') => String(value || '').trim()

export class ModelLibrary {
  constructor({
    nodeRuntime = new NodeLlamaCppRuntime(),
    fetchImpl = globalThis.fetch,
    hfApiBaseUrl = DEFAULT_HF_API_BASE_URL,
    manifestSuffix = '.model.json',
    indexFileName = DEFAULT_INDEX_FILE_NAME,
    searchCacheTtlMs = DEFAULT_SEARCH_CACHE_TTL_MS
  } = {}) {
    this.nodeRuntime = nodeRuntime
    this.fetch = fetchImpl
    this.hfApiBaseUrl = hfApiBaseUrl.replace(/\/+$/, '')
    this.manifestSuffix = manifestSuffix
    this.indexFileName = indexFileName
    this.searchCacheTtlMs = searchCacheTtlMs
    this.activeModelPath = ''
    this.activeModels = new Map()
    this.activeDownloads = new Map()
    this.indexCache = null
  }

  get modelDir() {
    return this.nodeRuntime.modelDir || path.join(os.homedir(), '.elephantnote', 'models', 'node-llama-cpp')
  }

  get indexPath() {
    return path.join(this.modelDir, this.indexFileName)
  }

  async getRuntimeStatus() {
    if (typeof this.nodeRuntime.status === 'function') {
      return this.nodeRuntime.status().catch(() => null)
    }
    return null
  }

  getManifestPath(modelPath = '') {
    const normalized = normalizePathLike(modelPath)
    return normalized ? `${normalized}${this.manifestSuffix}` : ''
  }

  async readManifest(modelPath = '') {
    const manifestPath = this.getManifestPath(modelPath)
    if (!manifestPath) return null
    return readJsonFile(manifestPath)
  }

  async writeManifest(modelPath = '', manifest = {}) {
    const manifestPath = this.getManifestPath(modelPath)
    if (!manifestPath) throw new Error('Model path is required to write a manifest.')
    const nextManifest = {
      modelPath,
      updatedAt: nowIso(),
      ...manifest
    }
    await writeJsonFile(manifestPath, nextManifest)
    return nextManifest
  }

  async removeManifest(modelPath = '') {
    const manifestPath = this.getManifestPath(modelPath)
    if (!manifestPath) return false
    await fs.rm(manifestPath, { force: true }).catch(() => {})
    return true
  }

  async readIndex() {
    if (this.indexCache) return this.indexCache
    const raw = await readJsonFile(this.indexPath)
    if (raw && typeof raw === 'object') {
      this.indexCache = {
        version: 1,
        updatedAt: raw.updatedAt || '',
        models: Array.isArray(raw.models) ? raw.models : [],
        hfSearchCache: raw.hfSearchCache && typeof raw.hfSearchCache === 'object' ? raw.hfSearchCache : {},
        runtime: raw.runtime || null
      }
      return this.indexCache
    }
    this.indexCache = {
      version: 1,
      updatedAt: '',
      models: [],
      hfSearchCache: {},
      runtime: null
    }
    return this.indexCache
  }

  async writeIndex(index = {}) {
    this.indexCache = {
      version: 1,
      updatedAt: nowIso(),
      models: Array.isArray(index.models) ? index.models : [],
      hfSearchCache: index.hfSearchCache && typeof index.hfSearchCache === 'object' ? index.hfSearchCache : {},
      runtime: index.runtime || null
    }
    await writeJsonFile(this.indexPath, this.indexCache)
    return this.indexCache
  }

  async buildLocalIndex() {
    log.info('[model] buildLocalIndex:start', { modelDir: this.modelDir })
    const runtime = await this.getRuntimeStatus() || {
      provider: 'node-llama-cpp',
      available: false,
      modelDir: this.modelDir,
      models: [],
      message: 'node-llama-cpp is not available.'
    }
    const models = typeof this.nodeRuntime.listModels === 'function'
      ? await this.nodeRuntime.listModels()
      : (Array.isArray(runtime.models) ? runtime.models : [])
    const enrichedModels = (await Promise.all(models.map(async(model) => {
      const modelPath = model.path || (
        model.fileName || model.filename || model.id || model.name
          ? path.join(this.modelDir, model.fileName || model.filename || model.id || model.name)
          : ''
      )
      if (!modelPath) return null
      const manifest = await this.readManifest(modelPath)
      const stat = await fs.stat(modelPath).catch(() => null)
      return {
        ...model,
        path: modelPath,
        modelPath,
        provider: model.provider || 'node-llama-cpp',
        source: manifest?.source || 'local',
        repoId: manifest?.repoId || '',
        filename: manifest?.filename || path.basename(modelPath),
        fileName: manifest?.fileName || path.basename(modelPath),
        sizeBytes: stat?.size || 0,
        modifiedAt: stat?.mtime?.toISOString?.() || '',
        installedAt: manifest?.installedAt || '',
        downloadedAt: manifest?.downloadedAt || manifest?.installedAt || '',
        active: this.activeModelPath === modelPath || this.activeModels.has(modelPath),
        manifest
      }
    }))).filter(Boolean)
    const index = await this.writeIndex({
      runtime,
      models: enrichedModels,
      hfSearchCache: (await this.readIndex()).hfSearchCache || {}
    })
    log.info('[model] buildLocalIndex:done', {
      modelDir: this.modelDir,
      models: enrichedModels.length
    })
    return {
      ...index,
      runtime,
      models: enrichedModels
    }
  }

  async syncLocalIndex({ force = false } = {}) {
    log.info('[model] syncLocalIndex', { force, modelDir: this.modelDir })
    if (force) {
      return this.buildLocalIndex()
    }
    const index = await this.readIndex()
    if (!Array.isArray(index.models) || !index.models.length) {
      return this.buildLocalIndex()
    }
    const existing = []
    for (const entry of index.models) {
      if (!entry?.path) continue
      const stat = await fs.stat(entry.path).catch(() => null)
      if (!stat) continue
      const manifest = await this.readManifest(entry.path)
      existing.push({
        ...entry,
        provider: 'node-llama-cpp',
        source: manifest?.source || entry.source || 'local',
        repoId: manifest?.repoId || entry.repoId || '',
        filename: manifest?.filename || entry.filename || path.basename(entry.path),
        fileName: manifest?.fileName || entry.fileName || path.basename(entry.path),
        sizeBytes: stat.size || entry.sizeBytes || 0,
        modifiedAt: stat.mtime?.toISOString?.() || entry.modifiedAt || '',
        installedAt: manifest?.installedAt || entry.installedAt || '',
        downloadedAt: manifest?.downloadedAt || manifest?.installedAt || entry.downloadedAt || entry.installedAt || '',
        active: this.activeModelPath === entry.path || this.activeModels.has(entry.path),
        manifest
      })
    }
    if (existing.length !== index.models.length) {
      return this.writeIndex({ ...index, models: existing })
    }
    return {
      ...index,
      models: existing,
      runtime: index.runtime || await this.getRuntimeStatus()
    }
  }

  async updateIndexEntry(modelPath, updater) {
    const index = await this.readIndex()
    const models = [...(index.models || [])]
    const nextModels = typeof updater === 'function'
      ? updater(models)
      : models
    return this.writeIndex({
      ...index,
      models: nextModels
    })
  }

  async removeIndexEntry(modelPath = '') {
    const normalized = normalizePathLike(modelPath)
    if (!normalized) return this.readIndex()
    const index = await this.readIndex()
    return this.writeIndex({
      ...index,
      models: (index.models || []).filter((entry) => entry?.path !== normalized)
    })
  }

  async listLocalModels() {
    const runtime = await this.getRuntimeStatus() || {
      provider: 'node-llama-cpp',
      available: false,
      modelDir: this.modelDir,
      models: [],
      message: 'node-llama-cpp is not available.'
    }
    const index = await this.syncLocalIndex()
    const models = [...(index.models || [])].sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
    return {
      provider: 'node-llama-cpp',
      available: Boolean(runtime.available),
      modelDir: this.modelDir,
      gpuTypes: runtime.gpuTypes || [],
      supportedBackends: runtime.supportedBackends || [],
      selectedBackend: runtime.selectedBackend || 'cpu',
      preferredBackends: runtime.preferredBackends || [],
      version: runtime.version || '',
      models,
      indexUpdatedAt: index.updatedAt || '',
      runtime,
      message: runtime.message || `${models.length} node-llama-cpp model${models.length === 1 ? '' : 's'} discovered.`
    }
  }

  async listModels({ source = 'local' } = {}) {
    if (source === 'huggingface' || source === 'remote') {
      return this.searchHuggingFaceModels({ query: '', limit: 20 })
    }
    return this.listLocalModels()
  }

  async searchHuggingFaceModels({
    query = '',
    limit = 20,
    sort = 'downloads',
    direction = -1,
    pipelineTag = '',
    libraryName = '',
    author = ''
  } = {}) {
    if (typeof this.fetch !== 'function') {
      throw new Error('fetch is required to search Hugging Face models.')
    }

    const params = new URLSearchParams()
    if (query) params.set('search', query)
    if (limit) params.set('limit', String(limit))
    if (sort) params.set('sort', sort)
    if (direction != null) params.set('direction', String(direction))
    if (pipelineTag) params.set('pipeline_tag', pipelineTag)
    if (libraryName) params.set('library', libraryName)
    if (author) params.set('author', author)

    const url = `${this.hfApiBaseUrl}/api/models?${params.toString()}`
    const cacheKey = JSON.stringify({ query, limit, sort, direction, pipelineTag, libraryName, author })
    const index = await this.readIndex()
    const cached = index.hfSearchCache?.[cacheKey]
    if (cached && cached.updatedAt && (Date.now() - Date.parse(cached.updatedAt)) < this.searchCacheTtlMs) {
      return {
        provider: 'huggingface',
        source: 'huggingface',
        query,
        limit,
        total: Array.isArray(cached.models) ? cached.models.length : 0,
        models: Array.isArray(cached.models) ? cached.models : [],
        cached: true,
        cacheKey,
        message: cached.message || `Found ${Array.isArray(cached.models) ? cached.models.length : 0} models.`
      }
    }

    const response = await this.fetch(url, {
      headers: { accept: 'application/json' }
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : []
    if (!response.ok) {
      const message = data?.error || `Hugging Face search returned HTTP ${response.status}.`
      throw new Error(message)
    }
    const models = Array.isArray(data) ? data.map(mapHfModelInfo) : []
    const message = query ? `Found ${models.length} models for "${query}".` : `Found ${models.length} models.`
    await this.writeIndex({
      ...index,
      hfSearchCache: {
        ...(index.hfSearchCache || {}),
        [cacheKey]: {
          updatedAt: nowIso(),
          message,
          models
        }
      }
    }).catch(() => {})
    return {
      provider: 'huggingface',
      source: 'huggingface',
      query,
      limit,
      total: models.length,
      models,
      cached: false,
      cacheKey,
      message
    }
  }

  async getHuggingFaceModelInfo(repoId = '') {
    if (!repoId) throw new Error('Hugging Face repo id is required.')
    if (typeof this.fetch !== 'function') {
      throw new Error('fetch is required to query Hugging Face models.')
    }

    const response = await this.fetch(`${this.hfApiBaseUrl}/api/models/${encodeURIComponent(repoId)}`, {
      headers: { accept: 'application/json' }
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : {}
    if (!response.ok) {
      const message = data?.error || `Hugging Face info returned HTTP ${response.status}.`
      throw new Error(message)
    }
    return mapHfModelInfo(data)
  }

  async downloadModel(model = {}, options = {}) {
    if (!model?.id && !model?.repoId && !model?.uri && !model?.model && !model?.pull) {
      throw new Error('Model id, repoId, uri, or pull is required.')
    }

    const downloadId = options.downloadId || model.downloadId || createDownloadId()
    const signal = options.signal || model.signal || null
    const controller = !signal ? new AbortController() : null
    const effectiveSignal = signal || controller?.signal
    const progressCallback = typeof options.onProgress === 'function' ? options.onProgress : null
    const emitProgress = (payload = {}) => {
      const nextProgress = {
        downloadId,
        id: model.id || model.repoId || model.uri || model.pull || '',
        modelId: model.id || model.repoId || model.uri || model.pull || '',
        ...payload
      }
      progressCallback?.(nextProgress)
      return nextProgress
    }

    const activeDownload = {
      id: downloadId,
      model,
      controller,
      signal: effectiveSignal,
      startedAt: nowIso()
    }
    this.activeDownloads.set(downloadId, activeDownload)

    if (model.provider === 'huggingface' || model.repoId || model.source === 'huggingface') {
      try {
        emitProgress({ phase: 'resolving', percent: 1, message: `Checking Hugging Face model ${model.name || model.id}...` })
        const info = await this.getHuggingFaceModelInfo(model.repoId || model.id)
        const filename = pickModelFilename(info, model)
        const downloadRequest = {
          ...model,
          id: model.id || model.repoId || info.id,
          name: model.name || info.name || info.id,
          uri: model.uri || model.pull || model.model || model.repoId || model.id,
          model: model.model || model.pull || model.uri || model.repoId || model.id,
          pull: model.pull || model.uri || model.model || model.repoId || model.id,
          fileName: filename || model.fileName || model.filename || '',
          signal: effectiveSignal,
          downloadId,
          onProgress: emitProgress
        }
        const result = await this.nodeRuntime.downloadModel(downloadRequest, {
          ...options,
          signal: effectiveSignal,
          downloadId,
          onProgress: emitProgress
        })
        const manifest = await this.writeManifest(result.modelPath, {
          id: result.id || downloadRequest.id,
          name: downloadRequest.name,
          source: 'huggingface',
          provider: 'node-llama-cpp',
          repoId: info.id,
          filename: filename || path.basename(result.modelPath),
          fileName: path.basename(result.modelPath),
          modelPath: result.modelPath,
          installedAt: nowIso(),
          downloadedAt: nowIso(),
          hf: info,
          downloadId
        })
        await this.syncLocalIndex({ force: true })
        return {
          ...result,
          manifest,
          source: 'huggingface',
          repoId: info.id,
          modelInfo: info,
          downloadId
        }
      } finally {
        this.activeDownloads.delete(downloadId)
      }
    }

    try {
      const result = await this.nodeRuntime.downloadModel({
        ...model,
        signal: effectiveSignal,
        downloadId,
        onProgress: emitProgress
      }, {
        ...options,
        signal: effectiveSignal,
        downloadId,
        onProgress: emitProgress
      })
      const manifest = await this.writeManifest(result.modelPath, {
        id: result.id || model.id,
        name: model.name || result.id || model.id,
        source: 'local',
        provider: 'node-llama-cpp',
        filename: path.basename(result.modelPath),
        fileName: path.basename(result.modelPath),
        modelPath: result.modelPath,
        installedAt: nowIso(),
        downloadedAt: nowIso(),
        downloadId
      })
      await this.syncLocalIndex({ force: true })
      return {
        ...result,
        manifest,
        source: 'local',
        downloadId
      }
    } finally {
      this.activeDownloads.delete(downloadId)
    }
  }

  async resolveLocalModel(model = {}) {
    log.info('[model] resolveLocalModel', {
      id: model.id || model.name || model.repoId || model.path || '',
      provider: model.provider || 'node-llama-cpp'
    })
    if (model.path) {
      return {
        ...model,
        path: model.path,
        modelPath: model.path
      }
    }

    const localListing = await this.listLocalModels()
    const localModels = Array.isArray(localListing) ? localListing : localListing?.models || []
    const lookup = [
      safeLookup(model.id),
      safeLookup(model.name),
      safeLookup(model.fileName),
      safeLookup(model.filename),
      safeLookup(model.model),
      safeLookup(model.repoId)
    ].filter(Boolean)

    const candidate = localModels.find((item) => {
      const values = new Set([
        item.id,
        item.name,
        item.model,
        item.fileName,
        item.filename,
        item.repoId,
        item.modelPath,
        path.basename(item.path)
      ].filter(Boolean).map(String))
      return lookup.some((value) => values.has(value))
    })

    if (candidate) return candidate

    throw new Error(`Model not found locally: ${model.id || model.name || model.repoId || model.path || 'unknown'}.`)
  }

  async activateModel(model = {}, options = {}) {
    log.info('[model] activateModel:start', {
      id: model.id || model.name || model.repoId || model.path || '',
      provider: model.provider || 'node-llama-cpp'
    })
    let modelToLoad = null

    if (model.path) {
      modelToLoad = model
    } else {
      try {
        modelToLoad = await this.resolveLocalModel(model)
      } catch {
        if (model.provider === 'huggingface' || model.repoId || model.source === 'huggingface') {
          const downloadResult = await this.downloadModel(model, options)
          modelToLoad = {
            id: downloadResult.id,
            name: downloadResult.manifest?.name || model.name || downloadResult.id,
            path: downloadResult.modelPath,
            modelPath: downloadResult.modelPath,
            repoId: downloadResult.repoId || model.repoId || downloadResult.manifest?.repoId || '',
            source: 'huggingface'
          }
        } else {
          throw new Error(`Model not found locally: ${model.id || model.name || model.repoId || model.path || 'unknown'}.`)
        }
      }
    }

    const modelPath = modelToLoad.path || modelToLoad.modelPath
    if (!modelPath) throw new Error('Model path is required to activate a model.')

    if (this.activeModelPath && this.activeModelPath !== modelPath) {
      await this.deactivateModel(this.activeModelPath)
    }

    const loaded = await this.nodeRuntime.loadModel({
      ...model,
      ...modelToLoad,
      path: modelPath,
      modelPath,
      backend: model.backend || 'auto'
    })

    const record = {
      id: modelToLoad.id || model.id || path.basename(modelPath),
      name: modelToLoad.name || model.name || path.basename(modelPath),
      modelPath,
      path: modelPath,
      source: modelToLoad.source || model.source || 'local',
      repoId: modelToLoad.repoId || model.repoId || '',
      loaded,
      activatedAt: nowIso(),
      active: true
    }

    this.activeModels.set(modelPath, record)
    this.activeModelPath = modelPath
    await this.writeManifest(modelPath, {
      ...(await this.readManifest(modelPath) || {}),
      active: true,
      activatedAt: record.activatedAt
    })
    await this.updateIndexEntry(modelPath, (models) => models.map((entry) => {
      if (entry?.path !== modelPath) return entry
      return {
        ...entry,
        active: true,
        activatedAt: record.activatedAt
      }
    }))
    log.info('[model] activateModel:done', {
      modelPath,
      source: record.source,
      repoId: record.repoId || ''
    })

    return record
  }

  async deactivateModel(modelRef = this.activeModelPath) {
    const modelPath = typeof modelRef === 'string'
      ? modelRef
      : modelRef?.path || modelRef?.modelPath || ''
    log.info('[model] deactivateModel:start', { modelPath })
    if (!modelPath) {
      return {
        unloaded: false,
        message: 'No active model to unload.'
      }
    }

    const record = this.activeModels.get(modelPath)
    if (!record) {
      await this.nodeRuntime.unloadModel(modelPath).catch(() => {})
      return {
        unloaded: false,
        modelPath,
        message: 'Model was not active.'
      }
    }

    await this.nodeRuntime.unloadModel(modelPath).catch(() => {})
    this.activeModels.delete(modelPath)
    if (this.activeModelPath === modelPath) {
      this.activeModelPath = ''
    }
    const manifest = await this.readManifest(modelPath) || {}
    await this.writeManifest(modelPath, {
      ...manifest,
      active: false,
      deactivatedAt: nowIso()
    })
    await this.updateIndexEntry(modelPath, (models) => models.map((entry) => {
      if (entry?.path !== modelPath) return entry
      return {
        ...entry,
        active: false,
        deactivatedAt: nowIso()
      }
    }))
    log.info('[model] deactivateModel:done', { modelPath })

    return {
      unloaded: true,
      modelPath,
      message: 'Model deactivated.'
    }
  }

  async deleteModel(modelRef = {}) {
    log.info('[model] deleteModel:start', {
      modelRef:
        typeof modelRef === 'string' ? modelRef : modelRef?.path || modelRef?.modelPath || ''
    })
    const model = typeof modelRef === 'string'
      ? await this.resolveLocalModel({ id: modelRef }).catch(async() => this.resolveLocalModel({ path: modelRef }))
      : await this.resolveLocalModel(modelRef).catch(async() => {
        if (modelRef?.path) return { ...modelRef, path: modelRef.path, modelPath: modelRef.path }
        throw new Error(`Model not found locally: ${modelRef.id || modelRef.name || modelRef.path || 'unknown'}.`)
      })

    const modelPath = model.path || model.modelPath
    if (!modelPath) throw new Error('Model path is required to delete a model.')

    await this.deactivateModel(modelPath).catch(() => {})
    await fs.rm(modelPath, { force: true }).catch(() => {})
    await this.removeManifest(modelPath)
    this.activeModels.delete(modelPath)
    await this.removeIndexEntry(modelPath)
    log.info('[model] deleteModel:done', { modelPath })

    return {
      deleted: true,
      modelPath,
      id: model.id || path.basename(modelPath),
      message: 'Model deleted.'
    }
  }

  async getModelInfo(modelRef = {}) {
    log.info('[model] getModelInfo:start', {
      modelRef: typeof modelRef === 'string' ? modelRef : modelRef?.id || modelRef?.repoId || modelRef?.path || ''
    })
    if (typeof modelRef === 'string' && !path.isAbsolute(modelRef) && modelRef.includes('/')) {
      return this.getHuggingFaceModelInfo(modelRef)
    }

    if (modelRef?.provider === 'huggingface' || modelRef?.repoId) {
      return this.getHuggingFaceModelInfo(modelRef.repoId || modelRef.id)
    }

    const localModel = await this.resolveLocalModel(modelRef)
    const manifest = await this.readManifest(localModel.path)
    const stat = await fs.stat(localModel.path).catch(() => null)
    return {
      ...localModel,
      manifest,
      sizeBytes: stat?.size || 0,
      modifiedAt: stat?.mtime?.toISOString?.() || '',
      active: this.activeModelPath === localModel.path || this.activeModels.has(localModel.path)
    }
  }

  async getActiveModel() {
    if (!this.activeModelPath) return null
    return this.activeModels.get(this.activeModelPath) || null
  }

  async getDownloadStatus(downloadId = '') {
    const id = normalizePathLike(downloadId)
    if (!id) return null
    const active = this.activeDownloads.get(id)
    if (!active) return null
    return {
      downloadId: id,
      startedAt: active.startedAt,
      model: active.model,
      active: true
    }
  }

  async cancelDownload(downloadRef = '') {
    const downloadId = typeof downloadRef === 'string'
      ? downloadRef
      : downloadRef?.downloadId || downloadRef?.id || ''
    if (!downloadId) {
      return {
        canceled: false,
        message: 'No active download to cancel.'
      }
    }
    const active = this.activeDownloads.get(downloadId)
    if (!active) {
      return {
        canceled: false,
        downloadId,
        message: 'Download was not active.'
      }
    }
    active.controller?.abort?.()
    return {
      canceled: true,
      downloadId,
      message: 'Download canceled.'
    }
  }

  async clearCache() {
    const active = Array.from(this.activeModels.keys())
    for (const modelPath of active) {
      await this.deactivateModel(modelPath).catch(() => {})
    }
    this.activeModels.clear()
    this.activeModelPath = ''
    this.activeDownloads.clear()
    return {
      cleared: true
    }
  }
}

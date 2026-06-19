import { NodeLlamaCppRuntime } from './runtime/nodeLlamaCppRuntime'
import { OcrRuntime } from './runtime/ocrRuntime'
import { ModelLibrary } from './modelLibrary'
import log from 'electron-log'

export class ModelRuntime {
  constructor({
    fetchImpl = globalThis.fetch,
    nodeLlamaCppRuntime = new NodeLlamaCppRuntime(),
    ocrRuntime = new OcrRuntime(),
    modelLibrary = null
  } = {}) {
    this.fetch = fetchImpl
    this.nodeLlamaCppRuntime = nodeLlamaCppRuntime
    this.ocrRuntime = ocrRuntime
    this.modelLibrary =
      modelLibrary ||
      new ModelLibrary({
        nodeRuntime: this.nodeLlamaCppRuntime,
        fetchImpl: this.fetch
      })
  }

  async listLocalModels({ provider = 'node-llama-cpp', endpoint = 'http://127.0.0.1:11434' } = {}) {
    log.info('[model] listLocalModels', { provider, endpoint })
    if (provider === 'node-llama-cpp') {
      return this.modelLibrary.listLocalModels()
    }

    if (provider !== 'ollama') {
      return {
        provider,
        available: false,
        raw: '',
        models: [],
        message: `${provider} model discovery is configured through its OpenAI-compatible endpoint.`
      }
    }

    const baseUrl = this._normalizeOllamaBaseUrl(endpoint)
    try {
      const response = await this.fetch(`${baseUrl}/api/tags`)
      const text = await response.text()
      const data = text ? JSON.parse(text) : {}
      if (!response.ok) throw new Error(data?.error || `Ollama returned HTTP ${response.status}.`)
      return {
        provider: 'ollama',
        available: true,
        endpoint: baseUrl,
        raw: text,
        models: this.parseOllamaList(data),
        message: 'Ollama models discovered.'
      }
    } catch (error) {
      return {
        provider: 'ollama',
        available: false,
        endpoint: baseUrl,
        raw: '',
        models: [],
        message: error instanceof Error ? error.message : 'Unable to contact Ollama.'
      }
    }
  }

  async downloadModel(model = {}, options = {}) {
    if (!model?.id) throw new Error('Model id is required.')
    log.info('[model] downloadModel', {
      id: model.id,
      provider: model.provider || 'unknown',
      source: model.source || ''
    })
    if (model.provider === 'huggingface' || model.repoId || model.source === 'huggingface') {
      return this.modelLibrary.downloadModel(model, options)
    }
    if (model.provider === 'node-llama-cpp') {
      return this.modelLibrary.downloadModel(model, options)
    }

    if (model.provider !== 'ollama') {
      return {
        id: model.id,
        provider: model.provider,
        downloaded: false,
        message:
          'This provider uses its configured API endpoint. No local download command is available from ElephantNote.'
      }
    }

    const baseUrl = this._normalizeOllamaBaseUrl(model.endpoint || 'http://127.0.0.1:11434')
    const response = await this.fetch(`${baseUrl}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: model.pull || model.model || model.id,
        stream: false
      })
    })
    const text = await response.text()
    const data = text ? JSON.parse(text) : {}
    if (!response.ok)
      throw new Error(data?.error || `Ollama pull returned HTTP ${response.status}.`)
    return {
      id: model.id,
      provider: 'ollama',
      downloaded: true,
      endpoint: baseUrl,
      raw: text,
      message: data?.status || `${model.id} downloaded through Ollama.`
    }
  }

  parseOllamaList(data = {}) {
    return (data.models || [])
      .map((model) => ({
        id: String(model.name || model.model || '').trim(),
        name: String(model.name || model.model || '').trim(),
        provider: 'ollama',
        size: model.size || 0,
        modifiedAt: model.modified_at || '',
        digest: model.digest || ''
      }))
      .filter((model) => model.id)
  }

  _normalizeOllamaBaseUrl(endpoint = '') {
    const value = String(endpoint || 'http://127.0.0.1:11434')
      .trim()
      .replace(/\/+$/, '')
    const withProtocol = /^https?:\/\//i.test(value) ? value : `http://${value}`
    return withProtocol.replace(/\/api\/(chat|generate|tags|pull)$/i, '')
  }

  async testNodeLlamaCppModel(model = {}, options = {}) {
    const includeEmbeddings =
      Boolean(options.includeEmbeddings ?? model.includeEmbeddings ?? false) ||
      model.task === 'embedding' ||
      model.purpose === 'embedding'
    log.info('[model] testNodeLlamaCppModel', {
      id: model.id || model.name || '',
      task: model.task || model.purpose || '',
      includeEmbeddings
    })
    const startedAt = Date.now()
    const response = await this.nodeLlamaCppRuntime.generateChat({
      model,
      prompt: 'Answer with exactly: ElephantNote local chat OK',
      maxTokens: 24,
      temperature: 0
    })
    const embedding = includeEmbeddings
      ? await this.nodeLlamaCppRuntime.embedText({
        model,
        text: 'ElephantNote local note embedding search.'
      })
      : []
    return {
      ok: true,
      provider: 'node-llama-cpp',
      model: model.name || model.id,
      latencyMs: Date.now() - startedAt,
      response,
      embeddingDimensions: embedding.length,
      embeddingTested: includeEmbeddings
    }
  }

  async extractImageText(payload = {}) {
    return this.ocrRuntime.extractImageText(payload)
  }

  async getOcrStatus() {
    return this.ocrRuntime.status()
  }

  async listModels(options = {}) {
    log.info('[model] listModels', options)
    return this.modelLibrary.listModels(options)
  }

  async searchHuggingFaceModels(options = {}) {
    log.info('[model] searchHuggingFaceModels', {
      query: options.query || '',
      limit: options.limit || 20
    })
    return this.modelLibrary.searchHuggingFaceModels(options)
  }

  async getModelInfo(modelRef = {}) {
    log.info('[model] getModelInfo', {
      modelRef: typeof modelRef === 'string' ? modelRef : modelRef?.id || modelRef?.repoId || ''
    })
    return this.modelLibrary.getModelInfo(modelRef)
  }

  async activateModel(model = {}, options = {}) {
    log.info('[model] activateModel', {
      id: model.id || model.name || '',
      provider: model.provider || 'unknown'
    })
    return this.modelLibrary.activateModel(model, options)
  }

  async deactivateModel(modelRef = this.modelLibrary.activeModelPath) {
    log.info('[model] deactivateModel', {
      modelRef:
        typeof modelRef === 'string' ? modelRef : modelRef?.path || modelRef?.modelPath || ''
    })
    return this.modelLibrary.deactivateModel(modelRef)
  }

  async deleteModel(modelRef = {}) {
    log.info('[model] deleteModel', {
      modelRef:
        typeof modelRef === 'string' ? modelRef : modelRef?.path || modelRef?.modelPath || ''
    })
    return this.modelLibrary.deleteModel(modelRef)
  }

  async getActiveModel() {
    log.info('[model] getActiveModel')
    return this.modelLibrary.getActiveModel()
  }

  async cancelDownload(downloadRef = '') {
    log.info('[model] cancelDownload', {
      downloadRef:
        typeof downloadRef === 'string'
          ? downloadRef
          : downloadRef?.downloadId || downloadRef?.id || ''
    })
    return this.modelLibrary.cancelDownload(downloadRef)
  }

  async getDownloadStatus(downloadId = '') {
    log.info('[model] getDownloadStatus', { downloadId })
    return this.modelLibrary.getDownloadStatus(downloadId)
  }

  async refreshModelIndex() {
    log.info('[model] refreshModelIndex')
    return this.modelLibrary.syncLocalIndex({ force: true })
  }
}

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import log from 'electron-log'
import {
  deriveLlamaBackendsFromCapabilities,
  normalizeLlamaBackend,
  selectPreferredLlamaBackend
} from '../../../shared/ai/llamaBackend.js'

const DEFAULT_MODEL_DIR = path.join(os.homedir(), '.elephantnote', 'models', 'node-llama-cpp')

const loadNodeLlamaCpp = async() => import('node-llama-cpp')

const DEFAULT_EMBEDDING_CONTEXT_SIZE = 8192
const DEFAULT_CHAT_CONTEXT_SIZE = 4096
const DEFAULT_LOAD_CONTEXT_SIZE = 8192
const BENIGN_NATIVE_WARNING_PREFIXES = [
  'llama_context: n_ctx_seq (',
  'init: embeddings required but some input tokens were not marked as outputs -> overriding'
]

const normalizeLogText = (value = '') => {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeLogText(item)).filter(Boolean).join(' ')
  }
  return String(value || '').replace(/\s+/g, ' ').trim()
}

const normalizeProgress = ({ totalSize = 0, downloadedSize = 0 } = {}) => {
  const total = Number(totalSize) || 0
  const downloaded = Number(downloadedSize) || 0
  return {
    totalSize: total,
    downloadedSize: downloaded,
    percent: total > 0 ? Math.max(0, Math.min(100, Math.round((downloaded / total) * 100))) : 0
  }
}

const resolveChatContextSize = (requestedSize = 0, trainContextSize = 0) => {
  const requested = Number(requestedSize) || 0
  const train = Number(trainContextSize) || 0
  const cap = train > 0 ? train : DEFAULT_CHAT_CONTEXT_SIZE
  if (requested > 0) return Math.max(1, Math.max(requested, cap))
  return Math.max(1, cap)
}

const isBenignNativeWarning = (message = '') => {
  const text = normalizeLogText(message)
  return BENIGN_NATIVE_WARNING_PREFIXES.some((prefix) => text.includes(prefix))
}

export const shouldSuppressLlamaLog = (...args) => {
  const text = normalizeLogText(args)
  return isBenignNativeWarning(text)
}

export const createLlamaLogger = (logger = log) => ({
  log: (...args) => {
    if (shouldSuppressLlamaLog(...args)) return
    logger.info(...args)
  },
  info: (...args) => {
    if (shouldSuppressLlamaLog(...args)) return
    logger.info(...args)
  },
  warn: (...args) => {
    if (shouldSuppressLlamaLog(...args)) return
    logger.warn(...args)
  },
  error: (...args) => {
    logger.error(...args)
  }
})

const resolveEmbeddingContextSize = (requestedSize = 0, trainContextSize = 0) => {
  const requested = Number(requestedSize) || 0
  const train = Number(trainContextSize) || 0
  const cap = train > 0 ? train : DEFAULT_EMBEDDING_CONTEXT_SIZE
  if (requested > 0) return Math.max(1, Math.max(requested, cap))
  return Math.max(1, cap)
}

const resolveLoadContextSize = (model = {}) => {
  const requested = Number(model.contextSize || model.embeddingContextSize) || 0
  if (requested > 0) {
    return Math.max(requested, DEFAULT_LOAD_CONTEXT_SIZE)
  }
  return DEFAULT_LOAD_CONTEXT_SIZE
}

export class NodeLlamaCppRuntime {
  constructor({
    modelDir = DEFAULT_MODEL_DIR,
    moduleLoader = loadNodeLlamaCpp,
    llamaOptions = {},
    preferredBackends = ['cpu', 'gpu', 'mpu', 'npu', 'openvino', 'tpu']
  } = {}) {
    this.modelDir = modelDir
    this.moduleLoader = moduleLoader
    this.llamaOptions = {
      logLevel: 'warn',
      logger: createLlamaLogger(),
      ...llamaOptions
    }
    this.preferredBackends = [...preferredBackends]
    this.loaded = new Map()
  }

  async _resolveCapabilities() {
    try {
      const mod = await this.moduleLoader()
      const gpuTypes = typeof mod.getLlamaGpuTypes === 'function'
        ? await mod.getLlamaGpuTypes().catch(() => [])
        : []
      const hasOpenVino = String(this.llamaOptions?.cmakeOptions?.GGML_OPENVINO || '').toUpperCase() === 'ON'
      const requestedOpenVinoDevice = String(
        this.llamaOptions?.openvinoDevice ||
        this.llamaOptions?.cmakeOptions?.GGML_OPENVINO_DEVICE ||
        ''
      ).trim().toUpperCase()
      const hasNpu = hasOpenVino && requestedOpenVinoDevice === 'NPU'
      const supportedBackends = deriveLlamaBackendsFromCapabilities({
        gpuTypes,
        hasOpenVino,
        hasNpu,
        runtime: 'node'
      })
      return {
        mod,
        gpuTypes,
        supportedBackends,
        selectedBackend: selectPreferredLlamaBackend({
          availableBackends: supportedBackends,
          preferredOrder: this.preferredBackends
        }) || 'cpu'
      }
    } catch (error) {
      return {
        mod: null,
        gpuTypes: [],
        supportedBackends: ['cpu'],
        selectedBackend: 'cpu',
        error
      }
    }
  }

  async status() {
    try {
      const { mod, gpuTypes, supportedBackends, selectedBackend } = await this._resolveCapabilities()
      const models = await this.listModels()
      return {
        provider: 'node-llama-cpp',
        available: true,
        modelDir: this.modelDir,
        gpuTypes,
        supportedBackends,
        selectedBackend,
        preferredBackends: [...this.preferredBackends],
        version: typeof mod.getModuleVersion === 'function' ? mod.getModuleVersion() : '',
        models,
        message: `node-llama-cpp ready on ${selectedBackend}.`
      }
    } catch (error) {
      return {
        provider: 'node-llama-cpp',
        available: false,
        modelDir: this.modelDir,
        models: [],
        message: error instanceof Error ? error.message : 'node-llama-cpp is not available.'
      }
    }
  }

  async listModels() {
    await fs.mkdir(this.modelDir, { recursive: true })
    const entries = await fs.readdir(this.modelDir, { withFileTypes: true }).catch(() => [])
    return entries
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.gguf'))
      .map((entry) => ({
        id: entry.name,
        name: entry.name,
        model: entry.name,
        provider: 'node-llama-cpp',
        path: path.join(this.modelDir, entry.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  async resolveModel(model = {}, { onProgress } = {}) {
    const mod = await this.moduleLoader()
    await fs.mkdir(this.modelDir, { recursive: true })
    const uri = model.uri || model.modelUri || model.pull || model.model || model.id
    if (!uri) throw new Error('node-llama-cpp model URI is required.')
    const modelPath = await mod.resolveModelFile(uri, {
      directory: this.modelDir,
      fileName: model.fileName || model.filename || undefined,
      download: model.download ?? 'auto',
      verify: model.verify ?? false,
      headers: model.headers || undefined,
      endpoints: model.endpoints || undefined,
      tokens: model.tokens || undefined,
      parallel: model.parallel || undefined,
      signal: model.signal || undefined,
      cli: false,
      onProgress: (status) => onProgress?.({
        id: model.id,
        modelId: model.id,
        phase: 'downloading',
        message: `Downloading ${model.name || model.id}...`,
        ...normalizeProgress(status)
      })
    })
    return modelPath
  }

  async downloadModel(model = {}, options = {}) {
    const startedAt = Date.now()
    const modelPath = await this.resolveModel(model, options)
    return {
      id: model.id,
      provider: 'node-llama-cpp',
      downloaded: true,
      modelPath,
      modelDir: this.modelDir,
      message: `${model.name || model.id} downloaded for node-llama-cpp in ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))}s.`
    }
  }

  async loadModel(model = {}) {
    const modelPath = model.path || await this.resolveModel(model)
    if (this.loaded.has(modelPath)) return this.loaded.get(modelPath)
    const mod = await this.moduleLoader()
    const llama = await mod.getLlama(this.llamaOptions)
    const backend = normalizeLlamaBackend(model.backend || 'auto')
    const loadedModel = await llama.loadModel({
      modelPath,
      contextSize: resolveLoadContextSize(model),
      gpuLayers: backend === 'cpu' ? 0 : model.gpuLayers ?? 'auto'
    })
    const record = { mod, model: loadedModel, modelPath }
    this.loaded.set(modelPath, record)
    return record
  }

  async unloadModel(model = {}) {
    const modelPath = typeof model === 'string'
      ? model
      : model.path || model.modelPath || model.id || ''
    if (!modelPath) {
      return {
        provider: 'node-llama-cpp',
        unloaded: false,
        message: 'Model path is required to unload a node-llama-cpp model.'
      }
    }

    const record = this.loaded.get(modelPath)
    if (!record) {
      return {
        provider: 'node-llama-cpp',
        unloaded: false,
        modelPath,
        message: 'Model is not currently loaded.'
      }
    }

    const cleanupTargets = [
      record.model,
      record.context,
      record.session
    ]
    for (const target of cleanupTargets) {
      if (target?.dispose) {
        await target.dispose().catch(() => {})
      }
      if (target?.unload) {
        await target.unload().catch(() => {})
      }
    }

    this.loaded.delete(modelPath)
    return {
      provider: 'node-llama-cpp',
      unloaded: true,
      modelPath,
      message: 'Model unloaded.'
    }
  }

  async generateChat({ model = {}, messages = [], prompt = '', maxTokens = 80, temperature = 0 } = {}) {
    const { mod, model: loadedModel } = await this.loadModel(model)
    const contextSize = resolveChatContextSize(
      model.contextSize,
      loadedModel.trainContextSize,
    )
    const context = await loadedModel.createContext({ contextSize })
    try {
      const session = new mod.LlamaChatSession({ contextSequence: context.getSequence() })
      const lastUser = prompt || [...messages].reverse().find((message) => message.role === 'user')?.content || ''
      const answer = await session.prompt(lastUser, { maxTokens, temperature })
      return String(answer || '').trim()
    } finally {
      await context.dispose()
    }
  }

  async embedText({ model = {}, text = '' } = {}) {
    const { model: loadedModel } = await this.loadModel(model)
    const contextSize = resolveEmbeddingContextSize(
      model.embeddingContextSize || model.contextSize,
      loadedModel.trainContextSize,
    )
    const context = await loadedModel.createEmbeddingContext({ contextSize })
    try {
      const embedding = await context.getEmbeddingFor(String(text || ''))
      return Array.from(embedding.vector || [])
    } finally {
      await context.dispose()
    }
  }

  async extractImageText() {
    throw new Error('node-llama-cpp text bindings are available, but this build does not expose llama.cpp multimodal image input. OCR needs a llama.cpp multimodal server/tool or a dedicated OCR engine.')
  }
}

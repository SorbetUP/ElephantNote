import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  deriveLlamaBackendsFromCapabilities,
  normalizeLlamaBackend,
  selectPreferredLlamaBackend
} from '../../../shared/ai/llamaBackend.js'

const DEFAULT_MODEL_DIR = path.join(os.homedir(), '.elephantnote', 'models', 'node-llama-cpp')

const loadNodeLlamaCpp = async() => import('node-llama-cpp')

const normalizeProgress = ({ totalSize = 0, downloadedSize = 0 } = {}) => {
  const total = Number(totalSize) || 0
  const downloaded = Number(downloadedSize) || 0
  return {
    totalSize: total,
    downloadedSize: downloaded,
    percent: total > 0 ? Math.max(0, Math.min(100, Math.round((downloaded / total) * 100))) : 0
  }
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
    this.llamaOptions = { ...llamaOptions }
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
      const llama = mod ? await mod.getLlama(this.llamaOptions) : null
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
        message: `node-llama-cpp ready${llama?.gpu ? ` (${llama.gpu})` : ''} on ${selectedBackend}.`
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
      gpuLayers: backend === 'cpu' ? 0 : model.gpuLayers ?? 'auto'
    })
    const record = { mod, model: loadedModel, modelPath }
    this.loaded.set(modelPath, record)
    return record
  }

  async generateChat({ model = {}, messages = [], prompt = '', maxTokens = 80, temperature = 0 } = {}) {
    const { mod, model: loadedModel } = await this.loadModel(model)
    const context = await loadedModel.createContext({ contextSize: model.contextSize || 1024 })
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
    const context = await loadedModel.createEmbeddingContext({ contextSize: model.embeddingContextSize || 512 })
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

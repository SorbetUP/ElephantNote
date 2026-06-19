import {
  LLAMA_BACKEND_PRIORITY,
  getMissingLlamaBackends,
  normalizeLlamaBackend,
  selectPreferredLlamaBackend
} from './llamaBackend.js'

const loadWllamaModule = async() => import('@wllama/wllama')

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

const normalizeConfigPaths = (configPaths = {}) => {
  if (typeof configPaths === 'string') return { default: configPaths }
  return { ...configPaths }
}

const toFileList = (files = []) => {
  if (!files) return []
  if (Array.isArray(files)) return files
  if (typeof files !== 'string' && typeof files.length === 'number') return Array.from(files)
  return [files]
}

const extractChatText = (response = {}) => {
  const content = response?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content.trim()
  if (typeof response?.message?.content === 'string') return response.message.content.trim()
  if (typeof response?.response === 'string') return response.response.trim()
  return ''
}

const extractCompletionText = (response = {}) => {
  const content = response?.choices?.[0]?.text
  if (typeof content === 'string') return content.trim()
  return extractChatText(response)
}

const extractEmbeddingVector = (response = {}) => {
  if (Array.isArray(response)) return response
  if (Array.isArray(response?.data?.[0]?.embedding)) return response.data[0].embedding
  if (ArrayBuffer.isView(response?.data?.[0]?.embedding)) return Array.from(response.data[0].embedding)
  if (ArrayBuffer.isView(response?.data)) return Array.from(response.data)
  return []
}

export class WasmLlamaSession {
  constructor({
    runtime,
    instance,
    backend,
    modelLabel = ''
  } = {}) {
    this.runtime = runtime
    this.instance = instance
    this.backend = backend
    this.modelLabel = modelLabel
  }

  async chat({
    messages = [],
    prompt = '',
    maxTokens = 128,
    temperature = 0,
    topK = 40,
    topP = 0.9,
    stream = false,
    onData = null
  } = {}) {
    const content = prompt || [...messages].reverse().find((message) => message?.role === 'user')?.content || ''
    const response = await this.instance.createChatCompletion({
      messages: messages.length ? messages : [{ role: 'user', content: String(content || '') }],
      max_tokens: maxTokens,
      temperature,
      top_k: topK,
      top_p: topP,
      stream,
      onData
    })
    return {
      backend: this.backend,
      modelLabel: this.modelLabel,
      raw: response,
      text: extractCompletionText(response)
    }
  }

  async complete({
    prompt = '',
    maxTokens = 128,
    temperature = 0,
    stream = false,
    onData = null
  } = {}) {
    const response = await this.instance.createCompletion({
      prompt: String(prompt || ''),
      max_tokens: maxTokens,
      temperature,
      stream,
      onData
    })
    return {
      backend: this.backend,
      modelLabel: this.modelLabel,
      raw: response,
      text: extractCompletionText(response)
    }
  }

  async embed({
    input = '',
    poolingType = 'LLAMA_POOLING_TYPE_MEAN'
  } = {}) {
    const response = await this.instance.createEmbedding({
      input: String(input || ''),
      pooling_type: poolingType
    })
    return {
      backend: this.backend,
      modelLabel: this.modelLabel,
      raw: response,
      vector: extractEmbeddingVector(response)
    }
  }
}

export class WasmLlamaRuntime {
  constructor({
    configPaths = { default: '' },
    moduleLoader = loadWllamaModule,
    preferredBackends = LLAMA_BACKEND_PRIORITY,
    wllamaOptions = {},
    compat = 'default'
  } = {}) {
    this.configPaths = normalizeConfigPaths(configPaths)
    this.moduleLoader = moduleLoader
    this.preferredBackends = [...preferredBackends]
    this.wllamaOptions = { ...wllamaOptions }
    this.compat = compat
    this.loaded = null
  }

  getSupportedBackends() {
    const supported = ['cpu']
    if (isBrowser() && globalThis.navigator?.gpu) supported.push('gpu')
    return supported
  }

  resolveBackend({ backend = 'auto' } = {}) {
    const requested = normalizeLlamaBackend(backend)
    const supported = this.getSupportedBackends()
    if (requested && requested !== 'auto' && supported.includes(requested)) return requested
    return selectPreferredLlamaBackend({
      availableBackends: supported,
      preferredOrder: this.preferredBackends
    }) || 'cpu'
  }

  async status() {
    const supportedBackends = this.getSupportedBackends()
    const selectedBackend = this.resolveBackend()
    return {
      runtime: 'wasm',
      engine: 'wllama',
      available: true,
      webgpuAvailable: Boolean(globalThis.navigator?.gpu),
      wasmAvailable: typeof WebAssembly !== 'undefined',
      supportedBackends,
      preferredBackends: [...this.preferredBackends],
      selectedBackend,
      missingBackends: getMissingLlamaBackends({
        availableBackends: supportedBackends,
        preferredOrder: this.preferredBackends
      }),
      message: `WASM llama runtime ready on ${selectedBackend}.`
    }
  }

  async loadModel({
    files = [],
    modelUrl = '',
    modelFromHF = null,
    backend = 'auto',
    embeddings = false,
    loadOptions = {},
    modelLabel = ''
  } = {}) {
    const mod = await this.moduleLoader()
    const Wllama = mod.Wllama || mod.default || mod
    if (typeof Wllama !== 'function') throw new Error('Wllama module loader did not return a constructor.')

    const instance = new Wllama(this.configPaths, this.wllamaOptions)
    if (typeof instance.setCompat === 'function' && this.compat) {
      instance.setCompat(this.compat)
    }

    const selectedBackend = this.resolveBackend({ backend })
    const options = { ...loadOptions }
    if (selectedBackend === 'cpu' && options.n_gpu_layers == null) {
      options.n_gpu_layers = 0
    }
    if (embeddings) {
      options.embeddings = true
    }

    const localFiles = toFileList(files)

    if (localFiles.length > 0) {
      await instance.loadModel(localFiles, options)
    } else if (modelUrl) {
      await instance.loadModelFromUrl(modelUrl, options)
    } else if (modelFromHF) {
      await instance.loadModelFromHF(modelFromHF, options)
    } else {
      throw new Error('A local file list, model URL, or HF model descriptor is required.')
    }

    this.loaded = {
      backend: selectedBackend,
      modelLabel,
      instance
    }

    return new WasmLlamaSession({
      runtime: this,
      instance,
      backend: selectedBackend,
      modelLabel
    })
  }
}

export const createWasmLlamaRuntime = (options = {}) => new WasmLlamaRuntime(options)

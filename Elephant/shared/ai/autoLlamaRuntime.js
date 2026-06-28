import { LLAMA_BACKEND_PRIORITY, getMissingLlamaBackends, selectPreferredLlamaBackend } from './llamaBackend.js'
import { WasmLlamaRuntime } from './wasmLlamaRuntime.js'

const isTauriRuntime = () => typeof window !== 'undefined' && Boolean(window.__TAURI__)
const getTauriBridge = () => globalThis.window?.elephantnote?.rag?.chat || null

const createModelLabel = (options = {}) => options.model?.name || options.model?.id || options.modelLabel || options.modelUrl || 'wasm-model'

const extractResponseText = (response = {}) => {
  if (typeof response === 'string') return response.trim()
  if (typeof response?.text === 'string') return response.text.trim()
  if (typeof response?.raw === 'string') return response.raw.trim()
  if (typeof response?.response === 'string') return response.response.trim()
  if (typeof response?.message?.content === 'string') return response.message.content.trim()
  if (typeof response?.choices?.[0]?.message?.content === 'string') {
    return response.choices[0].message.content.trim()
  }
  if (typeof response?.choices?.[0]?.text === 'string') return response.choices[0].text.trim()
  return ''
}

class TauriLlamaSession {
  constructor({
    backend,
    model,
    bridge,
    wasmSession = null,
    fallbackNotice = ''
  } = {}) {
    this.backend = backend
    this.model = model
    this.bridge = bridge
    this.wasmSession = wasmSession
    this.fallbackNotice = fallbackNotice
  }

  async chat(options = {}) {
    const response = await this.bridge({
      ...options,
      backend: this.backend,
      model: this.model
    })
    return {
      backend: this.backend,
      modelLabel: this.model?.name || this.model?.id || '',
      raw: response,
      text: extractResponseText(response),
      fallbackNotice: this.fallbackNotice
    }
  }

  async complete(options = {}) {
    return this.chat(options)
  }

  async embed(options = {}) {
    if (this.wasmSession) {
      return this.wasmSession.embed(options)
    }
    throw new Error('Embeddings require the WASM fallback in the Tauri runtime.')
  }
}

export class AutoLlamaSession {
  constructor({
    runtimeKind,
    backend,
    model,
    wasmSession = null,
    fallbackNotice = ''
  } = {}) {
    this.runtimeKind = runtimeKind
    this.backend = backend
    this.model = model
    this.wasmSession = wasmSession
    this.fallbackNotice = fallbackNotice
  }

  async chat(options = {}) {
    if (!this.wasmSession?.chat) throw new Error('A WASM session is required for this runtime.')
    const result = await this.wasmSession.chat(options)
    return {
      backend: this.backend,
      modelLabel: this.model?.name || this.model?.id || '',
      raw: result?.raw ?? result,
      text: result?.text ?? extractResponseText(result),
      fallbackNotice: this.fallbackNotice
    }
  }

  async complete(options = {}) {
    return this.chat(options)
  }

  async embed(options = {}) {
    if (!this.wasmSession?.embed) throw new Error('A WASM session is required for embeddings.')
    const result = await this.wasmSession.embed(options)
    return {
      backend: this.backend,
      modelLabel: this.model?.name || this.model?.id || '',
      raw: result?.raw ?? result,
      vector: result?.vector ?? [],
      fallbackNotice: this.fallbackNotice
    }
  }
}

export class AutoLlamaRuntime {
  constructor({
    wasmRuntime = new WasmLlamaRuntime(),
    preferredBackends = LLAMA_BACKEND_PRIORITY
  } = {}) {
    this.wasmRuntime = wasmRuntime
    this.preferredBackends = [...preferredBackends]
  }

  async _resolveRuntimeBackends() {
    const [bridge, wasmStatus] = await Promise.all([
      Promise.resolve(getTauriBridge()),
      this.wasmRuntime?.status?.().catch((error) => ({
        available: false,
        supportedBackends: [],
        error
      }))
    ])

    return {
      bridge,
      wasmStatus: wasmStatus || { available: false, supportedBackends: [] }
    }
  }

  async status() {
    const { bridge, wasmStatus } = await this._resolveRuntimeBackends()
    const supportedBackends = [...new Set(wasmStatus.supportedBackends || [])]
    const selectedBackend = selectPreferredLlamaBackend({
      availableBackends: supportedBackends,
      preferredOrder: this.preferredBackends
    }) || 'cpu'

    const engine = bridge && isTauriRuntime()
      ? 'tauri-rust'
      : 'wasm'

    return {
      runtime: 'auto',
      engine,
      available: Boolean(bridge || wasmStatus.available),
      supportedBackends,
      missingBackends: getMissingLlamaBackends({
        availableBackends: supportedBackends,
        preferredOrder: this.preferredBackends
      }),
      preferredBackends: [...this.preferredBackends],
      selectedBackend,
      tauri: {
        available: Boolean(bridge),
        runtime: bridge ? 'tauri-rust' : 'unavailable'
      },
      wasm: wasmStatus,
      message: `${engine} selected with ${selectedBackend} as preferred backend.`
    }
  }

  async loadModel(options = {}) {
    const backend = options.backend || 'auto'
    const { bridge, wasmStatus } = await this._resolveRuntimeBackends()
    const requestBackends = backend === 'auto' ? this.preferredBackends : [backend]

    if (bridge && isTauriRuntime()) {
      const hasModelSource = Boolean(
        (Array.isArray(options.files) && options.files.length > 0) ||
        options.modelUrl ||
        options.modelFromHF
      )
      const wasmSession = hasModelSource
        ? await this.wasmRuntime.loadModel({
            ...options,
            backend: backend === 'auto' ? 'cpu' : backend
          })
        : null
      return new TauriLlamaSession({
        backend: backend === 'auto' ? wasmSession?.backend || 'cpu' : backend,
        model: options.model || {
          id: options.id || createModelLabel(options),
          name: createModelLabel(options)
        },
        bridge,
        wasmSession,
        fallbackNotice: requestBackends.includes('tpu')
          ? 'TPU is not supported in this stack; falling back to CPU.'
          : ''
      })
    }

    if ((wasmStatus.supportedBackends || []).includes(backend) || backend === 'auto') {
      const wasmSession = await this.wasmRuntime.loadModel(options)
      return new AutoLlamaSession({
        runtimeKind: 'wasm',
        backend: wasmSession.backend,
        model: options.model || { id: createModelLabel(options), name: createModelLabel(options) },
        wasmSession,
        fallbackNotice: requestBackends.includes('tpu') ? 'TPU is not supported in this stack; falling back to CPU.' : ''
      })
    }

    const cpuSession = await this.wasmRuntime.loadModel({
      ...options,
      backend: 'cpu'
    })
    return new AutoLlamaSession({
      runtimeKind: 'wasm',
      backend: 'cpu',
      model: options.model || { id: createModelLabel(options), name: createModelLabel(options) },
      wasmSession: cpuSession,
      fallbackNotice: `Backend ${backend} is not supported in this environment; falling back to CPU.`
    })
  }

  async generateChat(options = {}) {
    const session = await this.loadModel(options)
    return session.chat(options)
  }

  async embedText(options = {}) {
    const session = await this.loadModel(options)
    return session.embed(options)
  }
}

export const createAutoLlamaRuntime = (options = {}) => new AutoLlamaRuntime(options)

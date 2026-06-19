import { LLAMA_BACKEND_PRIORITY, getMissingLlamaBackends, selectPreferredLlamaBackend } from './llamaBackend.js'
import { NodeLlamaCppRuntime } from '../../back/app/runtime/nodeLlamaCppRuntime.js'
import { WasmLlamaRuntime } from './wasmLlamaRuntime.js'

const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined'

export class AutoLlamaSession {
  constructor({
    runtimeKind,
    backend,
    model,
    wasmSession = null,
    nodeRuntime = null,
    fallbackNotice = ''
  } = {}) {
    this.runtimeKind = runtimeKind
    this.backend = backend
    this.model = model
    this.wasmSession = wasmSession
    this.nodeRuntime = nodeRuntime
    this.fallbackNotice = fallbackNotice
  }

  async chat(options = {}) {
    if (this.runtimeKind === 'wasm') {
      return this.wasmSession.chat(options)
    }
    const model = { ...this.model, backend: this.backend }
    const text = await this.nodeRuntime.generateChat({
      model,
      ...options
    })
    return {
      backend: this.backend,
      modelLabel: this.model?.name || this.model?.id || '',
      raw: text,
      text,
      fallbackNotice: this.fallbackNotice
    }
  }

  async complete(options = {}) {
    if (this.runtimeKind === 'wasm') {
      return this.wasmSession.complete(options)
    }
    return this.chat(options)
  }

  async embed(options = {}) {
    if (this.runtimeKind === 'wasm') {
      return this.wasmSession.embed(options)
    }
    const model = { ...this.model, backend: this.backend }
    return {
      backend: this.backend,
      modelLabel: this.model?.name || this.model?.id || '',
      raw: null,
      vector: await this.nodeRuntime.embedText({
        model,
        text: options.input || options.text || ''
      }),
      fallbackNotice: this.fallbackNotice
    }
  }
}

export class AutoLlamaRuntime {
  constructor({
    nodeRuntime = new NodeLlamaCppRuntime(),
    wasmRuntime = new WasmLlamaRuntime(),
    preferredBackends = LLAMA_BACKEND_PRIORITY
  } = {}) {
    this.nodeRuntime = nodeRuntime
    this.wasmRuntime = wasmRuntime
    this.preferredBackends = [...preferredBackends]
  }

  async _resolveRuntimeBackends() {
    const [nodeStatus, wasmStatus] = await Promise.all([
      this.nodeRuntime?.status?.().catch((error) => ({
        available: false,
        supportedBackends: [],
        error
      })),
      this.wasmRuntime?.status?.().catch((error) => ({
        available: false,
        supportedBackends: [],
        error
      }))
    ])

    return {
      nodeStatus: nodeStatus || { available: false, supportedBackends: [] },
      wasmStatus: wasmStatus || { available: false, supportedBackends: [] }
    }
  }

  async status() {
    const { nodeStatus, wasmStatus } = await this._resolveRuntimeBackends()
    const supportedBackends = [...new Set([
      ...(nodeStatus.supportedBackends || []),
      ...(wasmStatus.supportedBackends || [])
    ])]
    const selectedBackend = selectPreferredLlamaBackend({
      availableBackends: supportedBackends,
      preferredOrder: this.preferredBackends
    }) || 'cpu'

    const engine = isBrowser()
      ? 'wasm'
      : (nodeStatus.available ? 'node-llama-cpp' : 'wasm')

    return {
      runtime: 'auto',
      engine,
      available: Boolean(nodeStatus.available || wasmStatus.available),
      supportedBackends,
      missingBackends: getMissingLlamaBackends({
        availableBackends: supportedBackends,
        preferredOrder: this.preferredBackends
      }),
      preferredBackends: [...this.preferredBackends],
      selectedBackend,
      node: nodeStatus,
      wasm: wasmStatus,
      message: `${engine} selected with ${selectedBackend} as preferred backend.`
    }
  }

  async loadModel(options = {}) {
    const backend = options.backend || 'auto'
    const { nodeStatus, wasmStatus } = await this._resolveRuntimeBackends()
    const requestBackends = backend === 'auto' ? this.preferredBackends : [backend]

    if (isBrowser()) {
      const fallbackNotice = requestBackends.includes('tpu')
        ? 'TPU is not supported in this stack; falling back to CPU.'
        : ''
      const effectiveBackend = requestBackends.some((item) => ['openvino', 'npu', 'tpu', 'mpu'].includes(item))
        ? 'cpu'
        : backend
      const wasmSession = await this.wasmRuntime.loadModel(options)
      return new AutoLlamaSession({
        runtimeKind: 'wasm',
        backend: effectiveBackend === 'auto' ? wasmSession.backend : effectiveBackend,
        model: options.model || { id: options.modelLabel || options.modelUrl || 'wasm-model', name: options.modelLabel || options.modelUrl || 'wasm-model' },
        wasmSession,
        fallbackNotice
      })
    }

    const nodeCanHandle = backend === 'auto'
      ? Boolean(nodeStatus.available)
      : (nodeStatus.supportedBackends || []).includes(backend)

    if (nodeCanHandle) {
      const nodeModel = options.model || {
        id: options.id || options.modelLabel || 'node-model',
        name: options.modelLabel || options.id || 'node-model'
      }
      await this.nodeRuntime.loadModel({
        ...options,
        backend,
        model: nodeModel
      })
      return new AutoLlamaSession({
        runtimeKind: 'node',
        backend: backend === 'auto' ? nodeStatus.selectedBackend || 'cpu' : backend,
        model: nodeModel,
        nodeRuntime: this.nodeRuntime
      })
    }

    if ((wasmStatus.supportedBackends || []).includes(backend) || backend === 'auto') {
      const wasmSession = await this.wasmRuntime.loadModel(options)
      return new AutoLlamaSession({
        runtimeKind: 'wasm',
        backend: wasmSession.backend,
        model: options.model || { id: options.modelLabel || options.modelUrl || 'wasm-model', name: options.modelLabel || options.modelUrl || 'wasm-model' },
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
      model: options.model || { id: options.modelLabel || options.modelUrl || 'wasm-model', name: options.modelLabel || options.modelUrl || 'wasm-model' },
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

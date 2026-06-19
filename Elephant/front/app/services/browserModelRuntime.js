import log from 'electron-log/renderer'

const STORAGE_KEY = 'elephantnote:browserModelRuntime'
const DEFAULT_CHAT_MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'

const pipelines = new Map()
const loadingPromises = new Map()
let loadedModelId = ''
let loadedDevice = ''
const listeners = new Set()

const progressTrackers = new Map()
const MODEL_LOAD_STALL_WARNING_MS = 15_000

const MODEL_LOAD_TIMEOUT_MS = 120_000

const formatDuration = (ms) => {
  const seconds = Math.max(1, Math.round(ms / 1000))
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const getProgressTracker = (key) => {
  let tracker = progressTrackers.get(key)
  if (!tracker) {
    tracker = {
      startedAt: Date.now(),
      updatedAt: Date.now(),
      lastPercent: 2,
      lastMessage: '',
      files: new Map()
    }
    progressTrackers.set(key, tracker)
  }
  return tracker
}

const resetProgressTracker = (key) => {
  progressTrackers.delete(key)
}

const getErrorDetails = (error) => {
  if (!error) return ''
  const parts = []
  if (error instanceof Error) {
    parts.push(error.message)
    if (error.cause instanceof Error) parts.push(error.cause.message)
    else if (error.cause) parts.push(String(error.cause))
  } else {
    parts.push(String(error))
  }
  return [...new Set(parts.filter(Boolean))].join(' | ')
}

const formatLoadError = (error, { device = '', browserModel = '' } = {}) => {
  const message = getErrorDetails(error)

  if (
    /Cannot read properties of undefined.*create|reading 'create'|reading "create"/i.test(message)
  ) {
    return `ONNX Runtime CPU backend failed while creating the inference session. This is usually a bundling/runtime issue in Electron/Vite. Browser runtime now uses WebGPU only; use Ollama for CPU/local models. Detail: ${message}`
  }

  if (/404|not found/i.test(message)) {
    return `Model file not found for ${browserModel || 'this model'}. Detail: ${message}`
  }

  if (/fetch|network|load failed|failed to fetch|ERR_|CSP|refused|blocked|CORS/i.test(message)) {
    return `Cannot download ${browserModel || 'browser model'}. Check Electron network/CSP access to Hugging Face and Xet storage. Detail: ${message}`
  }

  if (/webgpu|adapter|device|shader|gpu/i.test(message) && device === 'webgpu') {
    return `WebGPU load failed for ${browserModel || 'this model'}. Retrying with WebCPU/WASM is possible in Auto mode. Detail: ${message}`
  }

  return message || 'Browser model load failed.'
}

const configureTransformersRuntime = (transformers = {}) => {
  const env = transformers.env
  if (!env) return transformers

  env.allowRemoteModels = true
  env.allowLocalModels = false
  env.useBrowserCache = true

  if (env.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.proxy = false
  }

  const baseFetch = env.fetch || globalThis.fetch?.bind(globalThis)
  if (baseFetch && !env.__elephantnoteFetchWrapped) {
    env.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url || ''
      try {
        const response = await baseFetch(input, init)
        if (!response.ok) {
          log.warn(
            '[ElephantNote][Transformers.js] fetch returned HTTP error',
            response.status,
            response.statusText,
            url
          )
        }
        return response
      } catch (error) {
        log.error('[ElephantNote][Transformers.js] fetch failed', url, error)
        throw error
      }
    }
    env.__elephantnoteFetchWrapped = true
  }

  return transformers
}

const nowIso = () => new Date().toISOString()

const readState = () => {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') || {}
  } catch {
    return {}
  }
}

const writeState = (patch = {}) => {
  const next = {
    models: {},
    lastModelId: '',
    lastDevice: '',
    ...readState(),
    ...patch
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

const rememberModel = ({ id, name, browserModel, device }) => {
  const state = readState()
  const models = {
    ...(state.models || {}),
    [id]: {
      id,
      name: name || id,
      browserModel: browserModel || id,
      device,
      cachedBy: 'browser-cache',
      updatedAt: nowIso()
    }
  }
  return writeState({ models, lastModelId: id, lastDevice: device })
}

const emit = (event = {}) => {
  const payload = {
    runtime: 'browser',
    timestamp: nowIso(),
    ...event
  }
  for (const listener of listeners) {
    try {
      listener(payload)
    } catch {
      /* keep UI listeners isolated */
    }
  }
  return payload
}

const formatImportError = (error) => {
  const message = error instanceof Error ? error.message : String(error || '')
  if (
    /Failed to resolve module specifier|Cannot find package|Failed to fetch dynamically imported module|ERR_MODULE_NOT_FOUND/i.test(
      message
    )
  ) {
    return 'Missing browser model dependency: install @huggingface/transformers in the Electron app, then restart Vite/Electron.'
  }
  return message || 'Unable to load browser model runtime.'
}

const testBrowserNetworkAccess = async () => {
  if (!globalThis.fetch) return { ok: false, message: 'fetch is not available in this renderer.' }

  const targets = [
    'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/config.json',
    'https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json'
  ]

  for (const url of targets) {
    try {
      const response = await globalThis.fetch(url, { method: 'GET', cache: 'no-store' })
      if (!response.ok) {
        return {
          ok: false,
          message: `HTTP ${response.status} ${response.statusText} while fetching ${url}`
        }
      }
    } catch (error) {
      return {
        ok: false,
        message: `Renderer fetch is blocked for ${url}. Detail: ${error instanceof Error ? error.message : String(error || '')}`
      }
    }
  }

  return { ok: true, message: 'Renderer can fetch Hugging Face model files.' }
}

const importTransformers = async () => {
  try {
    return configureTransformersRuntime(await import('@huggingface/transformers'))
  } catch (error) {
    throw new Error(formatImportError(error))
  }
}

let runtimeDependencies = {
  importTransformers,
  testBrowserNetworkAccess
}

export const setBrowserModelRuntimeDependencies = (deps = {}) => {
  runtimeDependencies = {
    ...runtimeDependencies,
    ...deps
  }
}

const resolveCandidateDevices = (backend = 'auto') => {
  if (backend === 'webgpu') return globalThis.navigator?.gpu ? ['webgpu'] : []
  if (backend === 'webcpu' || backend === 'wasm' || backend === 'cpu') return []

  // Dans Electron/Vite, le fallback CPU de Transformers.js peut casser avec:
  // Cannot read properties of undefined (reading 'create')
  // Donc en browser runtime on ne garde que WebGPU.
  return globalThis.navigator?.gpu ? ['webgpu'] : []
}

const formatDeviceLabel = (device = '') => {
  if (device === 'webgpu') return 'WebGPU'
  if (device === 'cpu') return 'WebCPU/WASM'
  if (device === 'coreml') return 'CoreML'
  return device || 'unknown device'
}

const resolveDtypeForDevice = ({ task, requestedDtype = 'auto', device = 'cpu' } = {}) => {
  if (requestedDtype && requestedDtype !== 'auto') return requestedDtype
  if (task === 'feature-extraction') return 'q4'
  if (device === 'webgpu') return 'q4f16'
  return 'q4'
}

const normalizeProgress = (progress = {}, model = {}, trackerKey = model.id || 'default') => {
  const tracker = getProgressTracker(trackerKey)
  const status = String(progress.status || 'loading')
  const file = progress.file || progress.name || progress.model || ''

  const rawPercent = Number(progress.progress ?? progress.percent)
  const currentFilePercent = Number.isFinite(rawPercent)
    ? Math.max(0, Math.min(100, rawPercent > 0 && rawPercent <= 1 ? rawPercent * 100 : rawPercent))
    : null

  if (file) {
    const previous = tracker.files.get(file) || { percent: 0, status: '' }
    tracker.files.set(file, {
      status,
      percent: status === 'done' ? 100 : (currentFilePercent ?? previous.percent ?? 0)
    })
  }

  const files = Array.from(tracker.files.values())
  const doneCount = files.filter((item) => item.status === 'done' || item.percent >= 100).length
  const knownCount = Math.max(files.length, 4)

  let percent = tracker.lastPercent || 2

  if (status === 'ready') {
    percent = 100
  } else if (currentFilePercent !== null && file) {
    const completedPart = (doneCount / knownCount) * 70
    const currentPart = (currentFilePercent / 100) * (70 / knownCount)
    percent = Math.max(percent, Math.min(95, Math.round(4 + completedPart + currentPart)))
  } else if (status === 'done' && file) {
    percent = Math.max(percent, Math.min(94, Math.round(8 + (doneCount / knownCount) * 70)))
  } else if (/initiate|start|loading/i.test(status)) {
    percent = Math.max(percent, 4)
  }

  let message = ''
  if (status === 'ready') {
    message = 'Model ready.'
  } else if (status === 'done' && file) {
    message = `Downloaded ${file}. Waiting for next file or ONNX session init…`
  } else if (currentFilePercent !== null && file) {
    message = `Downloading ${file} (${Math.round(currentFilePercent)}%)`
  } else if (file) {
    message = `${status}: ${file}`
  } else {
    message = 'Loading model…'
  }

  tracker.lastPercent = percent
  tracker.lastMessage = message
  tracker.updatedAt = Date.now()

  return {
    id: model.id,
    modelId: model.id,
    name: model.name || model.id,
    phase: status === 'ready' ? 'ready' : 'downloading',
    percent,
    message
  }
}

const normalizeGeneratedText = (output, messages = []) => {
  const first = Array.isArray(output) ? output[0] : output
  const generated = first?.generated_text ?? first?.text ?? output
  if (Array.isArray(generated)) {
    const lastAssistant = [...generated]
      .reverse()
      .find((item) => item?.role === 'assistant' && item.content)
    if (lastAssistant) return String(lastAssistant.content).trim()
    const last = generated.at(-1)
    if (last?.content) return String(last.content).trim()
  }
  const text = typeof generated === 'string' ? generated : JSON.stringify(generated || '')
  const lastUser = [...messages].reverse().find((item) => item.role === 'user')?.content || ''
  return text.replace(lastUser, '').trim()
}

const toPipelineMessages = (messages = []) =>
  messages.map((message) => ({
    role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
    content: String(message.content || '')
  }))

export const onBrowserModelRuntimeProgress = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getBrowserModelRuntimeStatus = async () => {
  const state = readState()
  let transformersAvailable = false
  let dependencyError = ''
  try {
    await runtimeDependencies.importTransformers()
    transformersAvailable = true
  } catch (error) {
    dependencyError = error instanceof Error ? error.message : String(error || '')
  }
  const network = transformersAvailable
    ? await runtimeDependencies.testBrowserNetworkAccess()
    : { ok: false, message: dependencyError }

  return {
    runtime: 'browser',
    webgpuAvailable: Boolean(globalThis.navigator?.gpu),
    webcpuAvailable: typeof WebAssembly !== 'undefined',
    transformersAvailable,
    networkAvailable: network.ok,
    dependencyError: dependencyError || (network.ok ? '' : network.message),
    loadedModelId,
    loadedDevice,
    models: Object.values(state.models || {})
  }
}

const withTimeout = (promise, timeoutMs, onTimeout) => {
  let timeoutId = null

  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutId = globalThis.setTimeout(() => {
      try {
        onTimeout?.()
      } catch {
        // ignore timeout callback errors
      }
      reject(new Error(`Model loading timed out after ${Math.round(timeoutMs / 1000)}s.`))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId) globalThis.clearTimeout(timeoutId)
  })
}

const createPipeline = async ({ pipeline, task, browserModel, model, id, device, dtype }) => {
  const trackerKey = `${task}:${browserModel}:${device}:${dtype || 'auto'}`
  resetProgressTracker(trackerKey)
  log.info('[ElephantNote][BrowserModelRuntime] createPipeline', {
    task,
    browserModel,
    device,
    dtype
  })

  const deviceLabel = formatDeviceLabel(device)
  const dtypeLabel = dtype && dtype !== 'auto' ? ` with ${dtype}` : ''

  let lastEventAt = Date.now()
  let lastEventMessage = 'starting'

  emit({
    id,
    modelId: id,
    phase: 'starting',
    percent: device === 'webgpu' ? 2 : 4,
    message: `Preparing ${model.name || id} on ${deviceLabel}${dtypeLabel}…`
  })

  const heartbeat = globalThis.setInterval(() => {
    const tracker = getProgressTracker(trackerKey)
    const idleMs = Date.now() - lastEventAt

    if (idleMs < MODEL_LOAD_STALL_WARNING_MS) return

    emit({
      id,
      modelId: id,
      phase: 'loading',
      percent: Math.max(6, tracker.lastPercent || 6),
      message: `Still loading ${model.name || id}. No new progress event for ${formatDuration(idleMs)}. Last event: ${lastEventMessage}.`
    })
  }, 5_000)

  const pipelineOptions = {
    device,
    progress_callback: (progress) => {
      lastEventAt = Date.now()
      const normalized = normalizeProgress(progress, { ...model, id }, trackerKey)
      lastEventMessage = normalized.message
      emit(normalized)
    }
  }

  if (dtype && dtype !== 'auto') {
    pipelineOptions.dtype = dtype
  }

  try {
    return await withTimeout(
      pipeline(task, browserModel, pipelineOptions),
      MODEL_LOAD_TIMEOUT_MS,
      () => {
        const tracker = getProgressTracker(trackerKey)
        emit({
          id,
          modelId: id,
          phase: 'error',
          percent: Math.max(6, tracker.lastPercent || 6),
          message: `Model loading is stuck after ${Math.round(MODEL_LOAD_TIMEOUT_MS / 1000)}s. Last event: ${tracker.lastMessage || lastEventMessage}.`,
          error: `Timeout while loading ${browserModel}. Last event: ${tracker.lastMessage || lastEventMessage}.`
        })
      }
    )
  } finally {
    globalThis.clearInterval(heartbeat)
  }
}

const loadBrowserPipeline = async (model = {}, options = {}) => {
  const task = options.task || model.task || 'text-generation'
  const browserModel = model.browserModel || model.model || model.id || DEFAULT_CHAT_MODEL_ID
  const id = model.id || browserModel
  const backend = options.backend || model.backend || 'auto'
  const requestedDtype = options.dtype || model.dtype || 'auto'
  const devices = resolveCandidateDevices(backend)
  const cacheKey = `${task}:${browserModel}:${backend}:${requestedDtype}`

  if (!devices.length) {
    const message =
      'Browser AI requires WebGPU in this build. CPU/WASM fallback is disabled because the Electron/Vite ONNX backend fails during session creation. Use the Ollama runtime for CPU/local models.'
    log.warn('[ElephantNote][BrowserModelRuntime] no candidate devices', {
      model: id,
      backend,
      message
    })
    emit({
      id,
      modelId: id,
      phase: 'error',
      percent: 0,
      message,
      error: message
    })
    throw new Error(message)
  }

  for (const device of devices) {
    const dtype = resolveDtypeForDevice({ task, requestedDtype, device })
    const pipelineKey = `${task}:${browserModel}:${device}:${dtype}`
    if (pipelines.has(pipelineKey)) {
      emit({
        id,
        modelId: id,
        phase: 'ready',
        percent: 100,
        message: `${model.name || id} already loaded on ${formatDeviceLabel(device)} with ${dtype}.`
      })
      return {
        id,
        browserModel,
        device,
        dtype,
        task,
        loaded: true,
        reused: true,
        runner: pipelines.get(pipelineKey)
      }
    }
  }

  if (loadingPromises.has(cacheKey)) return loadingPromises.get(cacheKey)

  const promise = (async () => {
    const { pipeline } = await runtimeDependencies.importTransformers()

    let lastError = null

    for (const device of devices) {
      const dtype = resolveDtypeForDevice({ task, requestedDtype, device })
      const pipelineKey = `${task}:${browserModel}:${device}:${dtype}`

      try {
        const runner = await createPipeline({
          pipeline,
          task,
          browserModel,
          model,
          id,
          device,
          dtype
        })
        log.info('[ElephantNote][BrowserModelRuntime] pipeline ready', {
          id,
          browserModel,
          device,
          dtype
        })
        pipelines.set(pipelineKey, runner)
        loadedModelId = browserModel
        loadedDevice = device
        rememberModel({ id, name: model.name || id, browserModel, device })

        emit({
          id,
          modelId: id,
          phase: 'ready',
          percent: 100,
          message: `${model.name || id} loaded on ${formatDeviceLabel(device)} with ${dtype}.`
        })

        return { id, browserModel, device, dtype, task, loaded: true, reused: false, runner }
      } catch (error) {
        lastError = error
        const message = formatLoadError(error, { device, browserModel })
        log.warn('[ElephantNote][BrowserModelRuntime] pipeline load failed', {
          id,
          browserModel,
          device,
          dtype,
          message
        })

        emit({
          id,
          modelId: id,
          phase: 'warning',
          percent: device === 'webgpu' && devices.length > 1 ? 8 : 0,
          message,
          error: message
        })

        // No CPU fallback here. In Electron/Vite this path can fail with:
        // Cannot read properties of undefined (reading 'create')
      }
    }

    const message = formatLoadError(lastError, { device: devices.at(-1), browserModel })
    emit({ id, modelId: id, phase: 'error', percent: 0, error: message, message })
    throw new Error(message)
  })()

  loadingPromises.set(cacheKey, promise)

  try {
    return await promise
  } finally {
    loadingPromises.delete(cacheKey)
  }
}

export const loadBrowserTextModel = async (model = {}, options = {}) =>
  loadBrowserPipeline(model, { ...options, task: 'text-generation' })

export const loadBrowserEmbeddingModel = async (model = {}, options = {}) =>
  loadBrowserPipeline(model, {
    ...options,
    task: 'feature-extraction',
    dtype: options.dtype || model.dtype || 'auto'
  })

export const generateBrowserChatCompletion = async ({
  model = {},
  messages = [],
  backend = 'auto',
  maxNewTokens = 320,
  temperature = 0.2
} = {}) => {
  const loaded = await loadBrowserTextModel(model, { backend })
  const pipelineMessages = toPipelineMessages(messages)
  const output = await loaded.runner(pipelineMessages, {
    max_new_tokens: maxNewTokens,
    temperature,
    do_sample: temperature > 0,
    return_full_text: false
  })
  return normalizeGeneratedText(output, pipelineMessages)
}

export const generateBrowserEmbedding = async ({
  model = {},
  text = '',
  backend = 'auto'
} = {}) => {
  const loaded = await loadBrowserEmbeddingModel(model, { backend })
  const output = await loaded.runner(String(text || ''), {
    pooling: 'mean',
    normalize: true
  })
  if (Array.isArray(output)) return output
  if (typeof output?.tolist === 'function') return output.tolist()
  if (ArrayBuffer.isView(output?.data)) return Array.from(output.data)
  if (ArrayBuffer.isView(output)) return Array.from(output)
  return []
}

export const testBrowserModel = async (model = {}, options = {}) => {
  if (model.task === 'feature-extraction') {
    const startedAt = Date.now()
    const embedding = await generateBrowserEmbedding({
      model,
      backend: options.backend || model.backend || 'auto',
      text: 'ElephantNote embedding model test.'
    })
    return {
      ok: true,
      runtime: 'browser',
      model: model.name || model.id || model.browserModel,
      latencyMs: Date.now() - startedAt,
      dimensions: Array.isArray(embedding?.[0]) ? embedding[0].length : embedding.length,
      response: 'Embedding vector received.'
    }
  }
  const startedAt = Date.now()
  log.info('[ElephantNote][BrowserModelRuntime] testBrowserModel', {
    id: model.id || model.browserModel,
    task: model.task || 'text-generation'
  })
  const response = await generateBrowserChatCompletion({
    model,
    backend: options.backend || model.backend || 'auto',
    maxNewTokens: 40,
    temperature: 0,
    messages: [
      {
        role: 'system',
        content: 'You are a local model health check. Answer with one short sentence.'
      },
      { role: 'user', content: 'Say: ElephantNote browser model test OK.' }
    ]
  })
  return {
    ok: true,
    runtime: 'browser',
    model: model.name || model.id || model.browserModel || DEFAULT_CHAT_MODEL_ID,
    latencyMs: Date.now() - startedAt,
    response
  }
}

export const listBrowserModels = () => Object.values(readState().models || {})

export const getDefaultBrowserChatModelId = () => 'qwen25-05b-chat-browser'

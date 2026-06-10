const STORAGE_KEY = 'elephantnote:browserModelRuntime'
const DEFAULT_CHAT_MODEL_ID = 'onnx-community/Qwen2.5-0.5B-Instruct'

let generator = null
let loadedModelId = ''
let loadedDevice = ''
let loadingPromise = null
const listeners = new Set()

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
    try { listener(payload) } catch { /* keep UI listeners isolated */ }
  }
  return payload
}

const formatImportError = (error) => {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/Failed to resolve module specifier|Cannot find package|Failed to fetch dynamically imported module|ERR_MODULE_NOT_FOUND/i.test(message)) {
    return 'Missing browser model dependency: install @huggingface/transformers in the Electron app, then restart Vite/Electron.'
  }
  return message || 'Unable to load browser model runtime.'
}

const importTransformers = async() => {
  try {
    return await import('@huggingface/transformers')
  } catch (error) {
    throw new Error(formatImportError(error))
  }
}

const resolveDevice = (backend = 'auto') => {
  if (backend === 'webcpu' || backend === 'wasm') return 'wasm'
  if (backend === 'webgpu') return 'webgpu'
  return globalThis.navigator?.gpu ? 'webgpu' : 'wasm'
}

const normalizeProgress = (progress = {}, model) => {
  const rawPercent = Number(progress.progress ?? progress.percent ?? 0)
  const percent = Number.isFinite(rawPercent) ? Math.max(0, Math.min(100, rawPercent)) : 0
  const file = progress.file || progress.name || progress.model || ''
  const status = progress.status || 'loading'
  return {
    id: model.id,
    modelId: model.id,
    name: model.name || model.id,
    phase: status === 'ready' ? 'ready' : 'downloading',
    percent,
    message: file ? `${status}: ${file}` : status
  }
}

const normalizeGeneratedText = (output, messages = []) => {
  const first = Array.isArray(output) ? output[0] : output
  const generated = first?.generated_text ?? first?.text ?? output
  if (Array.isArray(generated)) {
    const lastAssistant = [...generated].reverse().find((item) => item?.role === 'assistant' && item.content)
    if (lastAssistant) return String(lastAssistant.content).trim()
    const last = generated.at(-1)
    if (last?.content) return String(last.content).trim()
  }
  const text = typeof generated === 'string' ? generated : JSON.stringify(generated || '')
  const lastUser = [...messages].reverse().find((item) => item.role === 'user')?.content || ''
  return text.replace(lastUser, '').trim()
}

const toPipelineMessages = (messages = []) => messages.map((message) => ({
  role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
  content: String(message.content || '')
}))

export const onBrowserModelRuntimeProgress = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getBrowserModelRuntimeStatus = async() => {
  const state = readState()
  let transformersAvailable = false
  let dependencyError = ''
  try {
    await importTransformers()
    transformersAvailable = true
  } catch (error) {
    dependencyError = error instanceof Error ? error.message : String(error || '')
  }
  return {
    runtime: 'browser',
    webgpuAvailable: Boolean(globalThis.navigator?.gpu),
    webcpuAvailable: typeof WebAssembly !== 'undefined',
    transformersAvailable,
    dependencyError,
    loadedModelId,
    loadedDevice,
    models: Object.values(state.models || {})
  }
}

export const loadBrowserTextModel = async(model = {}, options = {}) => {
  const browserModel = model.browserModel || model.model || model.id || DEFAULT_CHAT_MODEL_ID
  const id = model.id || browserModel
  const backend = options.backend || model.backend || 'auto'
  const device = resolveDevice(backend)
  const dtype = options.dtype || model.dtype || 'q4'

  if (loadedModelId === browserModel && loadedDevice === device && generator) {
    emit({ id, modelId: id, phase: 'ready', percent: 100, message: `${model.name || id} already loaded.` })
    return { id, browserModel, device, loaded: true, reused: true }
  }

  if (loadingPromise) return loadingPromise

  loadingPromise = (async() => {
    emit({ id, modelId: id, phase: 'starting', percent: 1, message: `Preparing ${model.name || id} on ${device === 'webgpu' ? 'WebGPU' : 'WebCPU/WASM'}…` })
    const { pipeline } = await importTransformers()
    generator = await pipeline('text-generation', browserModel, {
      device,
      dtype,
      progress_callback: (progress) => emit(normalizeProgress(progress, { ...model, id }))
    })
    loadedModelId = browserModel
    loadedDevice = device
    rememberModel({ id, name: model.name || id, browserModel, device })
    emit({ id, modelId: id, phase: 'ready', percent: 100, message: `${model.name || id} loaded on ${device === 'webgpu' ? 'WebGPU' : 'WebCPU/WASM'}.` })
    return { id, browserModel, device, loaded: true, reused: false }
  })()

  try {
    return await loadingPromise
  } catch (error) {
    emit({ id, modelId: id, phase: 'error', percent: 0, error: error instanceof Error ? error.message : String(error || ''), message: error instanceof Error ? error.message : 'Browser model load failed.' })
    throw error
  } finally {
    loadingPromise = null
  }
}

export const generateBrowserChatCompletion = async({ model = {}, messages = [], backend = 'auto', maxNewTokens = 320, temperature = 0.2 } = {}) => {
  await loadBrowserTextModel(model, { backend })
  const pipelineMessages = toPipelineMessages(messages)
  const output = await generator(pipelineMessages, {
    max_new_tokens: maxNewTokens,
    temperature,
    do_sample: temperature > 0,
    return_full_text: false
  })
  return normalizeGeneratedText(output, pipelineMessages)
}

export const testBrowserModel = async(model = {}, options = {}) => {
  const startedAt = Date.now()
  const response = await generateBrowserChatCompletion({
    model,
    backend: options.backend || model.backend || 'auto',
    maxNewTokens: 40,
    temperature: 0,
    messages: [
      { role: 'system', content: 'You are a local model health check. Answer with one short sentence.' },
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

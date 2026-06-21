export const ELEPHANTNOTE_AI_PRESETS = Object.freeze({
  custom: {
    id: 'custom',
    label: 'Custom HTTP',
    transport: 'openai-compatible',
    endpoint: '',
    model: ''
  },
  nodeLlamaCpp: {
    id: 'nodeLlamaCpp',
    label: 'node-llama-cpp',
    transport: 'node-llama-cpp',
    endpoint: 'node-llama-cpp://local',
    model: 'hf:bartowski/SmolLM2-135M-Instruct-GGUF:Q4_K_M'
  },
  mlx: {
    id: 'mlx',
    label: 'MLX local server',
    transport: 'openai-compatible',
    endpoint: 'http://127.0.0.1:8080/v1/chat/completions',
    model: 'mlx-community/Qwen2.5-7B-Instruct-4bit'
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio',
    transport: 'openai-compatible',
    endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    model: 'local-model'
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    transport: 'openai-compatible',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    model: 'anthropic/claude-3.5-sonnet'
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    transport: 'openai-compatible',
    endpoint: 'http://127.0.0.1:1455/v1/chat/completions',
    model: 'codex-local'
  }
})

const LOCALHOST_PATTERN = /^(localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\d{1,3}(?:\.\d{1,3}){3}|\[[^\]]+\]):\d+(?:\/.*)?$/i

const LOCAL_APP_SOURCE_IDS = new Set(['app-local', 'node-llama-cpp', 'nodeLlamaCpp'])
const HTTP_COMPATIBLE_SOURCE_IDS = new Set([
  'api',
  'openai-compatible',
  'openrouter',
  'mistral',
  'lmstudio',
  'llamacpp',
  'llama.cpp',
  'llamacpp-server'
])

export const normalizeAiEndpoint = (endpoint = '') => {
  const value = String(endpoint || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (LOCALHOST_PATTERN.test(value)) return `http://${value}`
  return value
}

export const normalizeAiEndpointForTransport = (endpoint = '', transport = 'openai-compatible') => {
  const normalized = normalizeAiEndpoint(endpoint)
  if (transport === 'browser') return normalized || 'browser://local'
  if (transport !== 'ollama' || !normalized) return normalized
  const value = normalized.replace(/\/+$/, '')
  if (/\/api\/(chat|generate)$/i.test(value)) return value.replace(/\/api\/generate$/i, '/api/chat')
  return `${value}/api/chat`
}

export const resolveAiEndpoint = ({ endpoint = '', transport = 'openai-compatible' } = {}) => {
  return normalizeAiEndpointForTransport(endpoint, transport)
}

export const createDefaultLocalAiConfig = () => ({
  enabled: true,
  showModelLibraryInSidebar: true,
  allowHuggingFaceDownloads: true,
  allowLocalRuntimeAutostart: true
})

export const normalizeLocalAiConfig = (localAi = {}) => {
  const defaults = createDefaultLocalAiConfig()
  const input = localAi && typeof localAi === 'object' ? localAi : {}
  return {
    ...defaults,
    ...input,
    enabled: input.enabled !== false,
    showModelLibraryInSidebar: input.showModelLibraryInSidebar !== false,
    allowHuggingFaceDownloads: input.allowHuggingFaceDownloads !== false,
    allowLocalRuntimeAutostart: input.allowLocalRuntimeAutostart !== false
  }
}

const getObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})

const normalizeSourceId = (value = '') => String(value || '').trim()

const sourceToTransport = (source = '') => {
  const value = normalizeSourceId(source)
  if (LOCAL_APP_SOURCE_IDS.has(value)) return 'node-llama-cpp'
  if (value === 'ollama') return 'ollama'
  if (HTTP_COMPATIBLE_SOURCE_IDS.has(value)) return 'openai-compatible'
  if (value === 'codex') return 'openai-compatible'
  if (value === 'browser') return 'browser'
  return value || 'openai-compatible'
}

const providerMatchesSource = (provider = {}, source = '') => {
  const normalizedSource = normalizeSourceId(source)
  const type = normalizeSourceId(provider.type)
  if (!normalizedSource || !type) return false
  if (normalizedSource === type) return true
  if (normalizedSource === 'api' && type === 'openai-compatible') return true
  if (normalizedSource === 'llamacpp' && ['llama.cpp', 'llamacpp-server'].includes(type)) return true
  return false
}

const resolveProviderForSource = (providers = {}, source = '') => {
  const list = Array.isArray(providers.list) ? providers.list : []
  const fromList = list.find((provider) => provider.enabled !== false && providerMatchesSource(provider, source))
  if (fromList) return fromList
  const normalizedSource = source === 'api' ? 'api' : normalizeSourceId(source)
  return getObject(providers[normalizedSource])
}

const normalizeRoute = (route = {}) => getObject(route)

const resolveFeatureRouteRuntime = ({ config = {}, localAi, preset } = {}) => {
  const routes = getObject(config.routes)
  const chatRoute = normalizeRoute(routes.chat)
  const source = normalizeSourceId(chatRoute.source || chatRoute.provider)
  const hasUsableRoute = source && source !== 'disabled'
  if (!hasUsableRoute) return null

  if (LOCAL_APP_SOURCE_IDS.has(source) && localAi.enabled === false) return null

  const providers = getObject(config.providers)
  const provider = resolveProviderForSource(providers, source)
  const transport = sourceToTransport(source)
  const endpoint = chatRoute.endpoint || provider.endpoint || preset.endpoint || ''
  const model = String(chatRoute.model || config.model || preset.model || '').trim()
  const apiKey = String(provider.apiKey || config.apiKey || '').trim()

  return {
    provider: source,
    transport,
    endpoint,
    model,
    apiKey
  }
}

export const normalizeAiConfig = (config = {}) => {
  const rawLocalAi = getObject(config.localAi)
  const localAi = normalizeLocalAiConfig(rawLocalAi)
  const rawProvider = String(config.preset || config.provider || 'nodeLlamaCpp')
  const presetId = rawProvider === 'disabled' ? (localAi.enabled ? 'nodeLlamaCpp' : 'custom') : rawProvider
  const preset = ELEPHANTNOTE_AI_PRESETS[presetId] || ELEPHANTNOTE_AI_PRESETS.custom
  const routeRuntime = resolveFeatureRouteRuntime({ config, localAi, preset })
  const rawTransport = String(routeRuntime?.transport || config.transport || preset.transport)
  const transport = rawTransport === 'disabled' ? (localAi.enabled ? 'node-llama-cpp' : 'openai-compatible') : rawTransport
  const endpoint = normalizeAiEndpointForTransport(routeRuntime?.endpoint || config.endpoint || preset.endpoint, transport)
  const model = String(routeRuntime?.model || config.model || preset.model || '')
  const apiKey = String(routeRuntime?.apiKey || config.apiKey || '')

  return {
    ...config,
    preset: preset.id,
    name: String(config.name || preset.label),
    provider: routeRuntime?.provider || (config.provider === 'disabled' && localAi.enabled ? 'app-local' : config.provider),
    transport,
    endpoint,
    model,
    apiKey,
    codexLinkEnabled: config.codexLinkEnabled !== false,
    defaultProvider: String(config.defaultProvider || (localAi.enabled ? 'app-local' : 'api')),
    localAi,
    providers: getObject(config.providers),
    routes: getObject(config.routes),
    rag: getObject(config.rag),
    tools: getObject(config.tools),
    search: getObject(config.search),
    indexing: getObject(config.indexing),
    ocr: getObject(config.ocr)
  }
}

export const createAiRequestBody = ({ transport, model, messages }) => {
  if (transport === 'ollama') {
    return {
      model,
      messages,
      stream: false
    }
  }
  return {
    model,
    messages,
    stream: false
  }
}

export const extractAiResponseText = (data = {}) => {
  if (typeof data?.message?.content === 'string') return data.message.content
  const content = data?.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (typeof data?.response === 'string') return data.response
  return ''
}

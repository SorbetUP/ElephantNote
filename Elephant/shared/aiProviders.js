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

export const normalizeAiConfig = (config = {}) => {
  const presetId = String(config.preset || config.provider || 'nodeLlamaCpp')
  const preset = ELEPHANTNOTE_AI_PRESETS[presetId] || ELEPHANTNOTE_AI_PRESETS.custom
  const transport = String(config.transport || preset.transport)
  const localAi = normalizeLocalAiConfig(config.localAi)
  return {
    ...config,
    preset: preset.id,
    name: String(config.name || preset.label),
    transport,
    endpoint: normalizeAiEndpointForTransport(config.endpoint || preset.endpoint, transport),
    model: String(config.model || preset.model || ''),
    apiKey: String(config.apiKey || ''),
    codexLinkEnabled: config.codexLinkEnabled !== false,
    defaultProvider: String(config.defaultProvider || (localAi.enabled ? 'app-local' : 'api')),
    localAi,
    providers: config.providers && typeof config.providers === 'object' ? config.providers : {},
    routes: config.routes && typeof config.routes === 'object' ? config.routes : {},
    rag: config.rag && typeof config.rag === 'object' ? config.rag : {},
    tools: config.tools && typeof config.tools === 'object' ? config.tools : {},
    search: config.search && typeof config.search === 'object' ? config.search : {},
    indexing: config.indexing && typeof config.indexing === 'object' ? config.indexing : {},
    ocr: config.ocr && typeof config.ocr === 'object' ? config.ocr : {}
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

export const ELEPHANTNOTE_AI_PRESETS = Object.freeze({
  custom: {
    id: 'custom',
    label: 'Custom HTTP',
    transport: 'openai-compatible',
    endpoint: '',
    model: ''
  },
  ollama: {
    id: 'ollama',
    label: 'Ollama',
    transport: 'ollama',
    endpoint: 'http://127.0.0.1:11434/api/chat',
    model: 'llama3.2'
  },
  lmstudio: {
    id: 'lmstudio',
    label: 'LM Studio',
    transport: 'openai-compatible',
    endpoint: 'http://127.0.0.1:1234/v1/chat/completions',
    model: 'local-model'
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    transport: 'openai-compatible',
    endpoint: 'http://127.0.0.1:1455/v1/chat/completions',
    model: 'codex-local'
  }
})

const LOCALHOST_PATTERN = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[^\]]+\]):\d+(?:\/.*)?$/i

export const normalizeAiEndpoint = (endpoint = '') => {
  const value = String(endpoint || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  if (LOCALHOST_PATTERN.test(value)) return `http://${value}`
  return value
}

export const normalizeAiConfig = (config = {}) => {
  const presetId = String(config.preset || config.provider || 'custom')
  const preset = ELEPHANTNOTE_AI_PRESETS[presetId] || ELEPHANTNOTE_AI_PRESETS.custom
  return {
    enabled: config.enabled !== false,
    preset: preset.id,
    name: String(config.name || preset.label),
    transport: String(config.transport || preset.transport),
    endpoint: normalizeAiEndpoint(config.endpoint || preset.endpoint),
    model: String(config.model || preset.model || ''),
    apiKey: String(config.apiKey || ''),
    codexLinkEnabled: config.codexLinkEnabled !== false
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

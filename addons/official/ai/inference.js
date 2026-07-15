const ADDON_ID = 'elephant.ai'

const trimSlash = (value = '') => String(value || '').replace(/\/+$/, '')

const enabledProviders = (config) => (Array.isArray(config?.providers?.list) ? config.providers.list : [])
  .filter((provider) => provider?.enabled !== false && provider?.endpoint)

const routeConfig = (config, routeName) => {
  const route = config?.routes?.[routeName]
  if (typeof route === 'string') return { providerId: route, model: '' }
  return route && typeof route === 'object' ? route : {}
}

const resolveProvider = (config, routeName, options = {}) => {
  const providers = enabledProviders(config)
  const route = routeConfig(config, routeName)
  const providerId = String(options.providerId || route.providerId || route.provider || '')
  const provider = providers.find((entry) => entry.id === providerId) || providers[0]
  if (!provider) throw new Error(`No enabled AI provider is configured for ${routeName}.`)
  const model = String(options.model || route.model || provider[`${routeName}Model`] || provider.model || '').trim()
  if (!model) throw new Error(`No model is configured for AI route ${routeName}.`)
  return { provider, model }
}

const optionalRoute = (config, routeName) => {
  try {
    const { provider, model } = resolveProvider(config, routeName)
    return { providerId: provider.id, model }
  } catch {
    return routeConfig(config, routeName)
  }
}

const requestBroker = async (api, params) => {
  const invoke = api.experimental.window?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') throw new Error('Tauri addon broker is unavailable.')
  const response = await invoke('tauri_addons_call', {
    addonId: ADDON_ID,
    method: 'http.request',
    params
  })
  const body = String(response?.body || '')
  let parsed = null
  try {
    parsed = body ? JSON.parse(body) : null
  } catch {
    parsed = null
  }
  if (!response?.ok) {
    const detail = parsed?.error?.message || parsed?.message || body || `HTTP ${response?.status || 0}`
    throw new Error(detail)
  }
  return parsed
}

const headersFor = (provider) => {
  const headers = {
    'content-type': 'application/json',
    ...(provider?.headers && typeof provider.headers === 'object' ? provider.headers : {})
  }
  if (provider?.apiKey && !headers.authorization && !headers.Authorization) {
    headers.authorization = `Bearer ${provider.apiKey}`
  }
  return headers
}

const endpointFor = (provider, path) => {
  const endpoint = trimSlash(provider.endpoint)
  if (!endpoint.startsWith('https://')) throw new Error('AI provider endpoints must use HTTPS.')
  if (endpoint.endsWith(path)) return endpoint
  return `${endpoint}${path}`
}

const normalizeEmbeddingResponse = (payload, expected) => {
  const data = Array.isArray(payload?.data) ? payload.data : []
  const ordered = [...data].sort((left, right) => Number(left?.index || 0) - Number(right?.index || 0))
  const vectors = ordered.map((entry) => entry?.embedding).filter(Array.isArray)
  if (vectors.length !== expected) {
    throw new Error(`Embedding provider returned ${vectors.length} vectors for ${expected} inputs.`)
  }
  const dimensions = vectors[0]?.length || 0
  if (!dimensions || vectors.some((vector) => vector.length !== dimensions || vector.some((value) => !Number.isFinite(value)))) {
    throw new Error('Embedding provider returned invalid or inconsistent vectors.')
  }
  return vectors
}

const parseAssistantText = (payload) => {
  const text = payload?.choices?.[0]?.message?.content ?? payload?.choices?.[0]?.text ?? ''
  if (Array.isArray(text)) {
    return text.map((part) => part?.text || part?.content || '').join('')
  }
  return String(text || '')
}

export const createAiInferenceResource = (api, getConfig) => Object.freeze({
  apiVersion: 1,
  owner: ADDON_ID,
  async embed(texts, options = {}) {
    const input = (Array.isArray(texts) ? texts : [texts]).map(String).filter((value) => value.trim())
    if (!input.length) return { vectors: [], model: '', providerId: '' }
    const config = await getConfig()
    const { provider, model } = resolveProvider(config, 'embedding', options)
    const batchSize = Math.min(64, Math.max(1, Number(options.batchSize || 32)))
    const vectors = []
    for (let offset = 0; offset < input.length; offset += batchSize) {
      const batch = input.slice(offset, offset + batchSize)
      const payload = await requestBroker(api, {
        url: endpointFor(provider, '/embeddings'),
        method: 'POST',
        headers: headersFor(provider),
        body: JSON.stringify({ model, input: batch })
      })
      vectors.push(...normalizeEmbeddingResponse(payload, batch.length))
    }
    return { vectors, model, providerId: provider.id }
  },
  async complete(messages, options = {}) {
    const config = await getConfig()
    const { provider, model } = resolveProvider(config, 'chat', options)
    const payload = await requestBroker(api, {
      url: endpointFor(provider, '/chat/completions'),
      method: 'POST',
      headers: headersFor(provider),
      body: JSON.stringify({
        model,
        messages: Array.isArray(messages) ? messages : [{ role: 'user', content: String(messages || '') }],
        temperature: Number.isFinite(Number(options.temperature)) ? Number(options.temperature) : 0.1,
        response_format: options.json === true ? { type: 'json_object' } : undefined
      })
    })
    return {
      text: parseAssistantText(payload),
      model,
      providerId: provider.id,
      usage: payload?.usage || null
    }
  },
  async status() {
    const config = await getConfig()
    const providers = enabledProviders(config)
    return {
      configuredProviders: providers.map((provider) => ({ id: provider.id, label: provider.label, type: provider.type })),
      embeddingRoute: optionalRoute(config, 'embedding'),
      chatRoute: optionalRoute(config, 'chat')
    }
  }
})

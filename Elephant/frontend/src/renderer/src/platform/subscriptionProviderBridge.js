const getCore = (target = globalThis) => target?.__TAURI__?.core || null

const invoke = (target, command, payload = {}) => {
  const core = getCore(target)
  if (!core?.invoke) throw new Error(`Tauri command API is unavailable for ${command}`)
  return core.invoke(command, payload)
}

const object = (value = {}) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
const providerPayload = (provider, payload = {}) => ({ provider, ...object(payload) })
const providerNameFromConfig = (config = {}) => String(
  config.provider ||
  config.transport ||
  config.preset ||
  config.providers?.active ||
  ''
).trim().toLowerCase()
const unsupportedCodexInterrupt = () => {
  throw new Error('Codex turn interruption is not exposed yet because the current app-server reader is serialized. The turn remains real, but it must complete before another Codex request can run.')
}
const runtimeThreads = new Map()

const text = (value = '') => String(value ?? '').trim()
const chatMessage = (payload = {}) => {
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const lastUser = [...messages].reverse().find((message) => message?.role === 'user' && text(message?.content))
  return text(lastUser?.content || payload.message || payload.prompt || payload.query || payload.text)
}
const stableHash = (value = '') => {
  let hash = 2166136261
  for (const character of String(value)) {
    hash ^= character.codePointAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
const conversationKey = (payload = {}) => {
  const explicit = text(
    payload.conversationId ||
    payload.conversationID ||
    payload.chatId ||
    payload.chatID ||
    payload.sessionId ||
    payload.sessionID
  )
  if (explicit) return explicit
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const firstMeaningful = messages.find((message) => text(message?.content))
  const seed = text(firstMeaningful?.content || payload.message || payload.prompt || payload.query || payload.text || 'default')
  return `message-${stableHash(seed)}`
}
const chatRoute = (config = {}, payload = {}) => object(
  payload.route ||
  payload.chatRoute ||
  config.routes?.chat ||
  {}
)
const chatProvider = (config = {}, payload = {}) => text(
  payload.provider ||
  chatRoute(config, payload).source ||
  chatRoute(config, payload).provider ||
  config.provider ||
  config.transport
).toLowerCase()
const chatModel = (config = {}, payload = {}) => text(
  payload.model ||
  chatRoute(config, payload).model ||
  chatRoute(config, payload).modelId ||
  config.model
)
const runtimeProviderConfig = (config = {}, provider) => {
  const providers = Array.isArray(config.providers?.list) ? config.providers.list : []
  return object(providers.find((entry) => text(entry?.type).toLowerCase() === provider) || config.providers?.[provider])
}
const threadIdFrom = (result = {}) => text(
  result.threadId ||
  result.threadID ||
  result.id ||
  result.thread?.id ||
  result.thread?.threadId ||
  result.thread?.threadID
)

export const SUBSCRIPTION_PROVIDER_ACTIONS = Object.freeze([
  'ai.runtimes.status',
  'ai.runtimes.install',
  'ai.runtimes.ensure',
  'ai.runtimes.stop',
  'ai.providers.status',
  'ai.auth.status',
  'ai.auth.login.start',
  'ai.auth.login.cancel',
  'ai.auth.logout',
  'ai.models.list',
  'ai.threads.start',
  'ai.turns.start',
  'ai.turns.interrupt'
])

const createProvider = (target, provider) => ({
  managedStatus: () => invoke(target, 'tauri_ai_managed_runtime_status', { provider }),
  install: () => invoke(target, 'tauri_ai_managed_runtime_install', { provider }),
  ensure: (payload = {}) => invoke(target, 'tauri_ai_managed_runtime_ensure', providerPayload(provider, payload)),
  stop: () => invoke(target, 'tauri_ai_managed_runtime_stop', { provider }),
  status: (payload = {}) => invoke(target, 'tauri_ai_runtime_status', providerPayload(provider, payload)),
  authStatus: (payload = {}) => invoke(target, 'tauri_ai_auth_status', providerPayload(provider, payload)),
  login: (payload = {}) => invoke(target, 'tauri_ai_auth_login_start', providerPayload(provider, payload)),
  cancelLogin: (loginId) => invoke(target, 'tauri_ai_auth_login_cancel', { loginId }),
  logout: () => invoke(target, 'tauri_ai_auth_logout', { provider }),
  listModels: (payload = {}) => invoke(target, 'tauri_ai_models_list', providerPayload(provider, payload)),
  startThread: (payload = {}) => invoke(target, 'tauri_ai_thread_start', providerPayload(provider, payload)),
  startTurn: (payload = {}) => invoke(target, 'tauri_ai_turn_start', providerPayload(provider, payload)),
  interruptTurn: provider === 'codex'
    ? unsupportedCodexInterrupt
    : (payload = {}) => invoke(target, 'tauri_ai_turn_interrupt', providerPayload(provider, payload))
})

const createSubscriptionChat = (root, previousRagChat) => async(payload = {}) => {
  const normalized = object(payload)
  const config = object(normalized.aiConfig || normalized.config || await root.ai.getConfig?.())
  const provider = chatProvider(config, normalized)
  if (provider !== 'codex' && provider !== 'opencode') {
    if (!previousRagChat) throw new Error(`No chat runtime is available for provider "${provider || 'unknown'}".`)
    return previousRagChat(payload)
  }

  const message = chatMessage(normalized)
  if (!message) throw new Error('A non-empty user message is required.')
  const model = chatModel(config, normalized)
  if (!model) throw new Error(`No ${provider} chat model is selected.`)
  const runtime = root.ai[provider]
  if (!runtime?.ensure || !runtime?.startThread || !runtime?.startTurn) throw new Error(`The ${provider} runtime bridge is unavailable.`)

  const providerConfig = runtimeProviderConfig(config, provider)
  const connection = provider === 'opencode'
    ? { endpoint: providerConfig.endpoint || chatRoute(config, normalized).endpoint, password: providerConfig.apiKey || providerConfig.password }
    : {}
  await runtime.ensure(connection)

  const key = `${provider}:${conversationKey(normalized)}:${model}`
  let threadId = runtimeThreads.get(key) || ''
  let created = false
  if (!threadId) {
    const thread = await runtime.startThread({
      ...connection,
      model,
      cwd: normalized.cwd || config.cwd,
      title: normalized.title || 'ElephantNote chat'
    })
    threadId = threadIdFrom(thread)
    if (!threadId) throw new Error(`${provider} created a thread without returning its id.`)
    runtimeThreads.set(key, threadId)
    created = true
  }

  const route = chatRoute(config, normalized)
  const systemPrompt = text(route.systemPrompt || config.systemPrompt)
  const turnMessage = created && systemPrompt ? `${systemPrompt}\n\nUser message:\n${message}` : message
  let result
  try {
    result = await runtime.startTurn({ ...connection, threadId, message: turnMessage, model, cwd: normalized.cwd || config.cwd })
  } catch (error) {
    runtimeThreads.delete(key)
    throw error
  }

  const answer = text(result?.text || result?.answer || result?.response?.text)
  if (!answer) throw new Error(`${provider} completed the turn without returning assistant text.`)
  return {
    answer,
    sources: Array.isArray(result?.sources) ? result.sources : [],
    runtime: result?.runtime || `${provider}-runtime`,
    provider,
    model,
    threadId,
    turnId: result?.turnId || result?.turnID || '',
    raw: result
  }
}

export const installSubscriptionProviderBridge = (target = globalThis) => {
  const root = target?.elephantnote
  if (!root) return false

  const codex = createProvider(target, 'codex')
  const opencode = createProvider(target, 'opencode')

  root.ai = root.ai || {}
  const previousTestConfig = root.ai.testConfig?.bind(root.ai)
  root.ai.runtimes = {
    ...(root.ai.runtimes || {}),
    status: (payload = {}) => invoke(target, 'tauri_ai_managed_runtime_status', object(payload)),
    install: (payload = {}) => invoke(target, 'tauri_ai_managed_runtime_install', object(payload)),
    ensure: (payload = {}) => invoke(target, 'tauri_ai_managed_runtime_ensure', object(payload)),
    stop: (payload = {}) => invoke(target, 'tauri_ai_managed_runtime_stop', object(payload))
  }
  root.ai.providers = {
    ...(root.ai.providers || {}),
    status: (payload = {}) => invoke(target, 'tauri_ai_runtime_status', object(payload)),
    authStatus: (payload = {}) => invoke(target, 'tauri_ai_auth_status', object(payload)),
    login: (payload = {}) => invoke(target, 'tauri_ai_auth_login_start', object(payload)),
    cancelLogin: (payload = {}) => invoke(target, 'tauri_ai_auth_login_cancel', object(payload)),
    logout: (payload = {}) => invoke(target, 'tauri_ai_auth_logout', object(payload)),
    listModels: (payload = {}) => invoke(target, 'tauri_ai_models_list', object(payload)),
    startThread: (payload = {}) => invoke(target, 'tauri_ai_thread_start', object(payload)),
    startTurn: (payload = {}) => invoke(target, 'tauri_ai_turn_start', object(payload)),
    interruptTurn: (payload = {}) => {
      const normalized = object(payload)
      if (String(normalized.provider || '').toLowerCase() === 'codex') return unsupportedCodexInterrupt()
      return invoke(target, 'tauri_ai_turn_interrupt', normalized)
    }
  }
  root.ai.codex = { ...(root.ai.codex || {}), ...codex }
  root.ai.opencode = { ...(root.ai.opencode || {}), ...opencode }
  root.ai.testConfig = async(config = {}) => {
    const normalized = object(config)
    const provider = providerNameFromConfig(normalized)
    if (provider === 'codex') {
      const managed = await codex.ensure()
      const runtime = await codex.status()
      const auth = await codex.authStatus()
      return { ok: true, provider: 'codex', managed, runtime, auth }
    }
    if (provider === 'opencode') {
      const endpoint = normalized.endpoint || normalized.opencode?.endpoint
      const password = normalized.apiKey || normalized.password
      const managed = await opencode.ensure({ endpoint })
      const runtime = await opencode.status({ endpoint, password })
      const auth = await opencode.authStatus({ endpoint, password })
      return { ok: true, provider: 'opencode', managed, runtime, auth }
    }
    if (!previousTestConfig) throw new Error(`No runtime test is available for provider "${provider || 'unknown'}".`)
    return previousTestConfig(config)
  }

  root.rag = root.rag || {}
  const previousRagChat = root.rag.chat?.bind(root.rag)
  root.rag.chat = createSubscriptionChat(root, previousRagChat)

  const previousApi = root.api || {}
  const previousDescribe = previousApi.describe?.bind(previousApi)
  const previousCall = previousApi.call?.bind(previousApi)
  root.api = {
    ...previousApi,
    describe: async() => {
      const description = previousDescribe ? await previousDescribe() : { actions: [] }
      return {
        ...description,
        actions: Array.from(new Set([...(description.actions || []), ...SUBSCRIPTION_PROVIDER_ACTIONS]))
      }
    },
    call: async(action, payload = {}) => {
      const normalized = object(payload)
      switch (action) {
        case 'ai.runtimes.status': return { ok: true, data: await root.ai.runtimes.status(normalized) }
        case 'ai.runtimes.install': return { ok: true, data: await root.ai.runtimes.install(normalized) }
        case 'ai.runtimes.ensure': return { ok: true, data: await root.ai.runtimes.ensure(normalized) }
        case 'ai.runtimes.stop': return { ok: true, data: await root.ai.runtimes.stop(normalized) }
        case 'ai.providers.status': return { ok: true, data: await root.ai.providers.status(normalized) }
        case 'ai.auth.status': return { ok: true, data: await root.ai.providers.authStatus(normalized) }
        case 'ai.auth.login.start': return { ok: true, data: await root.ai.providers.login(normalized) }
        case 'ai.auth.login.cancel': return { ok: true, data: await root.ai.providers.cancelLogin(normalized) }
        case 'ai.auth.logout': return { ok: true, data: await root.ai.providers.logout(normalized) }
        case 'ai.models.list': return { ok: true, data: await root.ai.providers.listModels(normalized) }
        case 'ai.threads.start': return { ok: true, data: await root.ai.providers.startThread(normalized) }
        case 'ai.turns.start': return { ok: true, data: await root.ai.providers.startTurn(normalized) }
        case 'ai.turns.interrupt': return { ok: true, data: await root.ai.providers.interruptTurn(normalized) }
        default:
          if (!previousCall) throw new Error(`ElephantNote subscription provider bridge does not implement API action: ${action}`)
          return previousCall(action, payload)
      }
    }
  }
  return true
}

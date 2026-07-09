const getCore = (target = globalThis) => target?.__TAURI__?.core || null

const invoke = (target, command, payload = {}) => {
  const core = getCore(target)
  if (!core?.invoke) throw new Error(`Tauri command API is unavailable for ${command}`)
  return core.invoke(command, payload)
}

const object = (value = {}) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {})
const providerPayload = (provider, payload = {}) => ({ provider, ...object(payload) })

export const SUBSCRIPTION_PROVIDER_ACTIONS = Object.freeze([
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
  status: (payload = {}) => invoke(target, 'tauri_ai_runtime_status', providerPayload(provider, payload)),
  authStatus: (payload = {}) => invoke(target, 'tauri_ai_auth_status', providerPayload(provider, payload)),
  login: (payload = {}) => invoke(target, 'tauri_ai_auth_login_start', providerPayload(provider, payload)),
  cancelLogin: (loginId) => invoke(target, 'tauri_ai_auth_login_cancel', { loginId }),
  logout: () => invoke(target, 'tauri_ai_auth_logout', { provider }),
  listModels: (payload = {}) => invoke(target, 'tauri_ai_models_list', providerPayload(provider, payload)),
  startThread: (payload = {}) => invoke(target, 'tauri_ai_thread_start', providerPayload(provider, payload)),
  startTurn: (payload = {}) => invoke(target, 'tauri_ai_turn_start', providerPayload(provider, payload)),
  interruptTurn: (payload = {}) => invoke(target, 'tauri_ai_turn_interrupt', providerPayload(provider, payload))
})

export const installSubscriptionProviderBridge = (target = globalThis) => {
  const root = target?.elephantnote
  if (!root) return false

  const codex = createProvider(target, 'codex')
  const opencode = createProvider(target, 'opencode')

  root.ai = root.ai || {}
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
    interruptTurn: (payload = {}) => invoke(target, 'tauri_ai_turn_interrupt', object(payload))
  }
  root.ai.codex = { ...(root.ai.codex || {}), ...codex }
  root.ai.opencode = { ...(root.ai.opencode || {}), ...opencode }

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

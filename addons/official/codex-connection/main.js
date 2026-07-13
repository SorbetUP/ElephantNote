const ADDON_ID = 'elephant.codex-connection'
const PROVIDER_ID = 'codex'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantCodexAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  service(method, params = {}, options = {}) {
    return this.api.native.service.call(method, params, options)
  }

  async call(action, payload = {}) {
    const client = this.window?.elephantnote?.api
    if (typeof client?.call !== 'function') throw new Error(`Elephant API is unavailable for ${action}`)
    const response = await client.call(action, payload)
    if (response?.ok === false) throw new Error(response.error?.message || `${action} failed`)
    return response?.data ?? response
  }

  async chat({ messages = [], model = '', route = {} } = {}) {
    const transcript = (Array.isArray(messages) ? messages : [])
      .filter((message) => message && typeof message === 'object' && String(message.content || '').trim())
      .map((message) => `${String(message.role || 'user').toUpperCase()}:\n${String(message.content || '').trim()}`)
      .join('\n\n')
    const prompt = [
      route.systemPrompt ? `System instructions:\n${route.systemPrompt}` : '',
      'You are answering inside Elephant. Use only the supplied conversation and note context. Do not inspect the filesystem or execute commands.',
      transcript
    ].filter(Boolean).join('\n\n')
    const result = await this.service('codex.chat', { model, prompt }, { timeoutMs: 120000 })
    return {
      answer: String(result?.answer || '').trim(),
      provider: PROVIDER_ID,
      model: String(result?.model || model || '').trim(),
      threadId: result?.threadId || result?.thread_id || ''
    }
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-codex-settings')
    container.replaceChildren(root)
    let disposed = false

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Checking ChatGPT subscription…'))
      try {
        const status = await this.service('codex.status').catch((error) => ({ connected: false, error: error.message || String(error) }))
        const connected = status?.connected === true
        const [usage, models] = connected
          ? await Promise.all([
              this.service('codex.usage').catch(() => null),
              this.service('codex.models').catch(() => null)
            ])
          : [null, null]
        if (disposed) return
        root.replaceChildren()
        const header = node(documentRef, 'div', 'elephant-codex-header')
        const copy = node(documentRef, 'div')
        copy.append(node(documentRef, 'h4', '', 'ChatGPT subscription'), node(documentRef, 'p', '', connected ? 'Connected' : 'Disconnected'))
        const actions = node(documentRef, 'div', 'elephant-codex-actions')
        const primary = node(documentRef, 'button', '', connected ? 'Disconnect' : 'Connect')
        primary.onclick = async () => {
          primary.disabled = true
          try {
            const result = await this.service(connected ? 'codex.logout' : 'codex.login')
            const loginUrl = result?.authUrl || result?.url || result?.loginUrl
            if (loginUrl) {
              const opener = this.window?.__TAURI__?.opener
              if (typeof opener?.openUrl === 'function') await opener.openUrl(loginUrl)
              else this.window.open(loginUrl, '_blank', 'noopener,noreferrer')
            }
            await refresh()
          } finally {
            primary.disabled = false
          }
        }
        const reload = node(documentRef, 'button', '', 'Refresh')
        reload.onclick = () => void refresh()
        actions.append(primary, reload)
        header.append(copy, actions)
        root.append(header)

        const details = node(documentRef, 'div', 'elephant-codex-details')
        const account = status?.account || ''
        if (account) details.append(node(documentRef, 'p', '', `Account: ${typeof account === 'string' ? account : account.email || account.name || 'Connected'}`))
        const modelList = Array.isArray(models?.data) ? models.data : Array.isArray(models) ? models : []
        details.append(node(documentRef, 'p', '', `Models: ${modelList.length}`))
        if (usage) {
          const hourly = usage.hourly || usage.fiveHour || usage.short || usage.primary
          const weekly = usage.weekly || usage.sevenDay || usage.long || usage.secondary
          if (hourly) details.append(node(documentRef, 'p', '', `Hourly: ${hourly.remaining ?? hourly.percentRemaining ?? hourly.used ?? 'available'}`))
          if (weekly) details.append(node(documentRef, 'p', '', `Weekly: ${weekly.remaining ?? weekly.percentRemaining ?? weekly.used ?? 'available'}`))
        }
        if (status?.runtimePath) details.append(node(documentRef, 'p', '', `Runtime: ${status.runtimePath}`))
        if (status?.error) details.append(node(documentRef, 'p', 'elephant-package-error', String(status.error)))
        root.append(details)
      } catch (error) {
        if (!disposed) root.replaceChildren(node(documentRef, 'p', 'elephant-package-error', error instanceof Error ? error.message : String(error)))
      }
    }

    void refresh()
    return () => { disposed = true; root.remove() }
  }

  async disableRoutes() {
    const config = await this.call('ai.config.get').catch(() => null)
    if (!config) return
    const routes = { ...(config.routes || {}) }
    const chat = routes.chat || {}
    const owned = chat.source === PROVIDER_ID || chat.provider === PROVIDER_ID || config.provider === PROVIDER_ID
    if (!owned) return
    routes.chat = { ...chat, source: 'disabled', provider: 'disabled', transport: 'disabled', endpoint: '', model: '' }
    await this.call('ai.config.set', { ...config, provider: 'disabled', transport: 'disabled', endpoint: '', model: '', routes }).catch(() => {})
  }

  async onload(api) {
    await api.native.service.start()
    api.ui.registerStyle(`
      .elephant-codex-settings { display:grid; gap:14px; padding:14px; border:1px solid var(--en-border); border-radius:14px; background:var(--en-surface); }
      .elephant-codex-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-codex-header h4,.elephant-codex-header p,.elephant-codex-details p { margin:0; }
      .elephant-codex-header p,.elephant-codex-details { color:var(--en-muted); font-size:12px; }
      .elephant-codex-actions { display:flex; gap:8px; }
      .elephant-codex-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-codex-details { display:grid; gap:6px; }
      .elephant-package-error { color:var(--en-danger,#b42318); }
    `, 'codex-package')

    api.workspace.registerContribution('ai.providers', {
      id: `${ADDON_ID}.provider`,
      providerId: PROVIDER_ID,
      title: 'Codex subscription',
      description: 'ChatGPT subscription through the package-owned Codex service.',
      transport: 'addon-service',
      endpoint: 'addon-service://elephant.codex-connection',
      settingsSection: 'ai',
      capabilities: ['chat'],
      getModels: async () => {
        const result = await this.service('codex.models')
        return Array.isArray(result?.data) ? result.data : Array.isArray(result) ? result : []
      },
      chat: (request) => this.chat(request)
    })

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: 'ai.providers.after-external',
      chrome: false,
      title: 'ChatGPT subscription',
      description: 'Connect or disconnect ChatGPT and review limits.',
      order: 30,
      render: (container) => this.render(container)
    })
  }

  async onunload() {
    await this.disableRoutes()
    await this.api.native.service.stop().catch(() => {})
  }
}

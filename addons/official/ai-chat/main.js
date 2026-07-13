const ADDON_ID = 'elephant.ai-chat'
const ACTION_ID = `${ADDON_ID}.toggle`
const SEARCH_RESOURCE = 'search.provider'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}))
const providerSource = (provider = {}) => provider.type === 'openai-compatible' ? 'api' : String(provider.id || provider.type || '').trim()
const normalizeMessages = (messages = []) => (Array.isArray(messages) ? messages : [])
  .filter((message) => message && typeof message === 'object')
  .map((message) => ({ role: String(message.role || 'user'), content: String(message.content || '') }))
  .filter((message) => message.content.trim())

const endpointFor = (provider = {}) => {
  const raw = String(provider.endpoint || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  if (/\/chat\/completions$/i.test(raw) || /\/api\/chat$/i.test(raw)) return raw
  if (provider.type === 'ollama') return `${raw}/api/chat`
  return `${raw}/chat/completions`
}

export default class ElephantChatAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.messages = []
    this.abort = null
  }

  async call(action, payload = {}) {
    const client = this.window?.elephantnote?.api
    if (typeof client?.call !== 'function') throw new Error(`Elephant API is unavailable for ${action}`)
    const response = await client.call(action, payload)
    if (response?.ok === false) throw new Error(response.error?.message || `${action} failed`)
    return response?.data ?? response
  }

  getVaultStore() {
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    return bridge?.getStore?.(this.api.app.pinia, 'elephantnoteVaults') || null
  }

  providerEntries() {
    return (this.api.app.addons?.getContributions?.('ai.providers') || [])
      .map((entry) => ({ addonId: entry.addonId, ...(entry.contribution || {}) }))
      .filter((provider) => provider.providerId && Array.isArray(provider.capabilities) && provider.capabilities.includes('chat'))
  }

  async config() {
    const value = await this.call('ai.config.get').catch(() => ({}))
    return value && typeof value === 'object' ? value : {}
  }

  async providerOptions(config = null) {
    const current = config || await this.config()
    const options = this.providerEntries().map((provider) => ({
      source: provider.providerId,
      label: provider.title || provider.providerId,
      kind: 'addon',
      provider
    }))
    for (const provider of Array.isArray(current.providers?.list) ? current.providers.list : []) {
      if (provider?.enabled === false) continue
      const source = providerSource(provider)
      if (!source || options.some((option) => option.source === source)) continue
      options.push({ source, label: provider.label || source, kind: 'external', provider })
    }
    return options
  }

  async retrieveContext(message, limit = 8) {
    const search = this.api.resources.get(SEARCH_RESOURCE)
    if (!search || typeof search.query !== 'function') return []
    try {
      const results = await search.query(message, { limit })
      return Array.isArray(results) ? results : []
    } catch (error) {
      console.warn('[ai-chat] search context unavailable', error)
      return []
    }
  }

  async sendExternal(provider, route, messages, signal) {
    const endpoint = endpointFor(provider)
    if (!endpoint) throw new Error(`Provider ${provider.label || provider.type || 'API'} has no endpoint`)
    const headers = {
      'Content-Type': 'application/json',
      ...(provider.headers && typeof provider.headers === 'object' ? provider.headers : {})
    }
    if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`
    const model = String(route.model || provider.model || '').trim()
    const body = provider.type === 'ollama'
      ? { model, messages, stream: false }
      : {
          model,
          messages,
          stream: false,
          temperature: Number(route.temperature ?? 0.2),
          max_tokens: Math.max(1, Number(route.maxTokens || 2048))
        }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error?.message || data?.message || `Provider returned HTTP ${response.status}`)
    const answer = provider.type === 'ollama'
      ? data?.message?.content || data?.response
      : data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text
    if (!String(answer || '').trim()) throw new Error('Provider returned an empty answer')
    return { answer: String(answer).trim(), model, provider: providerSource(provider) }
  }

  async sendChat(message, history = []) {
    const config = await this.config()
    const route = {
      source: 'disabled',
      model: '',
      temperature: 0.2,
      maxTokens: 2048,
      contextWindow: 8192,
      ragTopK: 8,
      enableRag: true,
      ...(config.routes?.chat || {})
    }
    const source = String(route.source || route.provider || config.provider || 'disabled').trim()
    if (!source || source === 'disabled') throw new Error('No installed chat provider is selected')

    const citations = route.enableRag === false ? [] : await this.retrieveContext(message, route.ragTopK)
    const context = citations.length
      ? `Relevant Elephant notes:\n${citations.map((item, index) => `[${index + 1}] ${item.title || item.path || item.id}\n${item.excerpt || ''}`).join('\n\n')}`
      : ''
    const messages = normalizeMessages([
      ...(route.systemPrompt ? [{ role: 'system', content: route.systemPrompt }] : []),
      ...(context ? [{ role: 'system', content: context }] : []),
      ...history
    ])

    const option = (await this.providerOptions(config)).find((candidate) => candidate.source === source)
    if (!option) throw new Error(`The selected provider is not installed or configured: ${source}`)

    this.abort?.abort()
    this.abort = new AbortController()
    let result
    if (option.kind === 'addon') {
      if (typeof option.provider.chat !== 'function') throw new Error(`${option.label} does not expose chat execution`)
      result = await option.provider.chat({
        messages,
        model: route.model,
        route: clone(route),
        config: clone(config),
        signal: this.abort.signal
      })
    } else {
      result = await this.sendExternal(option.provider, route, messages, this.abort.signal)
    }
    return {
      ...result,
      answer: String(result?.answer || result?.content || '').trim(),
      citations
    }
  }

  renderChat(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-chat-package')
    const history = node(documentRef, 'div', 'elephant-chat-history')
    const form = node(documentRef, 'form', 'elephant-chat-form')
    const input = node(documentRef, 'textarea')
    input.placeholder = 'Ask about your notes…'
    input.rows = 3
    const send = node(documentRef, 'button', '', 'Send')
    send.type = 'submit'
    form.append(input, send)
    root.append(history, form)
    container.replaceChildren(root)

    const renderHistory = () => {
      history.replaceChildren()
      if (!this.messages.length) history.append(node(documentRef, 'p', 'elephant-chat-empty', 'Ask a question about the active vault.'))
      for (const message of this.messages) {
        const article = node(documentRef, 'article', `elephant-chat-message ${message.role}`)
        article.append(node(documentRef, 'strong', '', message.role === 'user' ? 'You' : 'Assistant'))
        article.append(node(documentRef, 'p', '', message.content))
        if (Array.isArray(message.citations) && message.citations.length) {
          const citations = node(documentRef, 'small', '', message.citations.map((item) => item.title || item.path || item.id).filter(Boolean).join(' · '))
          article.append(citations)
        }
        history.append(article)
      }
      history.scrollTop = history.scrollHeight
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const text = input.value.trim()
      if (!text || send.disabled) return
      this.messages.push({ role: 'user', content: text })
      input.value = ''
      send.disabled = true
      send.textContent = 'Thinking…'
      renderHistory()
      try {
        const result = await this.sendChat(text, this.messages.map(({ role, content }) => ({ role, content })))
        this.messages.push({
          role: 'assistant',
          content: result.answer || 'No answer returned.',
          citations: result.citations || []
        })
      } catch (error) {
        this.messages.push({ role: 'assistant', content: error instanceof Error ? error.message : String(error) })
      } finally {
        send.disabled = false
        send.textContent = 'Send'
        renderHistory()
      }
    })

    renderHistory()
    return () => root.remove()
  }

  async renderSettings(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-chat-settings')
    container.replaceChildren(root)
    let config = await this.config()
    const route = { source: 'disabled', model: '', temperature: 0.2, maxTokens: 2048, ...(config.routes?.chat || {}) }
    const options = await this.providerOptions(config)

    const field = (label, input) => {
      const wrapper = node(documentRef, 'label', 'elephant-chat-field')
      wrapper.append(node(documentRef, 'span', '', label), input)
      return wrapper
    }
    const source = node(documentRef, 'select')
    const disabled = node(documentRef, 'option', '', 'Disabled')
    disabled.value = 'disabled'
    source.append(disabled)
    for (const option of options) {
      const element = node(documentRef, 'option', '', option.label)
      element.value = option.source
      source.append(element)
    }
    source.value = options.some((option) => option.source === (route.source || route.provider)) ? (route.source || route.provider) : 'disabled'
    const model = node(documentRef, 'input')
    model.value = route.model || ''
    const temperature = node(documentRef, 'input')
    temperature.type = 'number'; temperature.step = '0.1'; temperature.min = '0'; temperature.max = '2'; temperature.value = String(route.temperature ?? 0.2)
    const maxTokens = node(documentRef, 'input')
    maxTokens.type = 'number'; maxTokens.min = '1'; maxTokens.value = String(route.maxTokens || 2048)
    const feedback = node(documentRef, 'p', 'elephant-chat-feedback')

    const save = async () => {
      const nextRoute = {
        ...route,
        source: source.value,
        provider: source.value,
        model: source.value === 'disabled' ? '' : model.value.trim(),
        temperature: Number(temperature.value) || 0,
        maxTokens: Math.max(1, Number(maxTokens.value) || 2048)
      }
      config = await this.call('ai.config.set', {
        ...config,
        provider: nextRoute.provider,
        model: nextRoute.model,
        routes: { ...(config.routes || {}), chat: nextRoute }
      })
      feedback.textContent = 'Saved.'
    }

    const actions = node(documentRef, 'div', 'elephant-chat-actions')
    const saveButton = node(documentRef, 'button', '', 'Save chat route')
    saveButton.onclick = () => void save().catch((error) => { feedback.textContent = error.message || String(error) })
    actions.append(saveButton)
    root.append(
      node(documentRef, 'h4', '', 'Chat route'),
      node(documentRef, 'p', 'elephant-chat-feedback', options.length ? 'Only installed or configured providers are available.' : 'Install a provider addon or configure an external API first.'),
      field('Provider', source), field('Model', model), field('Temperature', temperature), field('Max tokens', maxTokens), actions, feedback
    )
    return () => root.remove()
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-chat-package { height:100%; min-width:320px; display:grid; grid-template-rows:minmax(0,1fr) auto; border-left:1px solid var(--en-border); background:var(--en-bg); }
      .elephant-chat-history { overflow:auto; padding:14px; display:grid; align-content:start; gap:10px; }
      .elephant-chat-empty,.elephant-chat-feedback { color:var(--en-muted); margin:0; }
      .elephant-chat-message { padding:11px 12px; border:1px solid var(--en-border); border-radius:12px; background:var(--en-surface); }
      .elephant-chat-message.user { margin-left:28px; }
      .elephant-chat-message.assistant { margin-right:28px; }
      .elephant-chat-message p { margin:5px 0 0; white-space:pre-wrap; }
      .elephant-chat-message small { display:block; margin-top:7px; color:var(--en-muted); }
      .elephant-chat-form { display:grid; gap:8px; padding:12px; border-top:1px solid var(--en-border); }
      .elephant-chat-form textarea,.elephant-chat-field input,.elephant-chat-field select { width:100%; box-sizing:border-box; padding:9px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); }
      .elephant-chat-form button,.elephant-chat-actions button { min-height:34px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-accent,#111827); color:white; cursor:pointer; }
      .elephant-chat-settings { display:grid; gap:10px; }
      .elephant-chat-settings h4,.elephant-chat-settings p { margin:0; }
      .elephant-chat-field { display:grid; gap:5px; color:var(--en-muted); font-size:11px; }
      .elephant-chat-actions { display:flex; justify-content:flex-end; }
    `, 'ai-chat-package')

    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')
    const component = bridge.createDomComponent({
      name: 'ElephantPhysicalChatSidebar',
      className: 'elephant-physical-chat-host',
      mount: (container) => this.renderChat(container)
    })

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: 'ai.chat',
      chrome: false,
      title: 'Chat',
      description: 'Choose the provider and model used by chat.',
      order: 20,
      render: (container) => this.renderSettings(container)
    })

    api.layout.registerZone({
      id: `${ADDON_ID}.sidebar`,
      zone: 'shell.right',
      order: 40,
      component,
      when: () => this.getVaultStore()?.chatSidebarOpen === true
    })

    api.commands.register({
      id: ACTION_ID,
      title: 'Toggle AI chat',
      run: () => {
        const store = this.getVaultStore()
        if (!store) throw new Error('Vault store is unavailable')
        if (typeof store.toggleChatSidebar === 'function') store.toggleChatSidebar()
        else store.chatSidebarOpen = !store.chatSidebarOpen
        return { open: store.chatSidebarOpen }
      }
    })

    api.workspace.registerSidebarItem({
      id: `${ADDON_ID}.sidebar-item`,
      title: 'Chat',
      tooltip: 'AI chat',
      icon: 'message-circle',
      actionId: ACTION_ID,
      order: 46
    })
  }

  onunload() {
    this.abort?.abort()
    const store = this.getVaultStore()
    if (store) store.chatSidebarOpen = false
  }
}

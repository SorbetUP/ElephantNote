const ADDON_ID = 'elephant.ai-chat'
const ACTION_ID = `${ADDON_ID}.toggle`

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
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
        const result = await this.call('rag.chat', {
          message: text,
          limit: 8,
          messages: this.messages.map(({ role, content }) => ({ role, content }))
        })
        this.messages.push({
          role: 'assistant',
          content: String(result?.answer || result?.content || 'No answer returned.'),
          citations: result?.citations || []
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
    let config = await this.call('ai.config.get').catch(() => ({}))
    const route = { source: 'disabled', model: '', temperature: 0.2, maxTokens: 2048, ...(config.routes?.chat || {}) }

    const field = (label, input) => {
      const wrapper = node(documentRef, 'label', 'elephant-chat-field')
      wrapper.append(node(documentRef, 'span', '', label), input)
      return wrapper
    }
    const source = node(documentRef, 'input')
    source.value = route.source || route.provider || 'disabled'
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
        source: source.value.trim() || 'disabled',
        provider: source.value.trim() || 'disabled',
        model: model.value.trim(),
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
      node(documentRef, 'p', 'elephant-chat-feedback', 'Choose an installed provider id and model.'),
      field('Provider id', source), field('Model', model), field('Temperature', temperature), field('Max tokens', maxTokens), actions, feedback
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
      .elephant-chat-form textarea,.elephant-chat-field input { width:100%; box-sizing:border-box; padding:9px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); }
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
    const store = this.getVaultStore()
    if (store) store.chatSidebarOpen = false
  }
}

import { createAiInferenceResource } from './inference'

const ADDON_ID = 'elephant.ai'
const CONFIG_KEY = 'provider-config'
const PAGE_DEFINITIONS = Object.freeze([
  { id: 'providers', label: 'Providers', slot: '' },
  { id: 'chat', label: 'Chat', slot: 'ai.chat' },
  { id: 'search', label: 'Search', slot: 'ai.search' },
  { id: 'ocr', label: 'OCR', slot: 'ai.ocr' }
])

const PROVIDER_DEFAULTS = Object.freeze({
  'openai-compatible': {
    label: 'OpenAI-compatible API',
    endpoint: 'https://api.openai.com/v1',
    chatModel: '',
    embeddingModel: ''
  },
  openrouter: {
    label: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
    chatModel: '',
    embeddingModel: ''
  },
  mistral: {
    label: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1',
    chatModel: '',
    embeddingModel: ''
  }
})

const EMPTY_CONFIG = Object.freeze({
  providers: { list: [] },
  routes: {}
})

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const clone = (value) => JSON.parse(JSON.stringify(value ?? {}))

export default class ElephantAiAddon {
  constructor(api) {
    this.api = api
    this.activePage = 'providers'
    this.config = clone(EMPTY_CONFIG)
    this.providers = []
    this.renderRoot = null
    this.saveTimer = 0
    this.stopManagerWatch = null
  }

  getContributions() {
    return this.api.app.addons?.getContributions?.('settings.sections') || []
  }

  visiblePages() {
    const slots = new Set(this.getContributions()
      .filter((entry) => entry?.contribution?.section === 'ai')
      .map((entry) => entry?.contribution?.slot)
      .filter(Boolean))
    return PAGE_DEFINITIONS.filter((page) => !page.slot || slots.has(page.slot))
  }

  async loadConfig() {
    const stored = await this.api.storage.get(CONFIG_KEY)
    const config = stored && typeof stored === 'object' ? stored : clone(EMPTY_CONFIG)
    this.config = {
      ...clone(EMPTY_CONFIG),
      ...clone(config),
      providers: {
        ...clone(EMPTY_CONFIG.providers),
        ...clone(config?.providers || {})
      },
      routes: {
        ...clone(EMPTY_CONFIG.routes),
        ...clone(config?.routes || {})
      }
    }
    this.providers = Array.isArray(this.config.providers.list)
      ? clone(this.config.providers.list)
      : []
    return this.config
  }

  scheduleSave() {
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => void this.saveConfig(), 500)
  }

  async saveConfig() {
    clearTimeout(this.saveTimer)
    const payload = {
      ...clone(this.config),
      providers: {
        ...clone(this.config?.providers || {}),
        list: clone(this.providers)
      },
      routes: clone(this.config?.routes || {})
    }
    await this.api.storage.set(CONFIG_KEY, payload)
    this.config = payload
    globalThis.dispatchEvent?.(new CustomEvent('elephantnote:ai-config-changed', { detail: this.config }))
    this.api.app.emit?.('ai:config-changed', clone(this.config))
    return this.config
  }

  createProvider(type = 'openai-compatible') {
    const defaults = PROVIDER_DEFAULTS[type] || {}
    return {
      id: `provider-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      type,
      label: defaults.label || 'Provider',
      endpoint: defaults.endpoint || '',
      apiKey: '',
      headers: {},
      chatModel: defaults.chatModel || '',
      embeddingModel: defaults.embeddingModel || '',
      enabled: true
    }
  }

  async onload(api) {
    await this.loadConfig()
    api.resources.provide('ai.config', Object.freeze({
      get: async () => clone(await this.loadConfig()),
      set: async (config) => {
        this.config = config && typeof config === 'object' ? clone(config) : clone(EMPTY_CONFIG)
        this.providers = Array.isArray(this.config?.providers?.list)
          ? clone(this.config.providers.list)
          : []
        return await this.saveConfig()
      },
      listProviders: async () => {
        await this.loadConfig()
        return clone(this.providers.filter((provider) => provider?.enabled !== false))
      }
    }))
    api.resources.provide('ai.inference', createAiInferenceResource(api, () => this.loadConfig()))

    api.ui.registerStyle(`
      .elephant-ai-settings { display: grid; gap: 14px; }
      .elephant-ai-tabs { display: flex; gap: 4px; padding: 5px; overflow-x: auto; border: 1px solid var(--en-border); border-radius: 11px; background: var(--en-soft); }
      .elephant-ai-tabs button { min-height: 32px; padding: 0 12px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--en-muted); cursor: pointer; }
      .elephant-ai-tabs button.active { border-color: var(--en-border); background: var(--en-surface); color: var(--en-text); }
      .elephant-ai-card { overflow: hidden; border: 1px solid var(--en-border); border-radius: 14px; background: var(--en-surface); }
      .elephant-ai-card-header { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 15px 16px; border-bottom: 1px solid var(--en-border); }
      .elephant-ai-card-header h4, .elephant-ai-card-header p { margin: 0; }
      .elephant-ai-card-header p { margin-top: 4px; color: var(--en-muted); font-size: 12px; }
      .elephant-ai-provider { padding: 14px 16px; border-top: 1px solid var(--en-border); }
      .elephant-ai-provider:first-child { border-top: 0; }
      .elephant-ai-provider-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .elephant-ai-provider-grid label { display: grid; gap: 5px; color: var(--en-muted); font-size: 11px; }
      .elephant-ai-provider-grid label.wide { grid-column: 1 / -1; }
      .elephant-ai-provider-grid input, .elephant-ai-provider-grid select { width: 100%; box-sizing: border-box; padding: 8px 9px; border: 1px solid var(--en-border); border-radius: 8px; background: var(--en-surface); color: var(--en-text); }
      .elephant-ai-provider-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
      .elephant-ai-provider-actions button, .elephant-ai-card-header button { min-height: 34px; padding: 0 11px; border: 1px solid var(--en-border); border-radius: 9px; background: var(--en-surface); color: var(--en-text); cursor: pointer; }
      .elephant-ai-empty { padding: 18px; color: var(--en-muted); }
      .elephant-ai-slot { min-height: 1px; }
      @media (max-width: 760px) { .elephant-ai-provider-grid { grid-template-columns: 1fr; } .elephant-ai-provider-grid label.wide { grid-column: auto; } }
    `, 'physical-ai-settings')

    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      navigationLabel: 'AI',
      navigationIcon: 'sparkles',
      standalone: true,
      chrome: false,
      title: 'AI',
      description: 'Configure API providers and separately installed AI modules.',
      order: 60,
      render: (container) => this.renderSettings(container)
    })
  }

  renderSettings(container) {
    const documentRef = container?.ownerDocument
    if (!documentRef || !container) return () => {}
    const root = node(documentRef, 'div', 'elephant-ai-settings')
    container.replaceChildren(root)
    this.renderRoot = root

    const render = () => {
      if (!root.isConnected) return
      const pages = this.visiblePages()
      if (!pages.some((page) => page.id === this.activePage)) this.activePage = 'providers'
      root.replaceChildren()

      const tabs = node(documentRef, 'nav', 'elephant-ai-tabs')
      tabs.setAttribute('aria-label', 'AI settings')
      for (const page of pages) {
        const button = node(documentRef, 'button', page.id === this.activePage ? 'active' : '', page.label)
        button.type = 'button'
        button.addEventListener('click', () => {
          this.activePage = page.id
          render()
        })
        tabs.append(button)
      }
      root.append(tabs)

      const active = pages.find((page) => page.id === this.activePage) || pages[0]
      if (active.id === 'providers') this.renderProviders(documentRef, root)
      else {
        const slot = node(documentRef, 'div', 'elephant-ai-slot')
        slot.setAttribute('data-elephant-addon-settings-slot', active.slot)
        slot.dataset.activeAddonSlotKey = active.id
        root.append(slot)
      }
    }

    void this.loadConfig().then(render).catch((error) => {
      root.textContent = error instanceof Error ? error.message : String(error)
    })
    this.stopManagerWatch = this.api.app.addons?.on?.('contribution:changed', render) || null

    return () => {
      clearTimeout(this.saveTimer)
      this.stopManagerWatch?.()
      this.stopManagerWatch = null
      this.renderRoot = null
      root.remove()
    }
  }

  renderProviders(documentRef, root) {
    const card = node(documentRef, 'section', 'elephant-ai-card')
    const header = node(documentRef, 'header', 'elephant-ai-card-header')
    const heading = node(documentRef, 'div')
    heading.append(
      node(documentRef, 'h4', '', 'External API providers'),
      node(documentRef, 'p', '', 'Configured chat and embedding models are exposed through the versioned ai.inference resource.')
    )
    const addButton = node(documentRef, 'button', '', 'Add provider')
    addButton.type = 'button'
    addButton.addEventListener('click', () => {
      this.providers.push(this.createProvider())
      this.scheduleSave()
      this.renderProvidersPageAgain()
    })
    header.append(heading, addButton)
    card.append(header)

    if (!this.providers.length) {
      card.append(node(documentRef, 'div', 'elephant-ai-empty', 'No external API provider configured.'))
    } else {
      this.providers.forEach((provider, index) => card.append(this.renderProvider(documentRef, provider, index)))
    }
    root.append(card)

    const providerSlot = node(documentRef, 'div', 'elephant-ai-slot')
    providerSlot.setAttribute('data-elephant-addon-settings-slot', 'ai.providers.after-external')
    root.append(providerSlot)
  }

  renderProvidersPageAgain() {
    const root = this.renderRoot
    if (!root?.isConnected) return
    const activeButton = [...root.querySelectorAll('.elephant-ai-tabs button')]
      .find((button) => button.classList.contains('active'))
    if (activeButton?.textContent !== 'Providers') return
    const tabs = root.querySelector('.elephant-ai-tabs')
    root.replaceChildren(tabs)
    this.renderProviders(root.ownerDocument, root)
  }

  renderProvider(documentRef, provider, index) {
    const article = node(documentRef, 'article', 'elephant-ai-provider')
    const grid = node(documentRef, 'div', 'elephant-ai-provider-grid')

    const bind = (label, control, key, transform = (value) => value, wide = false) => {
      const wrapper = node(documentRef, 'label', wide ? 'wide' : '')
      wrapper.append(node(documentRef, 'span', '', label), control)
      control.addEventListener('change', () => {
        provider[key] = transform(control.type === 'checkbox' ? control.checked : control.value)
        this.scheduleSave()
      })
      return wrapper
    }

    const type = node(documentRef, 'select')
    for (const [value, defaults] of Object.entries(PROVIDER_DEFAULTS)) {
      const option = node(documentRef, 'option', '', defaults.label)
      option.value = value
      option.selected = provider.type === value
      type.append(option)
    }
    type.addEventListener('change', () => {
      provider.type = type.value
      const defaults = PROVIDER_DEFAULTS[type.value] || {}
      provider.label = defaults.label || provider.label
      provider.endpoint = defaults.endpoint || provider.endpoint
      this.scheduleSave()
      this.renderProvidersPageAgain()
    })

    const name = node(documentRef, 'input')
    name.type = 'text'
    name.value = provider.label || ''
    const endpoint = node(documentRef, 'input')
    endpoint.type = 'url'
    endpoint.value = provider.endpoint || ''
    const apiKey = node(documentRef, 'input')
    apiKey.type = 'password'
    apiKey.autocomplete = 'off'
    apiKey.value = provider.apiKey || ''
    const chatModel = node(documentRef, 'input')
    chatModel.type = 'text'
    chatModel.value = provider.chatModel || ''
    chatModel.placeholder = 'Chat model id'
    const embeddingModel = node(documentRef, 'input')
    embeddingModel.type = 'text'
    embeddingModel.value = provider.embeddingModel || ''
    embeddingModel.placeholder = 'Embedding model id'
    const enabled = node(documentRef, 'input')
    enabled.type = 'checkbox'
    enabled.checked = provider.enabled !== false

    grid.append(
      bind('Type', type, 'type'),
      bind('Name', name, 'label'),
      bind('Base URL', endpoint, 'endpoint', (value) => value.trim(), true),
      bind('API key', apiKey, 'apiKey'),
      bind('Enabled', enabled, 'enabled', Boolean),
      bind('Chat model', chatModel, 'chatModel'),
      bind('Embedding model', embeddingModel, 'embeddingModel')
    )

    const actions = node(documentRef, 'div', 'elephant-ai-provider-actions')
    const remove = node(documentRef, 'button', '', 'Remove')
    remove.type = 'button'
    remove.addEventListener('click', () => {
      this.providers.splice(index, 1)
      this.scheduleSave()
      this.renderProvidersPageAgain()
    })
    actions.append(remove)
    article.append(grid, actions)
    return article
  }
}

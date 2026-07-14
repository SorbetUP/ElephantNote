const ADDON_ID = 'elephant.open-models'
const PROVIDER_ID = 'app-local'
const VIEW_ID = `${ADDON_ID}.workspace`
const AI_CONFIG_RESOURCE = 'ai.config'
const MODELS_RESOURCE = 'models.provider'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantOpenModelsAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  aiConfig() {
    const resource = this.api.resources.get(AI_CONFIG_RESOURCE)
    if (!resource?.get || !resource?.set) {
      throw new Error('The AI addon must be installed and enabled before Open Models can configure routes.')
    }
    return resource
  }

  service(method, params = {}, options = {}) {
    return this.api.native.service.call(method, params, options)
  }

  async modelList() {
    const result = await this.service('models.list')
    return Array.isArray(result?.models) ? result.models : Array.isArray(result) ? result : []
  }

  chat({ messages = [], model = '', route = {}, config = {} } = {}) {
    return this.service('models.chat', { messages, model, route, config }, { timeoutMs: 120000 })
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-models-package')
    container.replaceChildren(root)
    let disposed = false

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Loading models…'))
      try {
        const [models, active] = await Promise.all([
          this.modelList(),
          this.service('models.active').catch(() => null)
        ])
        if (disposed) return
        root.replaceChildren()
        const header = node(documentRef, 'header', 'elephant-package-header')
        const copy = node(documentRef, 'div')
        copy.append(node(documentRef, 'h2', '', 'Open Models'), node(documentRef, 'p', '', `${models.length} local models`))
        const actions = node(documentRef, 'div', 'elephant-package-actions')
        const input = node(documentRef, 'input')
        input.placeholder = 'Hugging Face repository or direct GGUF URL'
        const download = node(documentRef, 'button', '', 'Download')
        download.onclick = async () => {
          const id = input.value.trim()
          if (!id) return
          download.disabled = true
          download.textContent = 'Downloading…'
          try {
            await this.service('models.download', { id }, { timeoutMs: 120000 })
            input.value = ''
            await refresh()
          } finally {
            download.disabled = false
            download.textContent = 'Download'
          }
        }
        const reload = node(documentRef, 'button', '', 'Refresh')
        reload.onclick = () => void refresh()
        actions.append(input, download, reload)
        header.append(copy, actions)
        root.append(header)

        const list = node(documentRef, 'div', 'elephant-model-list')
        if (!models.length) list.append(node(documentRef, 'p', 'elephant-package-muted', 'No local model installed.'))
        for (const model of models) {
          const id = String(model.id || model.modelId || model.repoId || model.path || '')
          const article = node(documentRef, 'article', 'elephant-model-card')
          article.append(node(documentRef, 'strong', '', model.name || model.label || id || 'Unnamed model'))
          article.append(node(documentRef, 'small', '', [model.fileName, model.size ? `${Math.round(Number(model.size) / 1024 / 1024)} MB` : '', model.status].filter(Boolean).join(' · ')))
          const buttons = node(documentRef, 'div', 'elephant-package-actions')
          const isActive = String(active?.id || active?.repoId || active?.path || '') === id || model.active === true
          const activate = node(documentRef, 'button', '', isActive ? 'Deactivate' : 'Activate')
          activate.onclick = async () => {
            await this.service(isActive ? 'models.deactivate' : 'models.activate', { id })
            await refresh()
          }
          const remove = node(documentRef, 'button', '', 'Remove')
          remove.onclick = async () => {
            await this.service('models.delete', { id })
            await refresh()
          }
          buttons.append(activate, remove)
          article.append(buttons)
          list.append(article)
        }
        root.append(list)
      } catch (error) {
        if (!disposed) root.replaceChildren(node(documentRef, 'p', 'elephant-package-error', error instanceof Error ? error.message : String(error)))
      }
    }

    void refresh()
    return () => { disposed = true; root.remove() }
  }

  async enableLocalRuntime() {
    const configResource = this.aiConfig()
    const config = await configResource.get()
    const localAi = { ...(config.localAi || {}) }
    if (localAi.enabled && localAi.showModelLibraryInSidebar && localAi.allowHuggingFaceDownloads) return
    await configResource.set({
      ...config,
      localAi: {
        ...localAi,
        enabled: true,
        showModelLibraryInSidebar: true,
        allowHuggingFaceDownloads: true,
        allowLocalRuntimeAutostart: true
      }
    })
  }

  async onload(api) {
    await api.native.service.start()
    api.ui.registerStyle(`
      .elephant-models-package { height:100%; overflow:auto; box-sizing:border-box; display:grid; align-content:start; gap:14px; padding:18px; }
      .elephant-package-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-package-header h2,.elephant-package-header p { margin:0; }
      .elephant-package-header p,.elephant-package-muted { color:var(--en-muted); }
      .elephant-package-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .elephant-package-actions input { min-width:260px; min-height:34px; padding:0 10px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); }
      .elephant-package-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-model-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
      .elephant-model-card { display:grid; gap:9px; padding:14px; border:1px solid var(--en-border); border-radius:13px; background:var(--en-surface); }
      .elephant-model-card small { color:var(--en-muted); }
      .elephant-package-error { color:var(--en-danger,#b42318); }
    `, 'open-models-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')

    api.resources.provide(MODELS_RESOURCE, Object.freeze({
      apiVersion: 1,
      owner: ADDON_ID,
      list: () => this.modelList(),
      active: () => this.service('models.active'),
      download: (params = {}) => this.service('models.download', params, { timeoutMs: 120000 }),
      downloadStatus: (params = {}) => this.service('models.download-status', params),
      cancelDownload: (params = {}) => this.service('models.cancel-download', params),
      activate: (params = {}) => this.service('models.activate', params),
      deactivate: (params = {}) => this.service('models.deactivate', params),
      remove: (params = {}) => this.service('models.delete', params),
      refreshIndex: () => this.service('models.refresh-index'),
      chat: (request = {}) => this.chat(request)
    }))

    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Models',
      description: 'Browse, download and manage package-owned local GGUF models.',
      icon: 'database',
      kind: 'open-models-v3',
      component: bridge.createDomComponent({ name: 'ElephantPhysicalModels', mount: (container) => this.render(container) }),
      order: 45
    })

    api.workspace.registerContribution('ai.providers', {
      id: `${ADDON_ID}.provider`,
      providerId: PROVIDER_ID,
      title: 'Open Models',
      description: 'Run a downloaded GGUF model with the package-owned llama.cpp service.',
      transport: 'addon-service',
      endpoint: 'addon-service://elephant.open-models',
      capabilities: ['chat'],
      getModels: () => this.modelList(),
      chat: (request) => this.chat(request)
    })

    await this.enableLocalRuntime()
  }

  async onunload() {
    const configResource = this.api.resources.get(AI_CONFIG_RESOURCE)
    const config = await configResource?.get?.().catch(() => null)
    if (config && configResource?.set) {
      const routes = { ...(config.routes || {}) }
      for (const name of ['chat', 'embedding']) {
        const route = routes[name] || {}
        if (route.source === PROVIDER_ID || route.provider === PROVIDER_ID) {
          routes[name] = { ...route, source: 'disabled', provider: 'disabled', transport: 'disabled', endpoint: '', model: '' }
        }
      }
      await configResource.set({ ...config, localAi: { ...(config.localAi || {}), enabled: false }, routes }).catch(() => {})
    }
    await this.api.native.service.stop().catch(() => {})
  }
}

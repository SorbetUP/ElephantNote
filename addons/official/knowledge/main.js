const ADDON_ID = 'elephant.knowledge'
const RESOURCE_ID = 'knowledge.provider'

const clone = (value) => JSON.parse(JSON.stringify(value ?? null))

export default class ElephantKnowledgeAddon {
  constructor(api) {
    this.api = api
    this.disposeProvider = null
  }

  call(method, params = {}, options = {}) {
    return this.api.native.service.call(method, params, options)
  }

  provider() {
    return Object.freeze({
      apiVersion: 1,
      owner: ADDON_ID,
      status: () => this.call('knowledge.status'),
      rebuild: () => this.call('knowledge.rebuild', {}, { timeoutMs: 30 * 60 * 1000 }),
      search: (query, options = {}) => this.call('knowledge.search', {
        query: String(query || ''),
        limit: Math.max(1, Number(options.limit || 20))
      }),
      inspect: (relativePath) => this.call('knowledge.inspect', { relativePath: String(relativePath || '') }),
      graph: (options = {}) => this.call('knowledge.graph', {
        includeSuggestions: options.includeSuggestions === true
      }),
      wikiSources: (topic, options = {}) => this.call('knowledge.wiki.sources', {
        topic: String(topic || ''),
        limit: Math.max(1, Number(options.limit || 24))
      }),
      wikiRequest: (topic, options = {}) => this.call('knowledge.wiki.request', {
        topic: String(topic || ''),
        requestedTitle: String(options.requestedTitle || ''),
        limit: Math.max(1, Number(options.limit || 24)),
        maxSections: Math.max(1, Number(options.maxSections || 12))
      }),
      renderWiki: (payload = {}) => this.call('knowledge.wiki.render', clone(payload), {
        timeoutMs: 120000
      }),
      listWikis: (options = {}) => this.call('knowledge.wiki.list', {
        status: options.status || null,
        limit: Math.max(1, Number(options.limit || 100))
      }),
      getWiki: (draftId) => this.call('knowledge.wiki.get', { draftId: String(draftId || '') }),
      saveWiki: (draft) => this.call('knowledge.wiki.save', { draft: clone(draft) }),
      acceptWiki: (draftId) => this.call('knowledge.wiki.accept', { draftId: String(draftId || '') }),
      rejectWiki: (draftId) => this.call('knowledge.wiki.reject', { draftId: String(draftId || '') })
    })
  }

  async renderSettings(container) {
    const documentRef = container.ownerDocument
    const root = documentRef.createElement('section')
    root.className = 'elephant-knowledge-settings'
    const status = documentRef.createElement('p')
    status.textContent = 'Loading knowledge index status…'
    const rebuild = documentRef.createElement('button')
    rebuild.type = 'button'
    rebuild.textContent = 'Rebuild knowledge index'
    const refresh = async () => {
      const value = await this.call('knowledge.status')
      status.textContent = `${value.documents || 0} notes · ${value.chunks || 0} chunks · ${value.explicit_links || value.explicitLinks || 0} links`
    }
    rebuild.onclick = async () => {
      rebuild.disabled = true
      status.textContent = 'Rebuilding the package-owned knowledge index…'
      try {
        const report = await this.call('knowledge.rebuild', {}, { timeoutMs: 30 * 60 * 1000 })
        status.textContent = `Indexed ${report.indexed || 0}; unchanged ${report.unchanged || 0}; removed ${report.removed || 0}.`
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        rebuild.disabled = false
      }
    }
    root.append(status, rebuild)
    container.replaceChildren(root)
    await refresh().catch((error) => { status.textContent = error instanceof Error ? error.message : String(error) })
    return () => root.remove()
  }

  async onload(api) {
    await api.native.service.start()
    this.disposeProvider = api.resources.provide(RESOURCE_ID, this.provider())
    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      chrome: false,
      title: 'Knowledge index',
      description: 'Incremental package-owned index, graph, relations and generated Wiki drafts.',
      order: 18,
      render: (container) => this.renderSettings(container)
    })
    api.commands.register({
      id: `${ADDON_ID}.rebuild`,
      title: 'Rebuild knowledge index',
      run: () => this.call('knowledge.rebuild', {}, { timeoutMs: 30 * 60 * 1000 })
    })
  }

  async onunload() {
    this.disposeProvider?.()
    this.disposeProvider = null
    await this.api.native.service.stop().catch(() => {})
  }
}

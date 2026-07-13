const ADDON_ID = 'elephant.ai-search'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

export default class ElephantSearchAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.saveTimer = 0
  }

  async call(action, payload = {}) {
    const client = this.window?.elephantnote?.api
    if (typeof client?.call !== 'function') throw new Error(`Elephant API is unavailable for ${action}`)
    const response = await client.call(action, payload)
    if (response?.ok === false) throw new Error(response.error?.message || `${action} failed`)
    return response?.data ?? response
  }

  async render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-search-settings')
    container.replaceChildren(root)
    let config = await this.call('ai.config.get').catch(() => ({}))
    const search = { enabled: true, limit: 12, chunkSize: 900, overlap: 120, ...(config.search || {}) }
    const indexing = { autoRebuild: true, ...(config.indexing || {}) }

    const status = node(documentRef, 'p', 'elephant-search-status', 'Loading search status…')
    const refreshStatus = async () => {
      try {
        const result = await this.call('search.status')
        status.textContent = `Index: ${result?.enabled === false ? 'disabled' : 'enabled'} · ${result?.notesIndexed ?? result?.count ?? 0} notes`
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error)
      }
    }

    const scheduleSave = () => {
      clearTimeout(this.saveTimer)
      this.saveTimer = setTimeout(async () => {
        config = await this.call('ai.config.set', {
          ...config,
          search: { ...config.search, ...search },
          indexing: { ...config.indexing, ...indexing }
        })
      }, 500)
    }

    const card = node(documentRef, 'div', 'elephant-search-card')
    const title = node(documentRef, 'div', 'elephant-search-heading')
    title.append(node(documentRef, 'h4', '', 'Semantic search'), node(documentRef, 'p', '', 'Configure indexing and retrieval owned by this addon.'))
    card.append(title, status)

    const field = (label, input) => {
      const wrapper = node(documentRef, 'label', 'elephant-search-field')
      wrapper.append(node(documentRef, 'span', '', label), input)
      return wrapper
    }

    const enabled = node(documentRef, 'input')
    enabled.type = 'checkbox'
    enabled.checked = search.enabled !== false
    enabled.onchange = async () => {
      search.enabled = enabled.checked
      await this.call(enabled.checked ? 'search.enable' : 'search.disable')
      scheduleSave(); await refreshStatus()
    }
    const limit = node(documentRef, 'input')
    limit.type = 'number'; limit.min = '1'; limit.max = '100'; limit.value = String(search.limit)
    limit.onchange = () => { search.limit = Math.max(1, Number(limit.value) || 12); scheduleSave() }
    const chunk = node(documentRef, 'input')
    chunk.type = 'number'; chunk.min = '128'; chunk.value = String(search.chunkSize)
    chunk.onchange = () => { search.chunkSize = Math.max(128, Number(chunk.value) || 900); scheduleSave() }
    const overlap = node(documentRef, 'input')
    overlap.type = 'number'; overlap.min = '0'; overlap.value = String(search.overlap)
    overlap.onchange = () => { search.overlap = Math.max(0, Number(overlap.value) || 0); scheduleSave() }
    const auto = node(documentRef, 'input')
    auto.type = 'checkbox'; auto.checked = indexing.autoRebuild !== false
    auto.onchange = () => { indexing.autoRebuild = auto.checked; scheduleSave() }

    const grid = node(documentRef, 'div', 'elephant-search-grid')
    grid.append(field('Enabled', enabled), field('Result limit', limit), field('Chunk size', chunk), field('Chunk overlap', overlap), field('Automatic rebuild', auto))
    card.append(grid)

    const actions = node(documentRef, 'div', 'elephant-search-actions')
    const rebuild = node(documentRef, 'button', '', 'Rebuild index')
    rebuild.onclick = async () => { status.textContent = 'Rebuilding…'; await this.call('search.rebuild'); await refreshStatus() }
    const clear = node(documentRef, 'button', '', 'Clear index')
    clear.onclick = async () => { await this.call('search.clear'); await refreshStatus() }
    actions.append(rebuild, clear)
    card.append(actions)
    root.append(card)
    await refreshStatus()

    return () => { clearTimeout(this.saveTimer); root.remove() }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-search-settings { display:grid; gap:12px; }
      .elephant-search-card { display:grid; gap:14px; padding:16px; border:1px solid var(--en-border); border-radius:14px; background:var(--en-surface); }
      .elephant-search-heading h4,.elephant-search-heading p,.elephant-search-status { margin:0; }
      .elephant-search-heading p,.elephant-search-status { color:var(--en-muted); font-size:12px; }
      .elephant-search-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .elephant-search-field { display:grid; gap:5px; color:var(--en-muted); font-size:11px; }
      .elephant-search-field input[type=number] { min-height:34px; padding:0 9px; border:1px solid var(--en-border); border-radius:8px; background:var(--en-surface); color:var(--en-text); }
      .elephant-search-actions { display:flex; gap:8px; }
      .elephant-search-actions button { min-height:34px; padding:0 11px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
    `, 'semantic-search-package')
    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: 'ai.search',
      chrome: false,
      title: 'Search',
      description: 'Configure embeddings, chunking and semantic retrieval.',
      order: 30,
      render: (container) => this.render(container)
    })
  }
}

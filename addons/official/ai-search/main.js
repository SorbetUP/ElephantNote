const ADDON_ID = 'elephant.ai-search'
const CONFIG_KEY = 'search-config-v2'
const INDEX_KEY = 'search-index-v2'
const PROVIDER_RESOURCE = 'search.provider'
const KNOWLEDGE_RESOURCE = 'knowledge.provider'
const INDEX_VERSION = 2

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  limit: 12,
  autoRebuild: true,
  excerptLength: 240
})

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const normalizeText = (value = '') => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()

const tokenize = (value = '') => normalizeText(value)
  .split(/[^\p{L}\p{N}_-]+/u)
  .map((token) => token.trim())
  .filter((token) => token.length > 1)

const markdownTitle = (markdown = '', path = '') => {
  const heading = String(markdown).split(/\r?\n/).find((line) => /^#\s+\S/.test(line.trim()))
  if (heading) return heading.trim().replace(/^#\s+/, '').trim()
  const name = String(path).split('/').pop() || 'Untitled'
  return name.replace(/\.md$/i, '') || 'Untitled'
}

const markdownExcerpt = (markdown = '', maxLength = 240) => {
  const plain = String(markdown)
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_~`|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > maxLength ? `${plain.slice(0, maxLength).trimEnd()}…` : plain
}

const termFrequency = (tokens) => {
  const frequencies = Object.create(null)
  for (const token of tokens) frequencies[token] = (frequencies[token] || 0) + 1
  return frequencies
}

const normalizeConfig = (value) => ({
  ...DEFAULT_CONFIG,
  ...(value && typeof value === 'object' ? value : {}),
  enabled: value?.enabled !== false,
  limit: Math.min(100, Math.max(1, Number(value?.limit) || DEFAULT_CONFIG.limit)),
  autoRebuild: value?.autoRebuild !== false,
  excerptLength: Math.min(1000, Math.max(80, Number(value?.excerptLength) || DEFAULT_CONFIG.excerptLength))
})

const emptyIndex = () => ({
  version: INDEX_VERSION,
  builtAt: '',
  documents: [],
  documentFrequency: {},
  averageLength: 0
})

const normalizeIndex = (value) => {
  if (!value || value.version !== INDEX_VERSION || !Array.isArray(value.documents)) return emptyIndex()
  return {
    version: INDEX_VERSION,
    builtAt: String(value.builtAt || ''),
    documents: value.documents,
    documentFrequency: value.documentFrequency && typeof value.documentFrequency === 'object' ? value.documentFrequency : {},
    averageLength: Number(value.averageLength) || 0
  }
}

export default class ElephantSearchAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
    this.config = { ...DEFAULT_CONFIG }
    this.index = emptyIndex()
    this.rebuildPromise = null
    this.disposed = false
  }

  knowledgeProvider() {
  return this.api.resources.get(KNOWLEDGE_RESOURCE)
}

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  async load() {
    const [config, index] = await Promise.all([
      this.api.storage.get(CONFIG_KEY),
      this.api.storage.get(INDEX_KEY)
    ])
    this.config = normalizeConfig(config)
    this.index = normalizeIndex(index)
  }

  async saveConfig() {
    await this.api.storage.set(CONFIG_KEY, this.config)
  }

  async listNotes() {
    return await this.invoke('tauri_addons_notes_list', {
      addonId: ADDON_ID,
      prefix: '.'
    })
  }

  async readNote(path) {
    return await this.invoke('tauri_addons_notes_read', {
      addonId: ADDON_ID,
      path
    })
  }

  async rebuild() {
    if (this.rebuildPromise) return this.rebuildPromise
    this.rebuildPromise = this.performRebuild().finally(() => { this.rebuildPromise = null })
    return this.rebuildPromise
  }

  async performRebuild() {
  const knowledge = this.knowledgeProvider()
  if (knowledge && typeof knowledge.rebuild === 'function') {
    try {
      const report = await knowledge.rebuild()
      this.api.app.emit('elephantnote:search-index-updated', { engine: 'knowledge-provider', ...report })
      return { engine: 'knowledge-provider', ...report }
    } catch (error) {
      console.warn('[ai-search] Knowledge provider rebuild failed; using local fallback', error)
    }
  }

    const entries = await this.listNotes()
    const documents = []
    const documentFrequency = Object.create(null)
    let totalLength = 0

    for (const entry of entries) {
      if (this.disposed) throw new Error('Search addon stopped while rebuilding')
      const note = await this.readNote(entry.path)
      const title = markdownTitle(note.markdown, note.path)
      const excerpt = markdownExcerpt(note.markdown, this.config.excerptLength)
      const titleTokens = tokenize(title)
      const bodyTokens = tokenize(note.markdown)
      const tokens = [...titleTokens, ...titleTokens, ...bodyTokens]
      const frequencies = termFrequency(tokens)
      totalLength += tokens.length
      for (const token of new Set(tokens)) documentFrequency[token] = (documentFrequency[token] || 0) + 1
      documents.push({
        id: note.path,
        path: note.path,
        title,
        excerpt,
        modifiedAt: note.modifiedAt || entry.modifiedAt || null,
        length: tokens.length,
        frequencies
      })
    }

    this.index = {
      version: INDEX_VERSION,
      builtAt: new Date().toISOString(),
      documents,
      documentFrequency,
      averageLength: documents.length ? totalLength / documents.length : 0
    }
    await this.api.storage.set(INDEX_KEY, this.index)
    this.api.app.emit('elephantnote:search-index-updated', this.status())
    return this.status()
  }

  scoreDocument(document, queryTokens) {
    const totalDocuments = Math.max(1, this.index.documents.length)
    const averageLength = Math.max(1, this.index.averageLength || 1)
    let score = 0
    for (const token of queryTokens) {
      const frequency = Number(document.frequencies?.[token] || 0)
      if (!frequency) continue
      const containing = Number(this.index.documentFrequency?.[token] || 0)
      const inverseDocumentFrequency = Math.log(1 + ((totalDocuments - containing + 0.5) / (containing + 0.5)))
      const normalizedFrequency = (frequency * 2.2) / (frequency + 1.2 * (0.25 + 0.75 * (document.length / averageLength)))
      score += inverseDocumentFrequency * normalizedFrequency
    }
    const normalizedQuery = normalizeText(queryTokens.join(' '))
    if (normalizedQuery && normalizeText(document.title).includes(normalizedQuery)) score += 4
    return score
  }

  async query(input, options = {}) {
  if (!this.config.enabled) return []
  const limit = Math.min(100, Math.max(1, Number(options.limit) || this.config.limit))
  const knowledge = this.knowledgeProvider()
  if (knowledge && typeof knowledge.search === 'function') {
    try {
      const hits = await knowledge.search(input, { limit })
      return (Array.isArray(hits) ? hits : []).map((hit) => ({
        ...hit,
        id: hit.id || hit.chunk_id || hit.relative_path,
        path: hit.path || hit.relative_path,
        relativePath: hit.relativePath || hit.relative_path,
        title: hit.title || hit.heading || hit.relative_path,
        excerpt: hit.excerpt || '',
        score: Number(hit.score) || 0,
        engine: 'knowledge-provider'
      }))
    } catch (error) {
      console.warn('[ai-search] Knowledge provider search failed; using local fallback', error)
    }
  }

  const queryTokens = [...new Set(tokenize(input))]
  if (!queryTokens.length) return []
  if (!this.index.documents.length && this.config.autoRebuild) await this.rebuild()
  return this.index.documents
    .map((document) => ({ ...document, score: this.scoreDocument(document, queryTokens) }))
    .filter((document) => document.score > 0)
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title))
    .slice(0, limit)
    .map(({ frequencies, length, ...result }) => result)
}

  status() {
    return {
      enabled: this.config.enabled,
      notesIndexed: this.index.documents.length,
      builtAt: this.index.builtAt,
      rebuilding: Boolean(this.rebuildPromise),
      engine: 'package-owned-bm25',
      semanticVectors: false
    }
  }

  async clear() {
    this.index = emptyIndex()
    await this.api.storage.remove(INDEX_KEY)
    this.api.app.emit('elephantnote:search-index-updated', this.status())
    return this.status()
  }

  async setEnabled(enabled) {
    this.config.enabled = enabled === true
    await this.saveConfig()
    return this.status()
  }

  async render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-search-settings')
    container.replaceChildren(root)

    const status = node(documentRef, 'p', 'elephant-search-status')
    const refreshStatus = () => {
      const state = this.status()
      const built = state.builtAt ? ` · ${new Date(state.builtAt).toLocaleString()}` : ''
      status.textContent = `${state.enabled ? 'Enabled' : 'Disabled'} · ${state.notesIndexed} notes · package-owned lexical index${built}`
    }

    const card = node(documentRef, 'div', 'elephant-search-card')
    const heading = node(documentRef, 'div', 'elephant-search-heading')
    heading.append(
      node(documentRef, 'h4', '', 'Search'),
      node(documentRef, 'p', '', 'The index and ranking data live inside this addon package. No global Search backend is required.')
    )
    card.append(heading, status)

    const field = (label, input) => {
      const wrapper = node(documentRef, 'label', 'elephant-search-field')
      wrapper.append(node(documentRef, 'span', '', label), input)
      return wrapper
    }

    const enabled = node(documentRef, 'input')
    enabled.type = 'checkbox'
    enabled.checked = this.config.enabled
    enabled.onchange = async () => { await this.setEnabled(enabled.checked); refreshStatus() }

    const limit = node(documentRef, 'input')
    limit.type = 'number'
    limit.min = '1'
    limit.max = '100'
    limit.value = String(this.config.limit)
    limit.onchange = async () => {
      this.config.limit = Math.min(100, Math.max(1, Number(limit.value) || DEFAULT_CONFIG.limit))
      await this.saveConfig()
    }

    const auto = node(documentRef, 'input')
    auto.type = 'checkbox'
    auto.checked = this.config.autoRebuild
    auto.onchange = async () => { this.config.autoRebuild = auto.checked; await this.saveConfig() }

    const grid = node(documentRef, 'div', 'elephant-search-grid')
    grid.append(field('Enabled', enabled), field('Result limit', limit), field('Rebuild automatically', auto))
    card.append(grid)

    const actions = node(documentRef, 'div', 'elephant-search-actions')
    const rebuild = node(documentRef, 'button', '', 'Rebuild index')
    rebuild.onclick = async () => {
      rebuild.disabled = true
      status.textContent = 'Reading and indexing notes…'
      try { await this.rebuild() } finally { rebuild.disabled = false; refreshStatus() }
    }
    const clear = node(documentRef, 'button', '', 'Clear index')
    clear.onclick = async () => { await this.clear(); refreshStatus() }
    actions.append(rebuild, clear)
    card.append(actions)
    root.append(card)
    refreshStatus()

    return () => root.remove()
  }

  async onload(api) {
    await this.load()
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

    api.resources.provide(PROVIDER_RESOURCE, Object.freeze({
      query: (text, options) => this.query(text, options),
      rebuild: () => this.rebuild(),
      clear: () => this.clear(),
      status: () => this.status(),
      setEnabled: (enabled) => this.setEnabled(enabled)
    }))

    api.commands.register({ id: `${ADDON_ID}.rebuild`, title: 'Rebuild Search index', run: () => this.rebuild() })
    api.commands.register({ id: `${ADDON_ID}.clear`, title: 'Clear Search index', run: () => this.clear() })
    api.settings.registerSection({
      id: `${ADDON_ID}.settings`,
      section: 'ai',
      slot: 'ai.search',
      chrome: false,
      title: 'Search',
      description: 'Configure package-owned indexing and retrieval.',
      order: 30,
      render: (container) => this.render(container)
    })

    if (this.config.enabled && this.config.autoRebuild && !this.index.documents.length) {
      void this.rebuild().catch((error) => this.window?.console?.warn?.('[Search addon] initial rebuild failed', error))
    }
  }

  onunload() {
    this.disposed = true
  }
}

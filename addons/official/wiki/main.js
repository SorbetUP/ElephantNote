import { discoverSemanticWikiRecords } from './semanticWikiProposals'

const ADDON_ID = 'elephant.wiki'
const VIEW_ID = `${ADDON_ID}.workspace`
const RECORDS_KEY = 'records'
const MAX_SOURCE_READS = 300
const MAX_CITATIONS = 24
const KNOWLEDGE_RESOURCE = 'knowledge.provider'

const node = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag)
  if (className) element.className = className
  if (text) element.textContent = text
  return element
}

const slugify = (value = '') => {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || 'topic'
}

const titleFromPath = (path = '') => {
  const name = String(path || '').split('/').pop() || 'Untitled'
  return name.replace(/\.md$/i, '').replace(/[-_]+/g, ' ').trim() || 'Untitled'
}

const extractTitle = (content, path) => {
  const heading = String(content || '').match(/^#\s+(.+)$/m)?.[1]?.trim()
  return heading || titleFromPath(path)
}

const extractTags = (content = '') => {
  const tags = new Set()
  const frontmatter = String(content).match(/^---\s*\n([\s\S]*?)\n---/)
  if (frontmatter) {
    const inline = frontmatter[1].match(/^tags\s*:\s*\[([^\]]*)\]/mi)?.[1]
    if (inline) {
      inline
        .split(',')
        .map((tag) => tag.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
        .forEach((tag) => tags.add(tag.toLowerCase()))
    }
    const block = frontmatter[1].match(/^tags\s*:\s*\n((?:\s*-\s*.+\n?)*)/mi)?.[1] || ''
    for (const match of block.matchAll(/^\s*-\s*(.+)$/gm)) {
      tags.add(match[1].trim().replace(/^['"]|['"]$/g, '').toLowerCase())
    }
  }
  for (const match of String(content).matchAll(/(^|\s)#([\p{L}\p{N}_-]{2,})/gu)) {
    tags.add(match[2].toLowerCase())
  }
  return [...tags].filter(Boolean)
}

const extractLinks = (content = '') => [...String(content).matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
  .map((match) => match[1].trim().toLowerCase())
  .filter(Boolean)

const excerpt = (content = '') => String(content)
  .replace(/^---[\s\S]*?---\s*/m, '')
  .replace(/^#{1,6}\s+/gm, '')
  .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
  .replace(/[`*_>~-]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 360)

const folderTopic = (path = '') => {
  const parts = String(path || '').split('/').filter(Boolean)
  return parts.length > 1 ? parts[parts.length - 2] : ''
}

const normalizeRecords = (records) => (Array.isArray(records) ? records : [])
  .filter((record) => record && typeof record === 'object' && record.id)
  .map((record) => ({
    ...record,
    id: String(record.id),
    title: String(record.title || record.topic || record.id),
    topic: String(record.topic || record.title || record.id),
    status: String(record.status || 'proposed'),
    sources: Array.isArray(record.sources) ? record.sources : [],
    sourceCount: Number(record.sourceCount || record.sources?.length || 0)
  }))

const knowledgeRecord = (draft) => ({
  ...draft,
  id: String(draft?.id || ''),
  title: String(draft?.title || draft?.topic || draft?.id || 'Untitled'),
  topic: String(draft?.topic || draft?.title || draft?.id || 'Untitled'),
  status: String(draft?.status || 'proposed') === 'rejected'
    ? 'dismissed'
    : String(draft?.status || 'proposed'),
  summary: String(draft?.topic || ''),
  path: draft?.slug ? `.elephantnote/wiki/${draft.slug}.md` : '',
  sources: (Array.isArray(draft?.citations) ? draft.citations : []).map((citation) => ({
    path: citation.document_path,
    title: citation.document_title,
    heading: citation.heading,
    chunkId: citation.chunk_id
  })),
  sourceCount: Array.isArray(draft?.source_paths) ? draft.source_paths.length : 0,
  providerOwned: true
})

const proposalMarkdown = (record) => {
  const sources = record.sources || []
  const sourceList = sources
    .map((source, index) => `[^source-${index + 1}]: ${source.path}${source.excerpt ? ` — ${source.excerpt}` : ''}`)
    .join('\n')
  const links = sources.map((source) => `- [[${source.path.replace(/\.md$/i, '')}]]`).join('\n')
  return `# ${record.title}\n\n${record.summary || `Knowledge page synthesized from ${sources.length} notes.`}\n\n## Related notes\n\n${links || '- No related note'}\n\n## Sources\n\n${sourceList || 'No source'}\n`
}

export default class ElephantWikiAddon {
  constructor(api) {
    this.api = api
    this.window = api.experimental.window
  }

  knowledgeProvider() {
    return this.api.resources.get(KNOWLEDGE_RESOURCE)
  }

  invoke(command, payload = {}) {
    const invoke = this.window?.__TAURI__?.core?.invoke
    if (typeof invoke !== 'function') throw new Error(`Tauri command API is unavailable for ${command}`)
    return invoke(command, payload)
  }

  broker(method, params = {}) {
    return this.invoke('tauri_addons_call', { addonId: ADDON_ID, method, params })
  }

  listNoteEntries() {
    return this.invoke('tauri_addons_notes_list', { addonId: ADDON_ID, prefix: '.' })
  }

  async readNote(path) {
    const result = await this.broker('notes.read', { path })
    return String(result?.content || '')
  }

  writeNote(path, content) {
    return this.broker('notes.write', { path, content })
  }

  async loadRecords() {
    const local = normalizeRecords(await this.api.storage.get(RECORDS_KEY))
    const knowledge = this.knowledgeProvider()
    if (!knowledge || typeof knowledge.listWikis !== 'function') return local
    try {
      const drafts = await knowledge.listWikis({ limit: 500 })
      const remote = (Array.isArray(drafts) ? drafts : [])
        .map(knowledgeRecord)
        .filter((record) => record.id)
      const ids = new Set(remote.map((record) => record.id))
      return [...remote, ...local.filter((record) => !ids.has(record.id))]
    } catch (error) {
      console.warn('[wiki-addon] Knowledge drafts unavailable; using local records', error)
      return local
    }
  }

  async saveRecords(records) {
    const normalized = normalizeRecords(records)
    await this.api.storage.set(RECORDS_KEY, normalized)
    return normalized
  }

  async scanNotes() {
    const entries = await this.listNoteEntries()
    const candidates = (Array.isArray(entries) ? entries : [])
      .filter((entry) => entry?.path && !String(entry.path).startsWith('Wiki/'))
      .slice(0, MAX_SOURCE_READS)
    const notes = []
    for (const entry of candidates) {
      try {
        const content = await this.readNote(entry.path)
        notes.push({
          path: String(entry.path),
          title: extractTitle(content, entry.path),
          excerpt: excerpt(content),
          tags: extractTags(content),
          links: extractLinks(content),
          folder: folderTopic(entry.path),
          modifiedAt: entry.modifiedAt || null
        })
      } catch (error) {
        console.warn('[wiki-addon] note skipped', {
          path: entry.path,
          error: error?.message || String(error)
        })
      }
    }
    return notes
  }

  buildProposals(notes) {
    const clusters = new Map()
    const add = (topic, note, weight) => {
      const normalized = String(topic || '').trim()
      if (!normalized || normalized.length < 2) return
      const key = normalized.toLowerCase()
      const cluster = clusters.get(key) || { topic: normalized, notes: new Map(), score: 0 }
      cluster.notes.set(note.path, cluster.notes.get(note.path) || note)
      cluster.score += weight
      clusters.set(key, cluster)
    }

    for (const note of notes) {
      for (const tag of note.tags) add(tag, note, 5)
      if (note.folder) add(note.folder, note, 2)
      for (const link of note.links) add(link, note, 1)
      const titleWords = note.title.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []
      for (const word of titleWords
        .filter((value) => !['this', 'that', 'with', 'from', 'dans', 'pour', 'avec', 'sans', 'note'].includes(value))
        .slice(0, 5)) {
        add(word, note, 1)
      }
    }

    const now = new Date().toISOString()
    return [...clusters.values()]
      .map((cluster) => ({ ...cluster, notes: [...cluster.notes.values()] }))
      .filter((cluster) => cluster.notes.length >= 2)
      .sort((left, right) => right.notes.length - left.notes.length || right.score - left.score || left.topic.localeCompare(right.topic))
      .slice(0, 80)
      .map((cluster) => {
        const sources = cluster.notes
          .sort((left, right) => Number(right.modifiedAt || 0) - Number(left.modifiedAt || 0))
          .slice(0, MAX_CITATIONS)
          .map((note) => ({ path: note.path, title: note.title, excerpt: note.excerpt, tags: note.tags }))
        const topic = cluster.topic.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
        return {
          id: `wiki-${slugify(cluster.topic)}`,
          topic,
          title: topic,
          summary: `This fallback proposal connects ${cluster.notes.length} notes around ${topic}, using ${sources.length} directly cited sources.`,
          sources,
          sourceCount: cluster.notes.length,
          status: 'proposed',
          origin: 'lexical-fallback',
          createdAt: now,
          updatedAt: now
        }
      })
  }

  async generateProposals() {
    const existing = await this.loadRecords()
    const preserved = existing.filter((record) => record.status !== 'proposed' || record.origin === 'manual')
    const knowledge = this.knowledgeProvider()

    try {
      const semantic = await discoverSemanticWikiRecords(knowledge, existing, { limit: 12 })
      if (semantic.available) {
        const merged = [
          ...preserved,
          ...semantic.records.filter((proposal) => !preserved.some((record) => record.id === proposal.id))
        ]
        await this.saveRecords(merged.filter((record) => !record.providerOwned))
        return { generated: semantic.records.length, records: merged, engine: 'knowledge-semantic-v2' }
      }
    } catch (error) {
      console.warn('[wiki-addon] Semantic organization failed; using local records and lexical fallback', error)
    }

    const notes = await this.scanNotes()
    const proposals = this.buildProposals(notes)
    const merged = [
      ...preserved,
      ...proposals.filter((proposal) => !preserved.some((record) => record.id === proposal.id))
    ]
    await this.saveRecords(merged.filter((record) => !record.providerOwned))
    return { generated: proposals.length, records: merged, engine: 'lexical-fallback' }
  }

  async acceptRecord(id) {
    const knowledge = this.knowledgeProvider()
    if (knowledge && typeof knowledge.acceptWiki === 'function') {
      try {
        const accepted = await knowledge.acceptWiki(id)
        if (accepted?.draft) return knowledgeRecord(accepted.draft)
      } catch (error) {
        console.warn('[wiki-addon] Knowledge accept failed; trying local proposal', error)
      }
    }
    const records = await this.loadRecords()
    const record = records.find((candidate) => candidate.id === id)
    if (!record) throw new Error(`Unknown Wiki proposal: ${id}`)
    const relativePath = `Wiki/${slugify(record.title)}.md`
    await this.writeNote(relativePath, proposalMarkdown(record))
    record.status = 'accepted'
    record.path = relativePath
    record.updatedAt = new Date().toISOString()
    await this.saveRecords(records.filter((candidate) => !candidate.providerOwned))
    return record
  }

  async dismissRecord(id) {
    const knowledge = this.knowledgeProvider()
    if (knowledge && typeof knowledge.rejectWiki === 'function') {
      try {
        const rejected = await knowledge.rejectWiki(id)
        if (rejected) return knowledgeRecord(rejected)
      } catch (error) {
        console.warn('[wiki-addon] Knowledge reject failed; trying local proposal', error)
      }
    }
    const records = await this.loadRecords()
    const record = records.find((candidate) => candidate.id === id)
    if (!record) throw new Error(`Unknown Wiki proposal: ${id}`)
    record.status = 'dismissed'
    record.updatedAt = new Date().toISOString()
    await this.saveRecords(records.filter((candidate) => !candidate.providerOwned))
    return record
  }

  render(container) {
    const documentRef = container.ownerDocument
    const root = node(documentRef, 'section', 'elephant-wiki-package')
    container.replaceChildren(root)
    let disposed = false

    const refresh = async () => {
      root.replaceChildren(node(documentRef, 'p', 'elephant-package-muted', 'Loading Wiki…'))
      try {
        const records = await this.loadRecords()
        if (disposed) return
        root.replaceChildren()
        const header = node(documentRef, 'header', 'elephant-package-header')
        const heading = node(documentRef, 'div')
        heading.append(
          node(documentRef, 'h2', '', 'Wiki'),
          node(documentRef, 'p', '', `${records.length} pages and proposals`)
        )
        const actions = node(documentRef, 'div', 'elephant-package-actions')
        const propose = node(documentRef, 'button', '', 'Propose with AI')
        propose.onclick = async () => {
          propose.disabled = true
          try {
            await this.generateProposals()
            await refresh()
          } finally {
            propose.disabled = false
          }
        }
        const reload = node(documentRef, 'button', '', 'Refresh')
        reload.onclick = () => void refresh()
        actions.append(propose, reload)
        header.append(heading, actions)
        root.append(header)

        const list = node(documentRef, 'div', 'elephant-wiki-list')
        if (!records.length) {
          list.append(node(documentRef, 'p', 'elephant-package-muted', 'No Wiki page or proposal yet.'))
        }
        for (const record of records) {
          const article = node(documentRef, 'article', 'elephant-wiki-record')
          article.dataset.status = record.status
          article.append(node(documentRef, 'h3', '', record.title))
          if (record.summary) article.append(node(documentRef, 'p', '', record.summary))
          const evidence = record.origin === 'semantic'
            ? `${record.qualityLabel || 'Semantic topic'} · ${record.coreSourceCount || record.sourceCount} core · ${record.sourceCount} total`
            : `${record.status} · ${record.sourceCount || record.sources.length} sources`
          article.append(node(documentRef, 'small', '', evidence))
          if (record.status === 'proposed') {
            const buttons = node(documentRef, 'div', 'elephant-package-actions')
            const accept = node(documentRef, 'button', '', 'Approve')
            accept.onclick = async () => { await this.acceptRecord(record.id); await refresh() }
            const dismiss = node(documentRef, 'button', '', 'Refuse')
            dismiss.onclick = async () => { await this.dismissRecord(record.id); await refresh() }
            buttons.append(accept, dismiss)
            article.append(buttons)
          }
          list.append(article)
        }
        root.append(list)
      } catch (error) {
        if (!disposed) {
          root.replaceChildren(node(
            documentRef,
            'p',
            'elephant-package-error',
            error instanceof Error ? error.message : String(error)
          ))
        }
      }
    }

    void refresh()
    return () => { disposed = true; root.remove() }
  }

  onload(api) {
    api.ui.registerStyle(`
      .elephant-wiki-package { height:100%; overflow:auto; box-sizing:border-box; display:grid; align-content:start; gap:14px; padding:18px; }
      .elephant-package-header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .elephant-package-header h2,.elephant-package-header p { margin:0; }
      .elephant-package-header p,.elephant-package-muted { color:var(--en-muted); }
      .elephant-package-actions { display:flex; gap:8px; flex-wrap:wrap; }
      .elephant-package-actions button { min-height:34px; padding:0 12px; border:1px solid var(--en-border); border-radius:9px; background:var(--en-surface); color:var(--en-text); cursor:pointer; }
      .elephant-wiki-list { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; }
      .elephant-wiki-record { display:grid; gap:8px; padding:14px; border:1px solid var(--en-border); border-radius:13px; background:var(--en-surface); }
      .elephant-wiki-record[data-status=accepted] { border-color:color-mix(in srgb,var(--en-success,#12b76a) 50%,var(--en-border)); }
      .elephant-wiki-record h3,.elephant-wiki-record p { margin:0; }
      .elephant-wiki-record p,.elephant-wiki-record small { color:var(--en-muted); }
      .elephant-package-error { color:var(--en-danger,#b42318); }
      @media (max-width:760px) { .elephant-wiki-package { padding:12px; } .elephant-wiki-list { grid-template-columns:1fr; } }
    `, 'wiki-package')
    const bridge = this.window?.__ELEPHANT_ADDON_VUE__
    if (!bridge?.createDomComponent) throw new Error('Physical addon Vue bridge is unavailable')
    api.workspace.registerView({
      id: VIEW_ID,
      title: 'Wiki',
      description: 'Browse package-owned Wiki pages and semantic proposals.',
      icon: 'book-open-text',
      kind: 'ai-wiki-v3',
      component: bridge.createDomComponent({
        name: 'ElephantPhysicalWiki',
        mount: (container) => this.render(container)
      }),
      order: 30
    })
    api.commands.register({
      id: `${ADDON_ID}.generate-proposals`,
      title: 'Generate Wiki proposals',
      run: () => this.generateProposals()
    })
  }
}

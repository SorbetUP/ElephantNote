import fs from 'fs-extra'
import path from 'path'
import {
  SEARCH_MODES,
  SEARCH_STATUSES
} from './searchTypes'
import { isIgnoredPath, isMarkdownFile } from './pathSafety'
import { markdownToSearchText } from './markdownToSearchText'
import {
  chunkAtomicMarkdown,
  createAtomicDocument,
  createAtomicSemanticIndex,
  searchAtomicSemanticIndex
} from 'common/elephantnote/atomicAiEngine'

const normalizeVaultRoot = (vaultRoot) => path.resolve(vaultRoot || '')

const createStatus = ({
  status = SEARCH_STATUSES.NOT_INITIALIZED,
  vaultPath = '',
  indexedDocuments = 0,
  totalDocuments = 0,
  message = '',
  error = ''
} = {}) => ({
  status,
  vaultPath,
  indexedDocuments,
  totalDocuments,
  message,
  error
})

const listMarkdownFiles = async(vaultRoot) => {
  const files = []
  const root = normalizeVaultRoot(vaultRoot)

  const walk = async(directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/')
      if (isIgnoredPath(relativePath)) continue
      if (entry.isDirectory()) await walk(absolutePath)
      else if (entry.isFile() && isMarkdownFile(absolutePath)) files.push(absolutePath)
    }
  }

  if (root) await walk(root)
  return files.sort((a, b) => a.localeCompare(b))
}

const titleFromMarkdown = (markdown = '', fallback = '') => {
  const frontmatterTitle = markdown.match(/^---\r?\n[\s\S]*?^\s*title:\s*["']?(.+?)["']?\s*$/m)
  if (frontmatterTitle?.[1]) return frontmatterTitle[1].trim()
  const heading = markdown.match(/^#\s+(.+)$/m)
  return heading?.[1]?.trim() || fallback
}

const exactSearchMarkdownFiles = async({ vaultRoot, query, limit }) => {
  const loweredQuery = String(query || '').toLowerCase()
  if (!loweredQuery) return []

  const files = await listMarkdownFiles(vaultRoot)
  const matches = []

  for (const absolutePath of files) {
    const relativePath = path.relative(vaultRoot, absolutePath).split(path.sep).join('/')
    const markdown = await fs.readFile(absolutePath, 'utf8').catch(() => '')
    const searchable = markdownToSearchText(markdown)
    const haystack = `${relativePath}\n${searchable}`.toLowerCase()
    const index = haystack.indexOf(loweredQuery)
    if (index === -1) continue

    const title = titleFromMarkdown(markdown, path.basename(relativePath, path.extname(relativePath)))
    const snippetSource = searchable || markdown
    const snippetIndex = snippetSource.toLowerCase().indexOf(loweredQuery)
    const start = Math.max(0, snippetIndex - 70)
    const snippet = snippetIndex >= 0
      ? snippetSource.slice(start, snippetIndex + loweredQuery.length + 90).replace(/\s+/g, ' ').trim()
      : relativePath

    matches.push({
      id: `exact:${relativePath}`,
      uri: `elephantnote://vault/${encodeURI(relativePath)}`,
      title,
      relativePath,
      score: index === 0 ? 1 : 0.75,
      matchType: 'keyword',
      snippets: snippet ? [{ text: snippet, score: 1 }] : []
    })

    if (matches.length >= limit) break
  }

  return matches
}

const createRuntimeEmbeddedDocument = async({ relativePath, markdown, embeddingProvider }) => {
  const document = createAtomicDocument({ relativePath, markdown })
  if (!embeddingProvider?.embedText) return document
  const chunks = await Promise.all(chunkAtomicMarkdown(markdown).map(async(chunk) => ({
    ...chunk,
    embedding: await embeddingProvider.embedText(chunk.content)
  })))
  return {
    ...document,
    chunks,
    embedding: await embeddingProvider.embedText(`${document.title}\n${document.plainText}`)
  }
}

const readAtomicDocuments = async(vaultRoot, embeddingProvider = null) => {
  const files = await listMarkdownFiles(vaultRoot)
  const documents = []
  for (const absolutePath of files) {
    const relativePath = path.relative(vaultRoot, absolutePath).split(path.sep).join('/')
    const markdown = await fs.readFile(absolutePath, 'utf8').catch(() => '')
    documents.push(await createRuntimeEmbeddedDocument({ relativePath, markdown, embeddingProvider }))
  }
  return documents
}

const localSearchMarkdownFiles = async({ vaultRoot, query, mode, limit, semanticIndex, embeddingProvider }) => {
  if (mode === SEARCH_MODES.EXACT) return exactSearchMarkdownFiles({ vaultRoot, query, limit })

  const queryEmbedding = semanticIndex?.embeddingSource === 'node-llama-cpp' && embeddingProvider?.embedText
    ? await embeddingProvider.embedText(query)
    : null
  const semanticMatches = searchAtomicSemanticIndex({ index: semanticIndex, query, queryEmbedding, limit })
  if (mode === SEARCH_MODES.SEMANTIC) return semanticMatches

  const exactMatches = await exactSearchMarkdownFiles({ vaultRoot, query, limit })
  const byPath = new Map()
  for (const match of [...semanticMatches, ...exactMatches]) {
    const current = byPath.get(match.relativePath)
    if (!current || match.score > current.score) {
      byPath.set(match.relativePath, {
        ...match,
        matchType: current ? 'hybrid' : match.matchType
      })
    }
  }
  return [...byPath.values()]
    .sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath))
    .slice(0, Math.max(1, Math.min(50, Number(limit) || 20)))
}

export class ElephantSearchService {
  constructor({ embeddingProvider = null } = {}) {
    this._activeVaultRootByWindow = new Map()
    this._statusByVault = new Map()
    this._indexByVault = new Map()
    this._enabled = true
    this._embeddingProvider = embeddingProvider
  }

  setEmbeddingProvider(embeddingProvider = null) {
    this._embeddingProvider = embeddingProvider
    this._indexByVault.clear()
  }

  _getStatus(vaultRoot) {
    const root = normalizeVaultRoot(vaultRoot)
    return this._statusByVault.get(root) || createStatus({ vaultPath: root })
  }

  _setStatus(vaultRoot, patch) {
    const root = normalizeVaultRoot(vaultRoot)
    const nextStatus = {
      ...createStatus({ vaultPath: root }),
      ...this._getStatus(root),
      ...patch,
      vaultPath: root
    }
    this._statusByVault.set(root, nextStatus)
    return nextStatus
  }

  async initForVault(vaultRoot, windowId = null) {
    const root = normalizeVaultRoot(vaultRoot)
    if (!root) return createStatus()

    if (windowId !== null) this._activeVaultRootByWindow.set(windowId, root)

    if (!this._enabled) {
      const status = createStatus({ status: SEARCH_STATUSES.DISABLED, vaultPath: root })
      this._statusByVault.set(status.vaultPath, status)
      return status
    }

    return this._buildIndex(root, 'Atomic embedding search is ready.')
  }

  async search({ query, mode = SEARCH_MODES.SMART, limit = 20 } = {}, windowId = null) {
    if (!this._enabled) return []
    const root = windowId !== null ? this._activeVaultRootByWindow.get(windowId) : null
    if (!root) return []
    const normalizedQuery = String(query || '').trim()
    if (!normalizedQuery) return []
    return localSearchMarkdownFiles({
      vaultRoot: root,
      query: normalizedQuery,
      mode,
      limit: Math.max(1, Math.min(50, Number(limit) || 20)),
      semanticIndex: await this._ensureIndex(root),
      embeddingProvider: this._embeddingProvider
    })
  }

  async indexFile(absolutePath, windowId = null) {
    const root = this._resolveVaultRootForPath(absolutePath, windowId)
    if (!root) return
    await this._buildIndex(root, 'Atomic embedding search refreshed.')
  }

  async deleteFile(absolutePath, windowId = null) {
    await this.indexFile(absolutePath, windowId)
  }

  async rebuildIndex(windowId = null) {
    const root = this._resolveRootFromWindow(windowId)
    if (!root) return createStatus()
    return this._buildIndex(root, 'Embedding index rebuilt with automatic semantic links.')
  }

  async clearIndex(windowId = null) {
    const root = this._resolveRootFromWindow(windowId)
    if (!root) return createStatus()
    this._indexByVault.delete(root)
    return this._setStatus(root, {
      status: SEARCH_STATUSES.READY,
      indexedDocuments: 0,
      totalDocuments: 0,
      message: 'Embedding index cleared. Rebuild search to recreate semantic links.',
      error: ''
    })
  }

  async getStatus(windowId = null) {
    const root = this._resolveRootFromWindow(windowId)
    if (!root) return createStatus()
    return this._getStatus(root)
  }

  async inspectIndex(windowId = null) {
    const root = this._resolveRootFromWindow(windowId)
    const status = root
      ? this._getStatus(root)
      : createStatus()

    const index = root ? await this._ensureIndex(root) : null
    const documents = (index?.documents || []).map((document) => ({
      id: document.id,
      relativePath: document.relativePath,
      title: document.title,
      chunkCount: document.chunks.length,
      sourceCount: document.sources.length,
      sources: document.sources,
      tags: document.tags
    }))
    return {
      status,
      indexPath: '',
      documents,
      folders: [],
      semanticLinks: index?.semanticLinks || [],
      features: {
        embeddings: true,
        embeddingSource: index?.embeddingSource || 'deterministic-local',
        semanticLinks: true,
        automaticSources: true,
        autoTags: true
      },
      generatedAt: index?.generatedAt || new Date().toISOString()
    }
  }

  disable() {
    this._enabled = false
    for (const [root, status] of this._statusByVault.entries()) {
      this._statusByVault.set(root, {
        ...status,
        status: SEARCH_STATUSES.DISABLED,
        message: 'Atomic local search disabled.'
      })
    }
    return createStatus({ status: SEARCH_STATUSES.DISABLED, message: 'Atomic local search disabled.' })
  }

  enable() {
    this._enabled = true
    return createStatus({ status: SEARCH_STATUSES.NOT_INITIALIZED, message: 'Atomic local search enabled.' })
  }

  async registerWindowVault(windowId, vaultRoot) {
    const root = normalizeVaultRoot(vaultRoot)
    if (!root) return createStatus()
    this._activeVaultRootByWindow.set(windowId, root)
    return this.initForVault(root, windowId)
  }

  async _buildIndex(root, message = 'Atomic embedding search is ready.') {
    this._setStatus(root, {
      status: SEARCH_STATUSES.INDEXING,
      message: 'Building local embedding index...',
      error: ''
    })
    try {
      const embeddingProvider = this._embeddingProvider
      const documents = await readAtomicDocuments(root, embeddingProvider)
      const index = {
        ...createAtomicSemanticIndex(documents),
        embeddingSource: embeddingProvider?.source || 'deterministic-local'
      }
      this._indexByVault.set(root, index)
      return this._setStatus(root, {
        status: SEARCH_STATUSES.READY,
        indexedDocuments: documents.length,
        totalDocuments: documents.length,
        message: index.embeddingSource === 'node-llama-cpp'
          ? 'node-llama-cpp embedding search is ready.'
          : message,
        error: ''
      })
    } catch (error) {
      return this._setStatus(root, {
        status: SEARCH_STATUSES.ERROR,
        message: 'Embedding index failed.',
        error: error instanceof Error ? error.message : String(error || '')
      })
    }
  }

  async _ensureIndex(root) {
    if (this._indexByVault.has(root)) return this._indexByVault.get(root)
    await this._buildIndex(root)
    return this._indexByVault.get(root) || createAtomicSemanticIndex([])
  }

  _resolveRootFromWindow(windowId) {
    if (windowId === null || windowId === undefined) return ''
    return this._activeVaultRootByWindow.get(windowId) || ''
  }

  _resolveVaultRootForPath(absolutePath, windowId = null) {
    if (windowId !== null && this._activeVaultRootByWindow.has(windowId)) return this._activeVaultRootByWindow.get(windowId)
    if (!absolutePath) return ''
    for (const root of this._activeVaultRootByWindow.values()) {
      if (absolutePath.startsWith(root + path.sep)) return root
    }
    return ''
  }
}

export { createStatus }

import fs from 'fs-extra'
import path from 'path'
import {
  SEARCH_MODES,
  SEARCH_STATUSES
} from './searchTypes'
import { isIgnoredPath, isMarkdownFile } from './pathSafety'
import { markdownToSearchText } from './markdownToSearchText'
import { localMeaningSearchMarkdownFiles } from './localMeaningSearch'

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

const frontmatterTags = (markdown = '') => {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return []
  const inlineTags = match[1].match(/^\s*tags:\s*\[(.*?)\]\s*$/m)
  if (!inlineTags) return []
  return inlineTags[1]
    .split(',')
    .map((tag) => tag.trim().replace(/^["']|["']$/g, '').replace(/^#/, ''))
    .filter(Boolean)
}

const titleFromMarkdown = (markdown = '', fallback = '') => {
  const frontmatterTitle = markdown.match(/^---\r?\n[\s\S]*?^\s*title:\s*["']?(.+?)["']?\s*$/m)
  if (frontmatterTitle?.[1]) return frontmatterTitle[1].trim()
  const heading = markdown.match(/^#\s+(.+)$/m)
  return heading?.[1]?.trim() || fallback
}

const tokenize = (value = '') => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}_-]+/gu, ' ')
  .split(/\s+/)
  .map((word) => word.trim())
  .filter((word) => word.length >= 3 && !['note', 'notes', 'untitled', 'sans', 'titre', 'todo', 'done'].includes(word))

const topTerms = (text = '', limit = 10) => {
  const counts = new Map()
  for (const token of tokenize(text)) counts.set(token, (counts.get(token) || 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term]) => term)
}

const jaccard = (left = [], right = []) => {
  const a = new Set(left)
  const b = new Set(right)
  if (!a.size || !b.size) return 0
  let intersection = 0
  for (const value of a) if (b.has(value)) intersection += 1
  return intersection / (a.size + b.size - intersection)
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

const localSearchMarkdownFiles = async({ vaultRoot, query, mode, limit }) => {
  if (mode === SEARCH_MODES.EXACT) return exactSearchMarkdownFiles({ vaultRoot, query, limit })

  const files = await listMarkdownFiles(vaultRoot)
  const meaningMatches = await localMeaningSearchMarkdownFiles({ vaultRoot, files, query, limit })
  if (mode === SEARCH_MODES.SEMANTIC) return meaningMatches

  const exactMatches = await exactSearchMarkdownFiles({ vaultRoot, query, limit })
  const byPath = new Map()
  for (const match of [...meaningMatches, ...exactMatches]) {
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

const inspectMarkdownFiles = async(vaultRoot) => {
  const files = await listMarkdownFiles(vaultRoot)
  const inspected = []

  for (const absolutePath of files) {
    const relativePath = path.relative(vaultRoot, absolutePath).split(path.sep).join('/')
    const stats = await fs.stat(absolutePath).catch(() => null)
    const folder = path.dirname(relativePath)
    const markdown = await fs.readFile(absolutePath, 'utf8').catch(() => '')
    const searchable = markdownToSearchText(markdown)
    const title = titleFromMarkdown(markdown, path.basename(relativePath, path.extname(relativePath)))
    const tags = frontmatterTags(markdown)
    const terms = topTerms(`${title} ${relativePath} ${tags.join(' ')} ${searchable}`, 12)

    inspected.push({
      id: `atomic-file:${relativePath}`,
      uri: `elephantnote://vault/${encodeURI(relativePath)}`,
      title,
      relativePath,
      folder: folder === '.' ? '' : folder,
      type: 'md',
      mtime: stats?.mtime?.toISOString?.() || '',
      indexed: true,
      tags,
      keyTerms: terms
    })
  }

  return inspected.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

const createAtomicLinks = (documents = [], { maxLinksPerDocument = 6, maxEdges = 8000 } = {}) => {
  const rawEdges = new Map()
  const addEdge = (source, target, score, type = 'atomic') => {
    if (!source || !target || source === target) return
    const id = [source, target].sort().join('::')
    const current = rawEdges.get(id)
    const normalizedScore = Math.max(0, Math.min(1, Number(score) || 0))
    if (!current || normalizedScore > current.score) {
      rawEdges.set(id, { id, source, target, score: normalizedScore, type })
    }
  }

  const buckets = new Map()
  const addBucket = (key, document) => {
    if (!key) return
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(document)
  }

  for (const document of documents) {
    addBucket(`folder:${document.folder || 'Vault root'}`, document)
    for (const tag of document.tags || []) addBucket(`tag:${tag}`, document)
    for (const term of (document.keyTerms || []).slice(0, 6)) addBucket(`term:${term}`, document)
  }

  for (const [bucketKey, bucket] of buckets.entries()) {
    if (bucket.length < 2 || bucket.length > 120) continue
    const baseScore = bucketKey.startsWith('tag:') ? 0.68 : bucketKey.startsWith('folder:') ? 0.36 : 0.42
    const sorted = bucket.slice().sort((a, b) => String(b.mtime || '').localeCompare(String(a.mtime || '')))
    for (let index = 0; index < sorted.length; index += 1) {
      for (let offset = 1; offset <= Math.min(maxLinksPerDocument, sorted.length - index - 1); offset += 1) {
        addEdge(sorted[index].relativePath, sorted[index + offset].relativePath, baseScore, bucketKey.split(':')[0])
      }
    }
  }

  for (let leftIndex = 0; leftIndex < documents.length; leftIndex += 1) {
    const left = documents[leftIndex]
    const candidates = documents
      .slice(leftIndex + 1, Math.min(documents.length, leftIndex + 140))
      .map((right) => ({ right, score: jaccard(left.keyTerms, right.keyTerms) }))
      .filter(({ score }) => score >= 0.22)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(2, Math.floor(maxLinksPerDocument / 2)))
    for (const { right, score } of candidates) addEdge(left.relativePath, right.relativePath, Math.min(0.92, score + 0.22), 'semantic')
  }

  const byDocument = new Map()
  for (const edge of rawEdges.values()) {
    if (!byDocument.has(edge.source)) byDocument.set(edge.source, [])
    if (!byDocument.has(edge.target)) byDocument.set(edge.target, [])
    byDocument.get(edge.source).push(edge)
    byDocument.get(edge.target).push(edge)
  }

  const limited = new Map()
  for (const links of byDocument.values()) {
    for (const edge of links.sort((a, b) => b.score - a.score).slice(0, maxLinksPerDocument)) limited.set(edge.id, edge)
  }

  return [...limited.values()].sort((a, b) => b.score - a.score).slice(0, maxEdges)
}

export class ElephantSearchService {
  constructor() {
    this._activeVaultRootByWindow = new Map()
    this._statusByVault = new Map()
    this._enabled = true
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

    const totalDocuments = (await listMarkdownFiles(root)).length
    return this._setStatus(root, {
      status: SEARCH_STATUSES.READY,
      indexedDocuments: totalDocuments,
      totalDocuments,
      message: 'Atomic local search is ready. No Vectra index is used.',
      error: ''
    })
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
      limit: Math.max(1, Math.min(50, Number(limit) || 20))
    })
  }

  async indexFile(absolutePath, windowId = null) {
    const root = this._resolveVaultRootForPath(absolutePath, windowId)
    if (!root) return
    const totalDocuments = (await listMarkdownFiles(root)).length
    this._setStatus(root, {
      status: SEARCH_STATUSES.READY,
      indexedDocuments: totalDocuments,
      totalDocuments,
      message: 'Atomic local search is ready.'
    })
  }

  async deleteFile(absolutePath, windowId = null) {
    await this.indexFile(absolutePath, windowId)
  }

  async rebuildIndex(windowId = null) {
    const root = this._resolveRootFromWindow(windowId)
    if (!root) return createStatus()
    const totalDocuments = (await listMarkdownFiles(root)).length
    return this._setStatus(root, {
      status: SEARCH_STATUSES.READY,
      indexedDocuments: totalDocuments,
      totalDocuments,
      message: 'Atomic search metadata refreshed. No separate Vectra index was built.',
      error: ''
    })
  }

  async clearIndex(windowId = null) {
    const root = this._resolveRootFromWindow(windowId)
    if (!root) return createStatus()
    return this._setStatus(root, {
      status: SEARCH_STATUSES.READY,
      indexedDocuments: 0,
      totalDocuments: 0,
      message: 'Atomic search has no separate vector index to clear.',
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
    if (!root) {
      return {
        status: createStatus(),
        indexPath: '',
        documents: [],
        folders: [],
        semanticLinks: [],
        generatedAt: new Date().toISOString()
      }
    }

    const documents = await inspectMarkdownFiles(root)
    const folderCounts = new Map()
    for (const document of documents) {
      const folder = document.folder || 'Vault root'
      folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1)
    }

    const status = this._setStatus(root, {
      status: this._enabled ? SEARCH_STATUSES.READY : SEARCH_STATUSES.DISABLED,
      indexedDocuments: documents.length,
      totalDocuments: documents.length,
      message: this._enabled ? 'Atomic local search is ready.' : 'Atomic local search disabled.'
    })

    return {
      status,
      indexPath: path.join(root, '.elephantnote', 'atomic'),
      documents,
      semanticLinks: createAtomicLinks(documents),
      folders: [...folderCounts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      generatedAt: new Date().toISOString()
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

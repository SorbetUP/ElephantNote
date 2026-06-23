import { defineStore } from 'pinia'
import log from 'electron-log'
import { useVaultStore } from './vaultStore'
import { elephantnoteClient } from '../services/elephantnoteClient'
import {
  getDocumentTitle,
  parseFrontmatter,
  parseMarkdownTags
} from 'common/elephantnote/markdownDocument'

const DEFAULT_STATUS = Object.freeze({
  status: 'not_initialized',
  vaultPath: '',
  indexedDocuments: 0,
  totalDocuments: 0,
  message: '',
  error: ''
})

const EMPTY_INSPECTION = Object.freeze({
  indexPath: '',
  documents: [],
  folders: [],
  semanticLinks: [],
  graph: null,
  generatedAt: ''
})

const clampQueryLimit = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 20
  return Math.max(1, Math.min(50, Math.trunc(parsed)))
}

const loadSearchPreference = (key, fallback) => {
  const value = window.localStorage.getItem(`elephantnote:search:${key}`)
  return value === null ? fallback : value
}

const withTimeout = (promise, timeoutMs, message) => {
  let timeoutId
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId))
}

const normalizeRelativePath = (relativePath = '') => String(relativePath || '')
  .replace(/\\/g, '/')
  .split('/')
  .filter((part) => part && part !== '.')
  .join('/')

const basenameTitle = (relativePath = '') => {
  const name = normalizeRelativePath(relativePath).split('/').pop() || ''
  return name.replace(/\.md$/i, '') || 'Untitled'
}

const getDocumentPath = (document) => normalizeRelativePath(document?.relativePath || document?.path || '')

const normalizeDocumentForIndex = (relativePath = '', markdown = '', metadata = {}) => {
  const path = normalizeRelativePath(relativePath)
  const content = String(markdown || '')
  const frontmatter = parseFrontmatter(content)
  const title = metadata.title || getDocumentTitle(content, basenameTitle(path))
  const tags = Array.isArray(metadata.tags) ? metadata.tags : parseMarkdownTags(content)
  const body = frontmatter.body || content
  const excerpt = body.replace(/^#\s+.*$/m, '').trim().slice(0, 500)
  const updatedAt = metadata.updatedAt || frontmatter.fields.updatedAt || new Date().toISOString()

  return {
    relativePath: path,
    path,
    title,
    tags,
    content,
    body,
    excerpt,
    updatedAt
  }
}

const normalizeBackendResult = (result = {}) => ({
  ...result,
  relativePath: normalizeRelativePath(result.relativePath || result.path || ''),
  path: normalizeRelativePath(result.path || result.relativePath || '')
})

const scoreDocument = (document, query = '') => {
  const needle = String(query || '').trim().toLowerCase()
  if (!needle) return 0

  const title = String(document.title || '').toLowerCase()
  const path = String(getDocumentPath(document)).toLowerCase()
  const body = String(document.body || document.content || document.excerpt || '').toLowerCase()
  const tags = Array.isArray(document.tags) ? document.tags.join(' ').toLowerCase() : ''

  return (title.includes(needle) ? 10 : 0) +
    (tags.includes(needle) ? 6 : 0) +
    (path.includes(needle) ? 4 : 0) +
    (body.includes(needle) ? 2 : 0)
}

const toSearchResult = (document, score = 0) => ({
  relativePath: getDocumentPath(document),
  title: document.title || basenameTitle(getDocumentPath(document)),
  excerpt: document.excerpt || document.body || '',
  tags: document.tags || [],
  score
})

const emptyInspection = () => ({ ...EMPTY_INSPECTION })

export const useSearchStore = defineStore('elephantnoteSearch', {
  state: () => ({
    isOpen: false,
    vaultPath: '',
    query: '',
    mode: 'exact',
    results: [],
    status: { ...DEFAULT_STATUS },
    indexInspection: emptyInspection(),
    busy: false,
    error: '',
    queryLimit: clampQueryLimit(loadSearchPreference('queryLimit', 20)),
    defaultMode: loadSearchPreference('defaultMode', 'exact'),
    visualizationMode: loadSearchPreference('visualizationMode', 'list'),
    graphDensity: Number(loadSearchPreference('graphDensity', 1)) || 1,
    showVisualizationLabels: false,
    showFolderClusters: false,
    autoRefreshInspection: false,
    polling: false
  }),

  actions: {
    async ensureActiveVault() {
      const vaultStore = useVaultStore()
      const vaultPath = vaultStore.activeVault?.path || this.vaultPath
      if (!vaultPath) return this.status
      this.vaultPath = vaultPath
      if (this.status.vaultPath !== vaultPath && this.status.status !== 'disabled') {
        this.indexInspection = emptyInspection()
        this.results = []
        this.status = await elephantnoteClient.search.initVault(vaultPath)
      }
      return this.status
    },

    open() {
      const vaultStore = useVaultStore()
      this.vaultPath = vaultStore.activeVault?.path || ''
      this.isOpen = true
      this.error = ''
      this.mode = this.defaultMode
      this.ensureActiveVault().then(() => this.refreshStatus())
    },

    close() {
      this.isOpen = false
      this.error = ''
    },

    setMode(mode) {
      if (!['smart', 'exact', 'semantic'].includes(mode)) return
      this.mode = mode
      this.search()
    },

    setQuery(value) {
      this.query = String(value || '')
    },

    updateNoteIndex(relativePath, markdown = '', metadata = {}) {
      const document = normalizeDocumentForIndex(relativePath, markdown, metadata)
      if (!document.relativePath) return false
      const documents = Array.isArray(this.indexInspection.documents)
        ? this.indexInspection.documents
        : []
      const nextDocuments = documents.filter((item) => getDocumentPath(item) !== document.relativePath)

      this.indexInspection = {
        ...this.indexInspection,
        documents: [document, ...nextDocuments],
        generatedAt: new Date().toISOString()
      }
      this.status = {
        ...this.status,
        indexedDocuments: this.indexInspection.documents.length,
        totalDocuments: Math.max(this.status.totalDocuments || 0, this.indexInspection.documents.length)
      }
      if (this.query.trim()) {
        this.results = this.localSearch(this.query, this.queryLimit)
      }
      return true
    },

    removeNoteIndex(relativePath) {
      const path = normalizeRelativePath(relativePath)
      if (!path) return false
      this.indexInspection = {
        ...this.indexInspection,
        documents: (this.indexInspection.documents || []).filter((item) => getDocumentPath(item) !== path),
        generatedAt: new Date().toISOString()
      }
      this.results = this.results.filter((item) => normalizeRelativePath(item.relativePath) !== path)
      return true
    },

    localSearch(query = this.query, limit = this.queryLimit) {
      const documents = Array.isArray(this.indexInspection.documents) ? this.indexInspection.documents : []
      return documents
        .map((document) => ({ document, score: scoreDocument(document, query) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => {
          const scoreDiff = b.score - a.score
          if (scoreDiff) return scoreDiff
          return String(a.document.title || '').localeCompare(String(b.document.title || ''))
        })
        .slice(0, clampQueryLimit(limit))
        .map((item) => toSearchResult(item.document, item.score))
    },

    async refreshStatus() {
      try {
        await this.ensureActiveVault()
        this.status = await elephantnoteClient.search.status()
      } catch (error) {
        this.status = {
          ...DEFAULT_STATUS,
          status: 'error',
          error: error?.message || 'Unable to fetch search status.',
          message: error?.message || 'Unable to fetch search status.'
        }
      }
      return this.status
    },

    async inspect() {
      try {
        await this.ensureActiveVault()
        log.info('[search] inspect:start', { vaultPath: this.vaultPath || '' })
        const inspection = await elephantnoteClient.search.inspect()
        this.indexInspection = {
          ...emptyInspection(),
          ...(inspection || {}),
          documents: Array.isArray(inspection?.documents)
            ? inspection.documents.map((document) => ({
              ...document,
              relativePath: getDocumentPath(document),
              path: getDocumentPath(document)
            }))
            : [],
          folders: Array.isArray(inspection?.folders) ? inspection.folders : [],
          semanticLinks: Array.isArray(inspection?.semanticLinks) ? inspection.semanticLinks : []
        }
        log.info('[search] inspect:done', {
          documents: Array.isArray(this.indexInspection?.documents) ? this.indexInspection.documents.length : 0,
          semanticLinks: Array.isArray(this.indexInspection?.semanticLinks) ? this.indexInspection.semanticLinks.length : 0
        })
      } catch (error) {
        log.error('[search] inspect failed', error)
        this.indexInspection = {
          ...emptyInspection(),
          generatedAt: new Date().toISOString()
        }
      }
      return this.indexInspection
    },

    setQueryLimit(value) {
      this.queryLimit = clampQueryLimit(value)
      window.localStorage.setItem('elephantnote:search:queryLimit', String(this.queryLimit))
    },

    setDefaultMode(mode) {
      if (!['smart', 'exact', 'semantic'].includes(mode)) return
      this.defaultMode = mode
      this.mode = mode
      window.localStorage.setItem('elephantnote:search:defaultMode', mode)
    },

    setVisualizationMode(mode) {
      if (!['space', 'graph', 'list'].includes(mode)) return
      this.visualizationMode = mode
      window.localStorage.setItem('elephantnote:search:visualizationMode', mode)
    },

    setGraphDensity(value) {
      const parsed = Number(value)
      const density = Number.isFinite(parsed) ? Math.trunc(parsed) : 4
      this.graphDensity = Math.max(1, Math.min(8, density))
      window.localStorage.setItem('elephantnote:search:graphDensity', String(this.graphDensity))
    },

    setBooleanOption(key, value) {
      if (!['showVisualizationLabels', 'showFolderClusters', 'autoRefreshInspection'].includes(key)) return
      this[key] = Boolean(value)
      window.localStorage.setItem(`elephantnote:search:${key}`, String(this[key]))
    },

    async hydrateLocalFallback() {
      const hasDocuments = Array.isArray(this.indexInspection.documents) && this.indexInspection.documents.length > 0
      if (hasDocuments) return
      await this.inspect()
    },

    async search() {
      const query = this.query.trim()
      if (!this.vaultPath) {
        await this.ensureActiveVault()
      }
      if (!this.vaultPath) {
        this.results = []
        return []
      }
      if (!query) {
        this.results = []
        await this.refreshStatus()
        return []
      }

      this.busy = true
      this.error = ''
      try {
        const results = await withTimeout(
          elephantnoteClient.search.query({
            query,
            mode: this.mode,
            limit: clampQueryLimit(this.queryLimit)
          }),
          15000,
          'Local search timed out. Try Exact mode or rebuild the semantic index.'
        )
        const backendResults = Array.isArray(results)
          ? results.map(normalizeBackendResult).filter((result) => result.relativePath)
          : []
        if (backendResults.length) {
          this.results = backendResults
          return this.results
        }

        await this.hydrateLocalFallback()
        this.results = this.localSearch(query, this.queryLimit)
        return this.results
      } catch (error) {
        await this.hydrateLocalFallback()
        const fallbackResults = this.localSearch(query, this.queryLimit)
        if (fallbackResults.length) {
          this.error = ''
          this.results = fallbackResults
          return this.results
        }
        this.error = error?.message || 'Search failed.'
        this.results = []
        return []
      } finally {
        this.busy = false
        await this.refreshStatus()
      }
    },

    async rebuild() {
      await this.ensureActiveVault()
      this.busy = true
      try {
        this.status = await elephantnoteClient.search.rebuild()
        this.pollIndexBuild()
      } finally {
        this.busy = false
      }
    },

    async pollIndexBuild() {
      if (this.polling) return
      this.polling = true
      try {
        for (let attempt = 0; attempt < 240; attempt += 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000))
          await this.refreshStatus()
          if (this.status.status !== 'indexing') break
        }
      } finally {
        this.polling = false
      }
    },

    async clear() {
      this.busy = true
      try {
        this.status = await elephantnoteClient.search.clear()
        this.results = []
        this.indexInspection = emptyInspection()
        await this.refreshStatus()
      } finally {
        this.busy = false
      }
    },

    async disable() {
      this.status = await elephantnoteClient.search.disable()
    },

    async enable() {
      this.status = await elephantnoteClient.search.enable()
      const vaultStore = useVaultStore()
      const vaultPath = vaultStore.activeVault?.path || this.vaultPath
      if (vaultPath) {
        this.vaultPath = vaultPath
        this.status = await elephantnoteClient.search.initVault(vaultPath)
      }
      await this.refreshStatus()
    },

    openResult(result) {
      const relativePath = normalizeRelativePath(result?.relativePath || result?.path || '')
      if (!relativePath) return
      const vaultStore = useVaultStore()
      const vaultPath = this.vaultPath || vaultStore.activeVault?.path || ''
      if (!vaultPath) return
      this.vaultPath = vaultPath
      const absolutePath = window.path.join(vaultPath, relativePath)
      window.electron.ipcRenderer.send('mt::open-file', absolutePath, {})
      this.close()
    }
  }
})

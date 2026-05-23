import { defineStore } from 'pinia'
import { useVaultStore } from './vaultStore'
import { elephantnoteClient } from '../services/elephantnoteClient'

const DEFAULT_STATUS = Object.freeze({
  status: 'not_initialized',
  vaultPath: '',
  indexedDocuments: 0,
  totalDocuments: 0,
  message: '',
  error: ''
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

export const useSearchStore = defineStore('elephantnoteSearch', {
  state: () => ({
    isOpen: false,
    vaultPath: '',
    query: '',
    mode: 'exact',
    results: [],
    status: { ...DEFAULT_STATUS },
    indexInspection: {
      indexPath: '',
      documents: [],
      folders: [],
      generatedAt: ''
    },
    busy: false,
    error: '',
    queryLimit: clampQueryLimit(loadSearchPreference('queryLimit', 20)),
    defaultMode: loadSearchPreference('defaultMode', 'exact'),
    visualizationMode: loadSearchPreference('visualizationMode', 'space'),
    graphDensity: Number(loadSearchPreference('graphDensity', 4)) || 4,
    showVisualizationLabels: loadSearchPreference('showVisualizationLabels', 'true') !== 'false',
    showFolderClusters: loadSearchPreference('showFolderClusters', 'true') !== 'false',
    autoRefreshInspection: loadSearchPreference('autoRefreshInspection', 'true') !== 'false',
    polling: false
  }),

  actions: {
    open() {
      const vaultStore = useVaultStore()
      this.vaultPath = vaultStore.activeVault?.path || ''
      this.isOpen = true
      this.error = ''
      this.mode = this.defaultMode
      this.refreshStatus()
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

    async refreshStatus() {
      try {
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
        this.indexInspection = await elephantnoteClient.search.inspect()
      } catch (error) {
        this.indexInspection = {
          indexPath: '',
          documents: [],
          folders: [],
          generatedAt: '',
          error: error?.message || 'Unable to inspect search index.'
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
      this.graphDensity = Math.max(1, Math.min(8, Number.isFinite(parsed) ? Math.trunc(parsed) : 4))
      window.localStorage.setItem('elephantnote:search:graphDensity', String(this.graphDensity))
    },

    setBooleanOption(key, value) {
      if (!['showVisualizationLabels', 'showFolderClusters', 'autoRefreshInspection'].includes(key)) return
      this[key] = Boolean(value)
      window.localStorage.setItem(`elephantnote:search:${key}`, String(this[key]))
    },

    async search() {
      const query = this.query.trim()
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
        this.results = Array.isArray(results) ? results : []
        return this.results
      } catch (error) {
        this.error = error?.message || 'Search failed.'
        this.results = []
        return []
      } finally {
        this.busy = false
        await this.refreshStatus()
      }
    },

    async rebuild() {
      this.busy = true
      try {
        this.status = await elephantnoteClient.search.rebuild()
        await this.refreshStatus()
        await this.inspect()
      } finally {
        this.busy = false
      }
    },

    async clear() {
      this.busy = true
      try {
        this.status = await elephantnoteClient.search.clear()
        this.results = []
        this.indexInspection = {
          indexPath: '',
          documents: [],
          folders: [],
          generatedAt: ''
        }
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
      if (!result?.relativePath || !this.vaultPath) return
      const absolutePath = window.path.join(this.vaultPath, result.relativePath)
      window.electron.ipcRenderer.send('mt::open-file', absolutePath, {})
      this.close()
    }
  }
})

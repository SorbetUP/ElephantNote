import fs from 'fs-extra'
import path from 'path'
import log from 'electron-log'
import {
  SEARCH_MODES,
  SEARCH_STATUSES
} from './searchTypes'
import { VectraIndexManager } from './VectraIndexManager'
import { VaultSearchWatcher } from './VaultSearchWatcher'
import { isIgnoredPath, isMarkdownFile } from './pathSafety'
import { markdownToSearchText } from './markdownToSearchText'

const normalizeVaultRoot = (vaultRoot) => {
  return path.resolve(vaultRoot || '')
}

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

  const walk = async(directory) => {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = path.relative(vaultRoot, absolutePath).split(path.sep).join('/')
      if (isIgnoredPath(relativePath)) {
        continue
      }
      if (entry.isDirectory()) {
        await walk(absolutePath)
      } else if (entry.isFile() && isMarkdownFile(absolutePath)) {
        files.push(absolutePath)
      }
    }
  }

  await walk(vaultRoot)
  return files
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

    const title = path.basename(relativePath, path.extname(relativePath))
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

export class ElephantSearchService {
  constructor() {
    this._managers = new Map()
    this._watchers = new Map()
    this._activeVaultRootByWindow = new Map()
    this._statusByVault = new Map()
    this._initPromises = new Map()
    this._enabled = true
  }

  _getManager(vaultRoot) {
    const root = normalizeVaultRoot(vaultRoot)
    if (!this._managers.has(root)) {
      this._managers.set(root, new VectraIndexManager())
    }
    return this._managers.get(root)
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
    if (!root) {
      return createStatus()
    }

    if (windowId !== null) {
      this._activeVaultRootByWindow.set(windowId, root)
    }

    if (!this._enabled) {
      const status = createStatus({ status: SEARCH_STATUSES.DISABLED, vaultPath: root })
      this._statusByVault.set(status.vaultPath, status)
      return status
    }

    return this._setStatus(root, {
      status: SEARCH_STATUSES.NOT_INITIALIZED,
      message: 'Exact local search is ready. Build the semantic index from settings when needed.',
      error: ''
    })
  }

  async _bootstrapVault(vaultRoot) {
    const manager = this._getManager(vaultRoot)

    try {
      await manager.init(vaultRoot)
      const watcher = this._watchers.get(vaultRoot) || new VaultSearchWatcher({
        onAddOrChange: async(absolutePath) => {
          try {
            await manager.upsertMarkdownFile({ vaultRoot, absolutePath })
            const next = this._getStatus(vaultRoot)
            this._setStatus(vaultRoot, {
              ...next,
              status: SEARCH_STATUSES.READY,
              message: 'Search index ready.'
            })
          } catch (error) {
            log.error('Failed to index markdown file:', error)
          }
        },
        onDelete: async(absolutePath) => {
          try {
            await manager.deleteMarkdownFile({ vaultRoot, absolutePath })
          } catch (error) {
            log.error('Failed to remove markdown file from search index:', error)
          }
        }
      })

      if (!this._watchers.has(vaultRoot)) {
        this._watchers.set(vaultRoot, watcher)
        await watcher.start(vaultRoot)
      }

      const files = await listMarkdownFiles(vaultRoot)
      const totalDocuments = files.length
      this._setStatus(vaultRoot, {
        status: SEARCH_STATUSES.INDEXING,
        indexedDocuments: 0,
        totalDocuments,
        message: 'Indexing notes...'
      })

      let indexedDocuments = 0
      for (const absolutePath of files) {
        try {
          await manager.upsertMarkdownFile({ vaultRoot, absolutePath })
        } catch (error) {
          log.error(`Failed to index "${absolutePath}":`, error)
        }
        indexedDocuments += 1
        this._setStatus(vaultRoot, {
          status: SEARCH_STATUSES.INDEXING,
          indexedDocuments,
          totalDocuments,
          message: 'Indexing notes...'
        })
      }

      this._setStatus(vaultRoot, {
        status: SEARCH_STATUSES.READY,
        indexedDocuments: totalDocuments,
        totalDocuments,
        message: 'Search index ready.',
        error: ''
      })
    } catch (error) {
      const message = error?.message || 'Failed to initialize search.'
      this._setStatus(vaultRoot, {
        status: SEARCH_STATUSES.ERROR,
        message,
        error: message
      })
      throw error
    }
  }

  async search({ query, mode = SEARCH_MODES.SMART, limit = 20 } = {}, windowId = null) {
    if (!this._enabled) return []

    const root = windowId !== null ? this._activeVaultRootByWindow.get(windowId) : null
    if (!root) return []

    const normalizedQuery = String(query || '').trim()
    if (!normalizedQuery) return []

    const manager = this._getManager(root)
    if (!(await manager.isReady())) {
      return exactSearchMarkdownFiles({
        vaultRoot: root,
        query: normalizedQuery,
        limit: Math.max(1, Math.min(50, Number(limit) || 20))
      })
    }

    if (mode === SEARCH_MODES.EXACT) {
      return exactSearchMarkdownFiles({
        vaultRoot: root,
        query: normalizedQuery,
        limit: Math.max(1, Math.min(50, Number(limit) || 20))
      })
    }

    return manager.query({ query: normalizedQuery, mode, limit })
  }

  async indexFile(absolutePath, windowId = null) {
    const root = this._resolveVaultRootForPath(absolutePath, windowId)
    if (!root) return
    await this._getManager(root).upsertMarkdownFile({ vaultRoot: root, absolutePath })
  }

  async deleteFile(absolutePath, windowId = null) {
    const root = this._resolveVaultRootForPath(absolutePath, windowId)
    if (!root) return
    await this._getManager(root).deleteMarkdownFile({ vaultRoot: root, absolutePath })
  }

  async rebuildIndex(windowId = null) {
    const root = this._resolveRootFromWindow(windowId)
    if (!root) return createStatus()

    this._setStatus(root, {
      status: SEARCH_STATUSES.INDEXING,
      message: 'Rebuilding search index...',
      error: ''
    })
    await this._getManager(root).rebuild(root)
    await this._bootstrapVault(root)
    return this._getStatus(root)
  }

  async clearIndex(windowId = null) {
    const root = this._resolveRootFromWindow(windowId)
    if (!root) return createStatus()

    const watcher = this._watchers.get(root)
    if (watcher) {
      await watcher.stop()
      this._watchers.delete(root)
    }
    await this._getManager(root).clear(root)
    const status = this._setStatus(root, {
      status: SEARCH_STATUSES.NOT_INITIALIZED,
      indexedDocuments: 0,
      totalDocuments: 0,
      message: 'Search index cleared.',
      error: ''
    })
    return status
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
        generatedAt: new Date().toISOString()
      }
    }

    const manager = this._getManager(root)
    const documents = await manager.inspectDocuments()
    const folderCounts = new Map()

    for (const document of documents) {
      const folder = document.folder || 'Vault root'
      folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1)
    }

    return {
      status: this._getStatus(root),
      indexPath: manager.getSearchIndexPath(root),
      documents,
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
        message: 'Semantic search disabled.'
      })
    }
    return createStatus({ status: SEARCH_STATUSES.DISABLED, message: 'Semantic search disabled.' })
  }

  enable() {
    this._enabled = true
    return createStatus({ status: SEARCH_STATUSES.NOT_INITIALIZED, message: 'Semantic search enabled.' })
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
    if (windowId !== null && this._activeVaultRootByWindow.has(windowId)) {
      return this._activeVaultRootByWindow.get(windowId)
    }
    if (!absolutePath) return ''
    for (const root of this._activeVaultRootByWindow.values()) {
      if (absolutePath.startsWith(root + path.sep)) {
        return root
      }
    }
    return ''
  }
}

export { createStatus }

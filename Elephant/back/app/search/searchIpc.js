import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'
import { ElephantSearchService } from './ElephantSearchService'
import { SEARCH_MODES } from './searchTypes'

const searchService = new ElephantSearchService()
let atomicIpcImportPromise = null

const INSPECT_CACHE_TTL_MS = 5000
const inspectCacheByWindow = new Map()
const inspectPromiseByWindow = new Map()

const getInspectCacheKey = (windowId) => windowId ?? 'default'

const clearInspectCache = (windowId = null) => {
  if (windowId === null || windowId === undefined) {
    inspectCacheByWindow.clear()
    inspectPromiseByWindow.clear()
    return
  }

  const key = getInspectCacheKey(windowId)
  inspectCacheByWindow.delete(key)
  inspectPromiseByWindow.delete(key)
}

const inspectWithCache = async(windowId) => {
  const key = getInspectCacheKey(windowId)
  const now = Date.now()
  const cached = inspectCacheByWindow.get(key)

  if (cached && now - cached.createdAt < INSPECT_CACHE_TTL_MS) {
    log.info('[search] inspect:cache-hit', { windowId })
    return cached.value
  }

  if (inspectPromiseByWindow.has(key)) {
    log.info('[search] inspect:dedupe', { windowId })
    return inspectPromiseByWindow.get(key)
  }

  const promise = searchService.inspectIndex(windowId)
    .then((value) => {
      inspectCacheByWindow.set(key, {
        createdAt: Date.now(),
        value
      })
      return value
    })
    .finally(() => {
      inspectPromiseByWindow.delete(key)
    })

  inspectPromiseByWindow.set(key, promise)
  return promise
}

const ensureAtomicIpc = () => {
  if (!atomicIpcImportPromise) {
    atomicIpcImportPromise = import('../atomic/atomicIpc').catch((error) => {
      atomicIpcImportPromise = null
      log.warn('Unable to register Atomic IPC:', error)
    })
  }
  return atomicIpcImportPromise
}

export const normalizeSearchMode = (mode) => {
  if (
    mode === SEARCH_MODES.EXACT ||
    mode === SEARCH_MODES.SEMANTIC ||
    mode === SEARCH_MODES.SMART
  ) {
    return mode
  }
  throw new Error('Invalid search mode.')
}

export const clampSearchLimit = (limit) => {
  const parsed = Number(limit)
  if (!Number.isFinite(parsed)) return 20
  return Math.max(1, Math.min(50, Math.trunc(parsed)))
}

export const normalizeSearchQuery = (params = {}) => {
  if (typeof params !== 'object' || params === null) {
    throw new Error('Invalid search payload.')
  }

  if (typeof params.query !== 'string') {
    throw new Error('Query must be a string.')
  }

  return {
    query: params.query,
    mode: normalizeSearchMode(params.mode),
    limit: clampSearchLimit(params.limit)
  }
}

const getSenderWindowId = (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win?.id ?? null
}

export const registerSearchIpc = () => {
  log.info('[search] registering IPC handlers')
  ensureAtomicIpc()

  ipcMain.handle('en:search:init-vault', async(event, vaultPath) => {
    if (typeof vaultPath !== 'string' || !vaultPath.trim()) {
      throw new Error('A vault path is required.')
    }
    const windowId = getSenderWindowId(event)
    clearInspectCache(windowId)
    log.info('[search] init-vault', { windowId, vaultPath })
    return searchService.registerWindowVault(windowId, vaultPath)
  })

  ipcMain.handle('en:search:query', async(event, params) => {
    const payload = normalizeSearchQuery(params)
    log.info('[search] query', {
      windowId: getSenderWindowId(event),
      mode: payload.mode,
      limit: payload.limit,
      query: payload.query.slice(0, 80)
    })
    return searchService.search(payload, getSenderWindowId(event))
  })

  ipcMain.handle('en:search:status', async(event) => {
    log.info('[search] status', { windowId: getSenderWindowId(event) })
    return searchService.getStatus(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:inspect', async(event) => {
    const windowId = getSenderWindowId(event)
    log.info('[search] inspect', { windowId })
    return inspectWithCache(windowId)
  })

  ipcMain.handle('en:search:rebuild', async(event) => {
    const windowId = getSenderWindowId(event)
    clearInspectCache(windowId)
    log.info('[search] rebuild', { windowId })
    const status = await searchService.rebuildIndex(windowId)
    clearInspectCache(windowId)
    return status
  })

  ipcMain.handle('en:search:clear', async(event) => {
    const windowId = getSenderWindowId(event)
    clearInspectCache(windowId)
    log.info('[search] clear', { windowId })
    return searchService.clearIndex(windowId)
  })

  ipcMain.handle('en:search:disable', async() => {
    clearInspectCache()
    log.info('[search] disable')
    return searchService.disable()
  })

  ipcMain.handle('en:search:enable', async() => {
    clearInspectCache()
    log.info('[search] enable')
    return searchService.enable()
  })
}

export const getSearchService = () => searchService

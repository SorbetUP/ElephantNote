import { BrowserWindow, ipcMain } from 'electron'
import log from 'electron-log'
import { ElephantSearchService } from './ElephantSearchService'
import { SEARCH_MODES } from './searchTypes'

const searchService = new ElephantSearchService()
let atomicIpcImportPromise = null

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

  ipcMain.handle('en:search:init-vault', async (event, vaultPath) => {
    if (typeof vaultPath !== 'string' || !vaultPath.trim()) {
      throw new Error('A vault path is required.')
    }
    log.info('[search] init-vault', { windowId: getSenderWindowId(event), vaultPath })
    return searchService.registerWindowVault(getSenderWindowId(event), vaultPath)
  })

  ipcMain.handle('en:search:query', async (event, params) => {
    const payload = normalizeSearchQuery(params)
    log.info('[search] query', {
      windowId: getSenderWindowId(event),
      mode: payload.mode,
      limit: payload.limit,
      query: payload.query.slice(0, 80)
    })
    return searchService.search(payload, getSenderWindowId(event))
  })

  ipcMain.handle('en:search:status', async (event) => {
    log.info('[search] status', { windowId: getSenderWindowId(event) })
    return searchService.getStatus(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:inspect', async (event) => {
    log.info('[search] inspect', { windowId: getSenderWindowId(event) })
    return searchService.inspectIndex(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:rebuild', async (event) => {
    log.info('[search] rebuild', { windowId: getSenderWindowId(event) })
    return searchService.rebuildIndex(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:clear', async (event) => {
    log.info('[search] clear', { windowId: getSenderWindowId(event) })
    return searchService.clearIndex(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:disable', async () => {
    log.info('[search] disable')
    return searchService.disable()
  })

  ipcMain.handle('en:search:enable', async () => {
    log.info('[search] enable')
    return searchService.enable()
  })
}

export const getSearchService = () => searchService

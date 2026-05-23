import { BrowserWindow, ipcMain } from 'electron'
import { ElephantSearchService } from './ElephantSearchService'
import { SEARCH_MODES } from './searchTypes'

const searchService = new ElephantSearchService()

export const normalizeSearchMode = (mode) => {
  if (mode === SEARCH_MODES.EXACT || mode === SEARCH_MODES.SEMANTIC || mode === SEARCH_MODES.SMART) {
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
  ipcMain.handle('en:search:init-vault', async(event, vaultPath) => {
    if (typeof vaultPath !== 'string' || !vaultPath.trim()) {
      throw new Error('A vault path is required.')
    }
    return searchService.registerWindowVault(getSenderWindowId(event), vaultPath)
  })

  ipcMain.handle('en:search:query', async(event, params) => {
    const payload = normalizeSearchQuery(params)
    return searchService.search(payload, getSenderWindowId(event))
  })

  ipcMain.handle('en:search:status', async(event) => {
    return searchService.getStatus(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:inspect', async(event) => {
    return searchService.inspectIndex(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:rebuild', async(event) => {
    return searchService.rebuildIndex(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:clear', async(event) => {
    return searchService.clearIndex(getSenderWindowId(event))
  })

  ipcMain.handle('en:search:disable', async() => {
    return searchService.disable()
  })

  ipcMain.handle('en:search:enable', async() => {
    return searchService.enable()
  })
}

export const getSearchService = () => searchService

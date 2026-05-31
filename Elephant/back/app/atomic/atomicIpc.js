import { BrowserWindow, ipcMain } from 'electron'

import { AtomicFeatureService } from './AtomicFeatureService'

const service = new AtomicFeatureService()

const getSenderWindowId = (event) => BrowserWindow.fromWebContents(event.sender)?.id ?? null

const withWindow = (event, payload = {}) => ({
  ...payload,
  windowId: getSenderWindowId(event)
})

export const registerAtomicFeatureIpc = () => {
  ipcMain.handle('en:atomic:providers', async() => service.providers())
  ipcMain.handle('en:atomic:overview', async(event, payload = {}) => service.overview(withWindow(event, payload)))
  ipcMain.handle('en:atomic:graph', async(event, payload = {}) => service.graph(withWindow(event, payload)))
  ipcMain.handle('en:atomic:wiki', async(event, payload = {}) => service.wiki(withWindow(event, payload)))
  ipcMain.handle('en:atomic:wiki:create-page', async(event, payload = {}) => service.createWikiPage(withWindow(event, payload)))
  ipcMain.handle('en:atomic:summarize', async(event, payload = {}) => service.summarize(withWindow(event, payload)))
  ipcMain.handle('en:atomic:structure', async(event, payload = {}) => service.structure(withWindow(event, payload)))
  ipcMain.handle('en:atomic:models:list-local', async() => service.listLocalModels())
  ipcMain.handle('en:atomic:models:pull', async(_event, payload = {}) => service.pullModel(payload))
}

export const getAtomicFeatureService = () => service

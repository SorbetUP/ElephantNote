import { BrowserWindow, ipcMain } from 'electron'

import { AtomicFeatureService } from './AtomicFeatureService'

const service = new AtomicFeatureService()
let registered = false

const getSenderWindowId = (event) => BrowserWindow.fromWebContents(event.sender)?.id ?? null

const withWindow = (event, payload = {}) => ({
  ...payload,
  windowId: getSenderWindowId(event)
})

const handleOnce = (channel, handler) => {
  ipcMain.removeHandler(channel)
  ipcMain.handle(channel, handler)
}

export const registerAtomicFeatureIpc = () => {
  if (registered) return
  registered = true
  handleOnce('en:atomic:providers', async() => service.providers())
  handleOnce('en:atomic:overview', async(event, payload = {}) => service.overview(withWindow(event, payload)))
  handleOnce('en:atomic:graph', async(event, payload = {}) => service.graph(withWindow(event, payload)))
  handleOnce('en:atomic:wiki', async(event, payload = {}) => service.wiki(withWindow(event, payload)))
  handleOnce('en:atomic:wiki:create-page', async(event, payload = {}) => service.createWikiPage(withWindow(event, payload)))
  handleOnce('en:atomic:summarize', async(event, payload = {}) => service.summarize(withWindow(event, payload)))
  handleOnce('en:atomic:structure', async(event, payload = {}) => service.structure(withWindow(event, payload)))
  handleOnce('en:atomic:models:list-local', async() => service.listLocalModels())
  handleOnce('en:atomic:models:pull', async(_event, payload = {}) => service.pullModel(payload))
}

registerAtomicFeatureIpc()

export const getAtomicFeatureService = () => service

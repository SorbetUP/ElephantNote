import { electronAPI } from '@electron-toolkit/preload'
import { toPlainObject } from '../../Elephant/shared/plainObject.js'

export const createElephantNoteAPI = (ipcRenderer = electronAPI.ipcRenderer) => ({
  api: {
    describe: () => ipcRenderer.invoke('elephantnote:api:describe'),
    call: (action, payload = {}) =>
      ipcRenderer.invoke('elephantnote:api:call', {
        action,
        payload: toPlainObject(payload)
      })
  },
  getVaults: () => ipcRenderer.invoke('elephantnote:getVaults'),
  selectVault: () => ipcRenderer.invoke('elephantnote:selectVault'),
  setActiveVault: (vaultId) => ipcRenderer.invoke('elephantnote:setActiveVault', vaultId),
  setVaultIcon: (payload) =>
    ipcRenderer.invoke('elephantnote:setVaultIcon', toPlainObject(payload)),
  setVaultName: (payload) =>
    ipcRenderer.invoke('elephantnote:setVaultName', toPlainObject(payload)),
  removeVault: (payload) => ipcRenderer.invoke('elephantnote:removeVault', toPlainObject(payload)),
  listDirectory: (relativePath) => ipcRenderer.invoke('elephantnote:listDirectory', relativePath),
  createNote: (payload) => ipcRenderer.invoke('elephantnote:createNote', toPlainObject(payload)),
  createFolder: (payload) =>
    ipcRenderer.invoke('elephantnote:createFolder', toPlainObject(payload)),
  attachSidebarEntry: (payload) =>
    ipcRenderer.invoke('elephantnote:attachSidebarEntry', toPlainObject(payload)),
  detachSidebarEntry: (payload) =>
    ipcRenderer.invoke('elephantnote:detachSidebarEntry', toPlainObject(payload)),
  importGoogleKeep: () => ipcRenderer.invoke('elephantnote:importGoogleKeep'),
  renameEntry: (payload) => ipcRenderer.invoke('elephantnote:renameEntry', toPlainObject(payload)),
  moveEntry: (payload) => ipcRenderer.invoke('elephantnote:moveEntry', toPlainObject(payload)),
  deleteEntry: (payload) => ipcRenderer.invoke('elephantnote:deleteEntry', toPlainObject(payload)),
  search: {
    initVault: (vaultPath) => ipcRenderer.invoke('en:search:init-vault', toPlainObject(vaultPath)),
    query: (params) => ipcRenderer.invoke('en:search:query', toPlainObject(params)),
    status: () => ipcRenderer.invoke('en:search:status'),
    inspect: () => ipcRenderer.invoke('en:search:inspect'),
    rebuild: () => ipcRenderer.invoke('en:search:rebuild'),
    clear: () => ipcRenderer.invoke('en:search:clear'),
    disable: () => ipcRenderer.invoke('en:search:disable'),
    enable: () => ipcRenderer.invoke('en:search:enable')
  },
  atomicFeatures: {
    describeApi: () => ipcRenderer.invoke('en:atomic:api:describe'),
    callApi: (payload = {}) => ipcRenderer.invoke('en:atomic:api:call', toPlainObject(payload)),
    providers: () => ipcRenderer.invoke('en:atomic:providers'),
    overview: (payload = {}) => ipcRenderer.invoke('en:atomic:overview', toPlainObject(payload)),
    graph: (payload = {}) => ipcRenderer.invoke('en:atomic:graph', toPlainObject(payload)),
    wiki: (payload = {}) => ipcRenderer.invoke('en:atomic:wiki', toPlainObject(payload)),
    createWikiPage: (payload = {}) =>
      ipcRenderer.invoke('en:atomic:wiki:create-page', toPlainObject(payload)),
    summarize: (payload = {}) => ipcRenderer.invoke('en:atomic:summarize', toPlainObject(payload)),
    structure: (payload = {}) => ipcRenderer.invoke('en:atomic:structure', toPlainObject(payload)),
    autoNameNote: (payload = {}) =>
      ipcRenderer.invoke('en:atomic:notes:auto-name', toPlainObject(payload)),
    listLocalModels: (payload = {}) =>
      ipcRenderer.invoke('en:atomic:models:list-local', toPlainObject(payload)),
    pullModel: (payload = {}) =>
      ipcRenderer.invoke('en:atomic:models:pull', toPlainObject(payload)),
    onModelPullProgress: (listener) => {
      const handler = (_event, progress) => listener?.(progress)
      ipcRenderer.on?.('en:atomic:models:pull:progress', handler)
      return () => ipcRenderer.removeListener?.('en:atomic:models:pull:progress', handler)
    }
  },
  models: {
    list: () => ipcRenderer.invoke('elephantnote:models:list'),
    searchHuggingFace: (payload = {}) =>
      ipcRenderer.invoke('elephantnote:models:search-hf', toPlainObject(payload)),
    info: (payload = {}) => ipcRenderer.invoke('elephantnote:models:info', toPlainObject(payload)),
    download: (payload = {}) =>
      ipcRenderer.invoke('elephantnote:models:download', toPlainObject(payload)),
    cancelDownload: (payload = {}) =>
      ipcRenderer.invoke('elephantnote:models:download:cancel', toPlainObject(payload)),
    activate: (payload = {}) =>
      ipcRenderer.invoke('elephantnote:models:activate', toPlainObject(payload)),
    deactivate: (payload = {}) =>
      ipcRenderer.invoke('elephantnote:models:deactivate', toPlainObject(payload)),
    remove: (payload = {}) =>
      ipcRenderer.invoke('elephantnote:models:delete', toPlainObject(payload)),
    active: () => ipcRenderer.invoke('elephantnote:models:active'),
    downloadStatus: (payload = {}) =>
      ipcRenderer.invoke('elephantnote:models:download-status', toPlainObject(payload)),
    refreshIndex: () => ipcRenderer.invoke('elephantnote:models:refresh-index'),
    onDownloadProgress: (listener) => {
      const handler = (_event, progress) => listener?.(progress)
      ipcRenderer.on?.('elephantnote:models:download:progress', handler)
      return () => ipcRenderer.removeListener?.('elephantnote:models:download:progress', handler)
    }
  },
  sitePreview: {
    previewFolder: (params) =>
      ipcRenderer.invoke('en:site-preview:preview-folder', toPlainObject(params)),
    buildFolder: (params) =>
      ipcRenderer.invoke('en:site-preview:build-folder', toPlainObject(params)),
    stop: (siteId) => ipcRenderer.invoke('en:site-preview:stop', siteId),
    status: (siteId) => ipcRenderer.invoke('en:site-preview:status', siteId),
    openExternal: (url) => ipcRenderer.invoke('en:site-preview:open-external', url)
  },
  agents: {
    list: () => ipcRenderer.invoke('en:agents:list'),
    register: (payload) => ipcRenderer.invoke('en:agents:register', toPlainObject(payload)),
    unregister: (id) => ipcRenderer.invoke('en:agents:unregister', id),
    send: (payload) => ipcRenderer.invoke('en:agents:send', toPlainObject(payload))
  }
})

import { electronAPI } from '@electron-toolkit/preload'

export const createElephantNoteAPI = (ipcRenderer = electronAPI.ipcRenderer) => ({
  api: {
    describe: () => ipcRenderer.invoke('elephantnote:api:describe'),
    call: (action, payload = {}) => ipcRenderer.invoke('elephantnote:api:call', { action, payload })
  },
  getVaults: () => ipcRenderer.invoke('elephantnote:getVaults'),
  selectVault: () => ipcRenderer.invoke('elephantnote:selectVault'),
  setActiveVault: (vaultId) => ipcRenderer.invoke('elephantnote:setActiveVault', vaultId),
  setVaultIcon: (payload) => ipcRenderer.invoke('elephantnote:setVaultIcon', payload),
  setVaultName: (payload) => ipcRenderer.invoke('elephantnote:setVaultName', payload),
  removeVault: (payload) => ipcRenderer.invoke('elephantnote:removeVault', payload),
  listDirectory: (relativePath) => ipcRenderer.invoke('elephantnote:listDirectory', relativePath),
  createNote: (payload) => ipcRenderer.invoke('elephantnote:createNote', payload),
  createFolder: (payload) => ipcRenderer.invoke('elephantnote:createFolder', payload),
  attachSidebarEntry: (payload) => ipcRenderer.invoke('elephantnote:attachSidebarEntry', payload),
  detachSidebarEntry: (payload) => ipcRenderer.invoke('elephantnote:detachSidebarEntry', payload),
  importGoogleKeep: () => ipcRenderer.invoke('elephantnote:importGoogleKeep'),
  renameEntry: (payload) => ipcRenderer.invoke('elephantnote:renameEntry', payload),
  moveEntry: (payload) => ipcRenderer.invoke('elephantnote:moveEntry', payload),
  deleteEntry: (payload) => ipcRenderer.invoke('elephantnote:deleteEntry', payload),
  search: {
    initVault: (vaultPath) => ipcRenderer.invoke('en:search:init-vault', vaultPath),
    query: (params) => ipcRenderer.invoke('en:search:query', params),
    status: () => ipcRenderer.invoke('en:search:status'),
    inspect: () => ipcRenderer.invoke('en:search:inspect'),
    rebuild: () => ipcRenderer.invoke('en:search:rebuild'),
    clear: () => ipcRenderer.invoke('en:search:clear'),
    disable: () => ipcRenderer.invoke('en:search:disable'),
    enable: () => ipcRenderer.invoke('en:search:enable')
  },
  atomicFeatures: {
    describeApi: () => ipcRenderer.invoke('en:atomic:api:describe'),
    callApi: (payload = {}) => ipcRenderer.invoke('en:atomic:api:call', payload),
    providers: () => ipcRenderer.invoke('en:atomic:providers'),
    overview: (payload = {}) => ipcRenderer.invoke('en:atomic:overview', payload),
    graph: (payload = {}) => ipcRenderer.invoke('en:atomic:graph', payload),
    wiki: (payload = {}) => ipcRenderer.invoke('en:atomic:wiki', payload),
    createWikiPage: (payload = {}) => ipcRenderer.invoke('en:atomic:wiki:create-page', payload),
    summarize: (payload = {}) => ipcRenderer.invoke('en:atomic:summarize', payload),
    structure: (payload = {}) => ipcRenderer.invoke('en:atomic:structure', payload),
    autoNameNote: (payload = {}) => ipcRenderer.invoke('en:atomic:notes:auto-name', payload),
    listLocalModels: (payload = {}) => ipcRenderer.invoke('en:atomic:models:list-local', payload),
    pullModel: (payload = {}) => ipcRenderer.invoke('en:atomic:models:pull', payload),
    onModelPullProgress: (listener) => {
      const handler = (_event, progress) => listener?.(progress)
      ipcRenderer.on?.('en:atomic:models:pull:progress', handler)
      return () => ipcRenderer.removeListener?.('en:atomic:models:pull:progress', handler)
    }
  },
  sitePreview: {
    previewFolder: (params) => ipcRenderer.invoke('en:site-preview:preview-folder', params),
    buildFolder: (params) => ipcRenderer.invoke('en:site-preview:build-folder', params),
    stop: (siteId) => ipcRenderer.invoke('en:site-preview:stop', siteId),
    status: (siteId) => ipcRenderer.invoke('en:site-preview:status', siteId),
    openExternal: (url) => ipcRenderer.invoke('en:site-preview:open-external', url)
  },
  agents: {
    list: () => ipcRenderer.invoke('en:agents:list'),
    register: (payload) => ipcRenderer.invoke('en:agents:register', payload),
    unregister: (id) => ipcRenderer.invoke('en:agents:unregister', id),
    send: (payload) => ipcRenderer.invoke('en:agents:send', payload)
  }
})

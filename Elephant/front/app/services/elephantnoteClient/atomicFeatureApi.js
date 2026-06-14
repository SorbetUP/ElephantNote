const getBridge = () => globalThis.window?.elephantnote
const getElectronIpc = () => globalThis.window?.electron?.ipcRenderer

export const requireAtomicFeatureApi = () => {
  const atomicFeatures = getBridge()?.atomicFeatures
  if (atomicFeatures) return atomicFeatures

  const ipcRenderer = getElectronIpc()
  if (!ipcRenderer?.invoke) {
    throw new Error('Atomic feature IPC is not available in this renderer context.')
  }

  return {
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
  }
}

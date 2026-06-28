import { toPlainObject } from '../../../../shared/plainObject.js'

const getBridge = () => globalThis.window?.elephantnote
const getElectronIpc = () => globalThis.window?.tauri?.ipcRenderer

export const requireAtomicFeatureApi = () => {
  const atomicFeatures = getBridge()?.atomicFeatures
  if (atomicFeatures) return atomicFeatures

  const ipcRenderer = getElectronIpc()
  if (!ipcRenderer?.invoke) {
    throw new Error('Atomic feature IPC is not available in this renderer context.')
  }

  return {
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
  }
}

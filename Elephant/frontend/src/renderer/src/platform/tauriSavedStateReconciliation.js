import { getActivePinia } from 'pinia'
import { useEditorStore } from '@/store/editor'
import { checkpointBufferedState } from '@/store/bufferedState'

const INSTALL_FLAG = '__elephantSavedStateReconciliationInstalled'
const INSTALL_ATTEMPTS = 3000
const POLL_MS = 20

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const reconcile = (store, tabId, isSaved) => {
  if (!tabId) return false

  let reconciled = false
  store.$patch((state) => {
    const tab = state.tabs.find((entry) => entry?.id === tabId)
    if (tab) {
      tab.isSaved = isSaved
      reconciled = true
    }
    if (state.currentFile?.id === tabId) {
      state.currentFile.isSaved = isSaved
      if (isSaved && tab?.lastSavedHistoryId !== undefined) {
        state.currentFile.lastSavedHistoryId = tab.lastSavedHistoryId
      }
      reconciled = true
    }
  })
  return reconciled
}

const checkpointReconciledSave = (tabId) => {
  void checkpointBufferedState().catch((error) => {
    console.error('[tauri:marktext-save] unable to checkpoint reconciled saved state', {
      tabId,
      error: error?.message || String(error)
    })
  })
}

export const installTauriSavedStateReconciliation = (target = globalThis) => {
  if (target[INSTALL_FLAG] === true) return true
  const ipc = target.tauri?.ipcRenderer
  const pinia = getActivePinia()
  if (!ipc?.on || !pinia) return false

  const store = useEditorStore(pinia)
  ipc.on('mt::tab-saved', (_event, tabId) => {
    const reconciled = reconcile(store, tabId, true)
    console.info('[tauri:marktext-save] saved state reconciled', {
      tabId,
      reconciled,
      currentFileId: store.currentFile?.id || null,
      currentFileSaved: store.currentFile?.id === tabId ? store.currentFile?.isSaved === true : null
    })
    if (reconciled) checkpointReconciledSave(tabId)
  })
  ipc.on('mt::tab-save-failure', (_event, tabId) => {
    reconcile(store, tabId, false)
  })

  Object.defineProperty(target, INSTALL_FLAG, {
    configurable: true,
    enumerable: false,
    value: true
  })
  console.info('[tauri:marktext-save] saved state reconciliation installed')
  return true
}

const installWhenReady = async(target = globalThis) => {
  for (let attempt = 0; attempt < INSTALL_ATTEMPTS; attempt += 1) {
    if (installTauriSavedStateReconciliation(target)) return true
    await wait(POLL_MS)
  }
  console.error('[tauri:marktext-save] saved state reconciliation was not installed')
  return false
}

void installWhenReady()

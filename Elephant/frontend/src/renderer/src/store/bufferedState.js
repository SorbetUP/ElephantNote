import debounce from 'lodash/debounce'
import log from '@/platform/runtimeLogShim'
import { toPlainObject } from 'elephant-shared/plainObject'
import { useEditorStore } from './editor'
import { useProjectStore } from './project'
import { useLayoutStore } from './layout'

const BUFFERED_STATE_DEBOUNCE_MS = 1000
const BUFFERED_STATE_VERSION = 1
const RECOVERY_BUFFER_WINDOW_ID = 'renderer-recovery'

let stores = {
  editorStore: null,
  projectStore: null,
  layoutStore: null
}

let requestedRevision = 0
let persistedRevision = 0
let queuedCheckpoint = null
let checkpointDrain = null
let checkpointError = null

export const createBufferedState = () => {
  if (!stores.editorStore) {
    stores.editorStore = useEditorStore()
  }
  if (!stores.projectStore) {
    stores.projectStore = useProjectStore()
  }
  if (!stores.layoutStore) {
    stores.layoutStore = useLayoutStore()
  }

  const editorState = stores.editorStore.CREATE_BUFFERED_STATE()
  if (!editorState) return null

  return {
    version: BUFFERED_STATE_VERSION,
    ...editorState,
    project: stores.projectStore?.CREATE_BUFFERED_STATE?.() || null,
    layout: stores.layoutStore?.CREATE_BUFFERED_STATE?.() || null
  }
}

const checkpointDiagnostics = {
  get requestedRevision () {
    return requestedRevision
  },
  get persistedRevision () {
    return persistedRevision
  },
  get pending () {
    return Boolean(queuedCheckpoint || checkpointDrain)
  },
  get error () {
    return checkpointError ? (checkpointError.message || String(checkpointError)) : null
  },
  flush: (revision) => flushBufferedState(revision)
}

globalThis.__ELEPHANT_BUFFERED_STATE_CHECKPOINT__ = checkpointDiagnostics

const persistDurableCheckpoint = async(snapshot) => {
  const plainSnapshot = toPlainObject(snapshot)
  const coreInvoke = window.__TAURI__?.core?.invoke
  if (typeof coreInvoke !== 'function') {
    throw new Error('Tauri core invoke is unavailable for durable recovery checkpoint persistence')
  }

  // The packaged desktop recovery contract requires a real durability boundary before
  // input acknowledgement. BufferStore uses write_json_atomically(), which fsyncs the
  // temporary file and parent directory before this command resolves.
  await coreInvoke('tauri_buffer_save', {
    windowId: RECOVERY_BUFFER_WINDOW_ID,
    buffer: {
      open_tabs: [],
      unsaved_markdown: {},
      window_state: plainSnapshot
    }
  })

  // Keep the existing WebKit/localStorage mirror for migration and older installs, but
  // never treat that mirror as the durability proof for crash recovery.
  await window.tauri.ipcRenderer.invoke('update-buffer-state', plainSnapshot)
}

const drainCheckpoints = async() => {
  while (queuedCheckpoint) {
    const checkpoint = queuedCheckpoint
    queuedCheckpoint = null
    try {
      await persistDurableCheckpoint(checkpoint.snapshot)
      persistedRevision = Math.max(persistedRevision, checkpoint.revision)
      checkpointError = null
      console.info('[elephantnote:recovery] checkpoint:persisted', {
        revision: checkpoint.revision,
        currentFileId: checkpoint.snapshot.currentFileId || null,
        tabCount: Array.isArray(checkpoint.snapshot.tabs) ? checkpoint.snapshot.tabs.length : 0
      })
    } catch (error) {
      checkpointError = error
      if (!queuedCheckpoint || queuedCheckpoint.revision < checkpoint.revision) {
        queuedCheckpoint = checkpoint
      }
      console.error('[elephantnote:recovery] checkpoint:failed', {
        revision: checkpoint.revision,
        error: error?.message || String(error)
      })
      throw error
    }
  }
}

const ensureCheckpointDrain = () => {
  if (!checkpointDrain) {
    checkpointDrain = drainCheckpoints().finally(() => {
      checkpointDrain = null
      if (queuedCheckpoint && !checkpointError) ensureCheckpointDrain()
    })
  }
  return checkpointDrain
}

const waitForBufferedRevision = async(target) => {
  if (persistedRevision >= target) return true
  if (checkpointError) throw checkpointError
  if (queuedCheckpoint) ensureCheckpointDrain()
  const activeDrain = checkpointDrain
  if (!activeDrain) return false
  await activeDrain
  return waitForBufferedRevision(target)
}

export const flushBufferedState = (targetRevision = requestedRevision) => {
  const target = Number(targetRevision || 0)
  return waitForBufferedRevision(target)
}

export const checkpointBufferedState = () => {
  const snapshot = createBufferedState()
  if (!snapshot) return Promise.resolve(false)

  const revision = ++requestedRevision
  checkpointError = null
  queuedCheckpoint = { revision, snapshot }
  ensureCheckpointDrain()
  return flushBufferedState(revision)
}

export const sendBufferedState = checkpointBufferedState

export const debouncedSendBufferedState = debounce(() => {
  checkpointBufferedState().catch((err) => {
    log.error('[buffered-state] failed to update buffered state', err)
  })
}, BUFFERED_STATE_DEBOUNCE_MS)

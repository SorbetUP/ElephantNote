import debounce from 'lodash/debounce'
import log from '@/platform/electronLogShim'
import { toPlainObject } from '../../../../Elephant/shared/plainObject.js'
import { useEditorStore } from './editor'
import { useProjectStore } from './project'
import { useLayoutStore } from './layout'

const BUFFERED_STATE_DEBOUNCE_MS = 1000
const BUFFERED_STATE_VERSION = 1

let stores = {
  editorStore: null,
  projectStore: null,
  layoutStore: null
}

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

export const sendBufferedState = () => {
  const snapshot = createBufferedState()
  if (snapshot) {
    return window.electron.ipcRenderer.invoke('update-buffer-state', toPlainObject(snapshot))
  }

  return Promise.resolve(false)
}

export const debouncedSendBufferedState = debounce(() => {
  sendBufferedState().catch((err) => {
    log.error('[buffered-state] failed to update buffered state', err)
  })
}, BUFFERED_STATE_DEBOUNCE_MS)

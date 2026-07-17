import bus from '@/bus'
import { useEditorStore } from '@/store/editor'
import { useVaultStore } from 'elephant-front/stores/vaultStore'

const PREFIX = '[acceptance-test]'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const log = (target, event, data = {}) => {
  const entry = { at: new Date().toISOString(), event, ...data }
  console.info(`${PREFIX} ${event}`, data)
  const logs = target.__ELEPHANT_DEBUG_LOGS__ = Array.isArray(target.__ELEPHANT_DEBUG_LOGS__)
    ? target.__ELEPHANT_DEBUG_LOGS__
    : []
  logs.push(entry)
  if (logs.length > 1000) logs.splice(0, logs.length - 1000)
  return entry
}

const displayedSurface = (documentObject) => documentObject?.querySelector?.(
  '[contenteditable="true"], .cm-content, .muya-editor'
)

const snapshot = (target, editorStore, vaultStore) => {
  const file = editorStore.currentFile || {}
  const surface = displayedSurface(target.document)
  return {
    notePath: file.pathname || vaultStore.openedNotePath || '',
    markdown: typeof file.markdown === 'string' ? file.markdown : '',
    isSaved: file.isSaved !== false,
    displayedText: surface?.innerText || surface?.textContent || '',
    displayedHtml: surface?.innerHTML || '',
    activeVault: vaultStore.activeVault?.path || null
  }
}

const findEntry = (vaultStore, path) => {
  const entries = [...(vaultStore.entries || []), ...(vaultStore.rootEntries || [])]
  return entries.find((entry) => entry?.path === path) || {
    path,
    title: path.split('/').pop()?.replace(/\.md$/i, '') || 'Acceptance test note',
    type: 'file'
  }
}

export const installAcceptanceTestBridge = ({
  target = globalThis,
  pinia,
  editorStore = useEditorStore(pinia),
  vaultStore = useVaultStore(pinia)
} = {}) => {
  if (target.__ELEPHANT_ACCEPTANCE_TEST__) return target.__ELEPHANT_ACCEPTANCE_TEST__

  const api = {
    async openNote(path) {
      if (!path || typeof path !== 'string') throw new TypeError('openNote requires a relative Markdown path')
      if (!vaultStore.activeVault?.path) throw new Error('openNote requires an active vault')
      log(target, 'open:start', { path })
      vaultStore.openNote(findEntry(vaultStore, path), { record: false })
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (editorStore.currentFile?.pathname?.endsWith(path)) {
          const state = snapshot(target, editorStore, vaultStore)
          log(target, 'open:done', { path, markdownLength: state.markdown.length })
          return state
        }
        await wait(25)
      }
      throw new Error(`Timed out opening note: ${path}`)
    },

    setMarkdown(markdown) {
      if (typeof markdown !== 'string') throw new TypeError('setMarkdown requires a string')
      if (!editorStore.currentFile?.id) throw new Error('setMarkdown requires an open note')
      editorStore.currentFile.markdown = markdown
      editorStore.currentFile.isSaved = false
      bus.emit('file-changed', {
        id: editorStore.currentFile.id,
        markdown,
        cursor: editorStore.currentFile.cursor,
        renderCursor: true,
        history: editorStore.currentFile.history,
        scrollTop: editorStore.currentFile.scrollTop
      })
      const state = snapshot(target, editorStore, vaultStore)
      log(target, 'edit:set-markdown', { notePath: state.notePath, markdownLength: markdown.length })
      return state
    },

    appendMarkdown(text) {
      if (typeof text !== 'string') throw new TypeError('appendMarkdown requires a string')
      return api.setMarkdown(`${editorStore.currentFile?.markdown || ''}${text}`)
    },

    async save() {
      if (!editorStore.currentFile?.id) throw new Error('save requires an open note')
      log(target, 'save:start', { notePath: editorStore.currentFile.pathname || '' })
      editorStore.FILE_SAVE()
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (editorStore.currentFile?.isSaved === true) {
          const state = snapshot(target, editorStore, vaultStore)
          log(target, 'save:done', { notePath: state.notePath, markdownLength: state.markdown.length })
          return state
        }
        await wait(25)
      }
      throw new Error(`Timed out saving note: ${editorStore.currentFile.pathname || ''}`)
    },

    readDisplayed() {
      const state = snapshot(target, editorStore, vaultStore)
      log(target, 'read:displayed', { notePath: state.notePath, displayedLength: state.displayedText.length })
      return state
    },

    readState() {
      const state = snapshot(target, editorStore, vaultStore)
      log(target, 'read:state', { notePath: state.notePath, markdownLength: state.markdown.length })
      return state
    },

    logs() {
      return [...(target.__ELEPHANT_DEBUG_LOGS__ || [])]
    }
  }

  target.__ELEPHANT_ACCEPTANCE_TEST__ = api
  log(target, 'installed', { commands: Object.keys(api).filter((key) => key !== 'logs') })
  return api
}


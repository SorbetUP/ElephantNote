import bus from '@/bus'
import { useVaultStore } from 'elephant-front/stores/vaultStore'

const FLAG = '__ELEPHANT_MOBILE_NOTE_ACTIONS__'

const splitPath = (pathname = '') => {
  const parts = String(pathname || '').split('/').filter(Boolean)
  const fileName = parts.pop() || 'Untitled.md'
  return { parent: parts.join('/'), fileName }
}

const extensionParts = (fileName = '') => {
  const match = String(fileName).match(/^(.*?)(\.[^.]+)?$/)
  return {
    base: match?.[1] || 'Untitled',
    extension: match?.[2] || '.md'
  }
}

const joinPath = (...parts) => parts
  .flatMap((part) => String(part || '').split('/'))
  .filter(Boolean)
  .join('/')

const duplicateCurrentNote = async (target) => {
  const store = useVaultStore()
  const sourcePath = store.openedNotePath
  if (!sourcePath) throw new Error('Open a note before duplicating it.')
  const bridge = target.elephantnote
  if (!bridge?.notes?.read || !bridge?.notes?.write || !bridge?.listDirectory) {
    throw new Error('The native note backend is unavailable.')
  }

  const { parent, fileName } = splitPath(sourcePath)
  const { base, extension } = extensionParts(fileName)
  const entries = await bridge.listDirectory({ relativePath: parent, includePreview: false })
  const existing = new Set((Array.isArray(entries) ? entries : []).map((entry) => entry.path))
  let index = 1
  let candidate
  do {
    const suffix = index === 1 ? ' copy' : ` copy ${index}`
    candidate = joinPath(parent, `${base}${suffix}${extension}`)
    index += 1
  } while (existing.has(candidate))

  const source = await bridge.notes.read({ relativePath: sourcePath })
  const markdown = String(source?.content ?? source?.markdown ?? '')
  await bridge.notes.write({ relativePath: candidate, markdown })
  const refreshed = await bridge.listDirectory({ relativePath: parent, includePreview: true })
  if (parent === store.currentPath) store.entries = refreshed
  if (!parent) store.rootEntries = refreshed
  const entry = refreshed.find((item) => item.path === candidate) || {
    path: candidate,
    title: `${base} copy`,
    kind: 'note',
    type: 'note',
    updatedAt: new Date().toISOString()
  }
  store.openNote(entry)
}

const openTagEditor = (target) => {
  const addButton = target.document.querySelector('.en-main.has-editor-open .en-note-chip-add')
  if (addButton) {
    addButton.click()
    return true
  }
  const firstTag = target.document.querySelector('.en-main.has-editor-open .en-note-chip:not(.en-note-chip-muted)')
  firstTag?.click?.()
  return !!firstTag
}

export const installMobileNoteActionsRuntime = (target = globalThis) => {
  if (!target?.document || target[FLAG]) return false
  target[FLAG] = true

  const onDuplicate = () => {
    void duplicateCurrentNote(target).catch((error) => {
      console.error('[mobile-note-actions] duplicate failed', error)
      target.alert?.(error?.message || String(error))
    })
  }
  const onTags = () => {
    if (!openTagEditor(target)) target.alert?.('No note is currently open.')
  }

  bus.on('elephantnote:duplicate-note', onDuplicate)
  bus.on('elephantnote:open-tags', onTags)

  target.__ELEPHANT_MOBILE_NOTE_ACTIONS_DISPOSE__ = () => {
    bus.off('elephantnote:duplicate-note', onDuplicate)
    bus.off('elephantnote:open-tags', onTags)
    target[FLAG] = false
  }
  return true
}

installMobileNoteActionsRuntime()

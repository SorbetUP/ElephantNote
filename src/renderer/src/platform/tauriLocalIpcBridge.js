const LOCAL_IPC_EVENTS = new Set([
  'mt::response-file-save',
  'mt::response-file-save-as',
  'mt::save-tabs',
  'mt::save-and-close-tabs',
  'mt::tab-saved',
  'mt::tab-save-failure',
  'mt::force-close-tabs-by-id'
])

const NOTE_OPEN_EVENTS = new Set([
  'mt::open-file',
  'mt::open-file-by-window-id'
])

const normalizePath = (value = '') => String(value || '').replace(/\\/g, '/').replace(/\/+/g, '/')

const dispatchLocalIpcEvent = (target, channel, args) => {
  target.dispatchEvent(new CustomEvent(channel, { detail: args }))
}

const getBasename = (target, pathname = '') => (
  target.path?.basename?.(pathname) || normalizePath(pathname).split('/').filter(Boolean).pop() || 'Untitled.md'
)

const getRelativeVaultPath = (target, vaultRoot = '', filePath = '') => {
  if (!vaultRoot || !filePath) return ''
  const relative = target.path?.relative?.(vaultRoot, filePath) || ''
  if (!relative || relative.startsWith('..') || target.path?.isAbsolute?.(relative)) return ''
  return normalizePath(relative)
}

const readVaultNote = async(target, relativePath) => {
  if (typeof target.elephantnote?.notes?.read === 'function') {
    return target.elephantnote.notes.read({ relativePath })
  }
  if (typeof target.elephantnote?.readNote === 'function') {
    return target.elephantnote.readNote({ relativePath })
  }
  return null
}

const openVaultNoteWithBackend = async(target, channel, args) => {
  const filePath = args[0]
  if (!filePath || typeof target.elephantnote?.getVaults !== 'function') return false

  try {
    const payload = await target.elephantnote.getVaults()
    const vaultRoot = payload?.activeVault?.path || ''
    const relativePath = getRelativeVaultPath(target, vaultRoot, filePath)
    if (!relativePath) return false

    const note = await readVaultNote(target, relativePath)
    const markdown = typeof note?.markdown === 'string'
      ? note.markdown
      : (typeof note?.content === 'string' ? note.content : null)
    if (markdown === null) return false

    console.info('[tauri:local-ipc] open-file via notes.read', {
      channel,
      relativePath,
      length: markdown.length
    })
    dispatchLocalIpcEvent(target, 'mt::open-new-tab', [
      {
        pathname: note?.fullPath || filePath,
        filename: getBasename(target, note?.fullPath || filePath),
        markdown,
        isMixedLineEndings: false
      },
      {},
      true
    ])
    return true
  } catch (error) {
    console.error('[tauri:local-ipc] open-file notes.read failed; falling back to native open', {
      channel,
      filePath,
      error: error?.message || String(error)
    })
    return false
  }
}

export const installTauriLocalIpcBridge = (target = globalThis) => {
  if (!target?.__TAURI__ || target.__TAURI_LOCAL_IPC_BRIDGE_INSTALLED__) return false
  const ipc = target.electron?.ipcRenderer
  if (!ipc?.send) return false

  const nativeSend = ipc.send.bind(ipc)
  ipc.send = (channel, ...args) => {
    if (NOTE_OPEN_EVENTS.has(channel)) {
      void openVaultNoteWithBackend(target, channel, args).then((handled) => {
        if (!handled) nativeSend(channel, ...args)
      })
      return undefined
    }

    if (LOCAL_IPC_EVENTS.has(channel)) {
      console.info('[tauri:local-ipc] dispatch', { channel })
      dispatchLocalIpcEvent(target, channel, args)
      return undefined
    }
    return nativeSend(channel, ...args)
  }

  target.__TAURI_LOCAL_IPC_BRIDGE_INSTALLED__ = true
  console.info('[tauri:local-ipc] bridge:installed')
  return true
}

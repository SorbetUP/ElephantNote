const LOCAL_IPC_EVENTS = new Set([
  'mt::response-file-save',
  'mt::save-tabs',
  'mt::save-and-close-tabs',
  'mt::tab-saved',
  'mt::tab-save-failure',
  'mt::force-close-tabs-by-id'
])

const dispatchLocalIpcEvent = (target, channel, args) => {
  target.dispatchEvent(new CustomEvent(channel, { detail: args }))
}

export const installTauriLocalIpcBridge = (target = globalThis) => {
  if (!target?.__TAURI__ || target.__TAURI_LOCAL_IPC_BRIDGE_INSTALLED__) return false
  const ipc = target.electron?.ipcRenderer
  if (!ipc?.send) return false

  const nativeSend = ipc.send.bind(ipc)
  ipc.send = (channel, ...args) => {
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

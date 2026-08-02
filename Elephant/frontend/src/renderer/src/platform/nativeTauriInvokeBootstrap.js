import { invoke as nativeInvoke } from '@tauri-apps/api/core'

const BOOTSTRAP_FLAG = '__elephantNativeTauriInvokeBootstrapInstalled'

const patchIpcRenderer = (target = globalThis) => {
  const tauri = target.tauri && typeof target.tauri === 'object'
    ? target.tauri
    : {}
  const ipcRenderer = tauri.ipcRenderer && typeof tauri.ipcRenderer === 'object'
    ? tauri.ipcRenderer
    : {}

  Object.defineProperty(ipcRenderer, 'invoke', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: (command, payload) => nativeInvoke(command, payload)
  })
  Object.defineProperty(ipcRenderer, BOOTSTRAP_FLAG, {
    configurable: true,
    value: true
  })

  if (tauri.ipcRenderer !== ipcRenderer) {
    Object.defineProperty(tauri, 'ipcRenderer', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: ipcRenderer
    })
  }
  if (target.tauri !== tauri) {
    Object.defineProperty(target, 'tauri', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: tauri
    })
  }

  target.__ELEPHANT_NATIVE_TAURI_INVOKE__ = nativeInvoke
  console.info('[elephantnote:tauri] official @tauri-apps/api/core invoke installed before renderer startup')
  return true
}

try {
  patchIpcRenderer()
} catch (error) {
  console.error('[elephantnote:tauri] official invoke bootstrap failed', {
    message: error?.message || String(error)
  })
  throw error
}

export { patchIpcRenderer }

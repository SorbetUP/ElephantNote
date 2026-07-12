// Electron 2 did not expose deviceMemory, so preserve Muya's historical fallback.
export const DEVICE_MEMORY = navigator.deviceMemory || 4
export const UNDO_DEPTH = DEVICE_MEMORY >= 4 ? 100 : 50

export const isOsx = window && window.navigator && /Mac/.test(window.navigator.platform)
export const isWin =
  window &&
  window.navigator.userAgent &&
  /win32|wow32|win64|wow64/i.test(window.navigator.userAgent)

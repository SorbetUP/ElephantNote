export const normalizePackagedNotePath = (value) => String(value ?? '')
  .replace(/\\/g, '/')
  .replace(/\/{2,}/g, '/')
  .replace(/\/$/, '')

export const packagedNotePathMatches = (actualPath, expectedPath) => {
  const actual = normalizePackagedNotePath(actualPath)
  const expected = normalizePackagedNotePath(expectedPath).replace(/^\/+/, '')
  if (!actual || !expected) return false
  return actual === expected || actual.endsWith(`/${expected}`)
}

export const resolveCanonicalTauriInvoke = (target = globalThis) => {
  const nativeCore = target?.__TAURI__?.core
  if (typeof nativeCore?.invoke === 'function') {
    return {
      kind: 'native',
      invoke: nativeCore.invoke.bind(nativeCore)
    }
  }

  const legacyIpc = target?.tauri?.ipcRenderer
  if (typeof legacyIpc?.invoke === 'function') {
    return {
      kind: 'legacy',
      invoke: legacyIpc.invoke.bind(legacyIpc)
    }
  }

  return { kind: 'unavailable', invoke: null }
}

export const canonicalRustEditorIsReady = (state, expectedPath = '') => {
  const activePath = state?.activeFile?.path || state?.notePath || ''
  const pathReady = !expectedPath || packagedNotePathMatches(activePath, expectedPath)
  return Boolean(
    pathReady &&
    state?.editorRuntime?.active === true &&
    state?.editorRuntime?.contentEditable === 'true' &&
    state?.editorRuntime?.contentEditableConnected === true &&
    state?.rustMirror?.active === true &&
    state?.rustMirror?.phase === 'ready' &&
    state?.rustMirror?.renderedMatchesCanonical === true &&
    !state?.rustMirror?.error &&
    Number(state?.rustMirror?.pending || 0) === 0
  )
}

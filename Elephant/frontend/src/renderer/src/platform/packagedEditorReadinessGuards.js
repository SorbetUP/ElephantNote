import Muya from '../../../muya/lib'
import {
  canonicalRustEditorIsReady,
  packagedNotePathMatches,
  resolveCanonicalTauriInvoke
} from './packagedEditorReadinessContracts.mjs'

const API_PROPERTY = '__ELEPHANT_ACCEPTANCE_TEST__'
const API_PATCH_FLAG = '__elephantPackagedEditorReadinessPatched'
const MUYA_PATCH_FLAG = '__elephantRustSelectionReadinessPatched'
const TAURI_INVOKE_PATCH_FLAG = '__elephantNativeInvokePatched'
const OPEN_RECOVERY_TIMEOUT_MS = 20_000
const SET_MARKDOWN_READINESS_TIMEOUT_MS = 20_000
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const listenerMaps = new WeakMap()

const selectionListenerMap = (instance) => {
  let listeners = listenerMaps.get(instance)
  if (!listeners) {
    listeners = new WeakMap()
    listenerMaps.set(instance, listeners)
  }
  return listeners
}

const installNativeTauriInvokeBridge = (target = globalThis) => {
  const ipcRenderer = target?.tauri?.ipcRenderer
  const resolved = resolveCanonicalTauriInvoke(target)
  if (!ipcRenderer || resolved.kind !== 'native' || typeof resolved.invoke !== 'function') return false
  if (ipcRenderer[TAURI_INVOKE_PATCH_FLAG] === true) return true

  const invoke = (command, payload) => resolved.invoke(command, payload)
  try {
    Object.defineProperty(ipcRenderer, 'invoke', {
      configurable: true,
      enumerable: true,
      writable: true,
      value: invoke
    })
    Object.defineProperty(ipcRenderer, TAURI_INVOKE_PATCH_FLAG, {
      configurable: true,
      value: true
    })
  } catch (error) {
    console.error('[elephantnote:tauri] failed to select native invoke bridge', {
      message: error?.message || String(error)
    })
    return false
  }

  console.info('[elephantnote:tauri] native invoke bridge selected for Rust editor sessions')
  return true
}

const installRustSelectionReadinessGuard = () => {
  const prototype = Muya?.prototype
  if (!prototype || prototype[MUYA_PATCH_FLAG] === true || typeof prototype.on !== 'function') return false

  const originalOn = prototype.on
  const originalOff = typeof prototype.off === 'function' ? prototype.off : null

  prototype.on = function(eventName, listener, ...args) {
    if (
      eventName !== 'selectionChange' ||
      typeof listener !== 'function' ||
      this.__rustMirror?.active !== true
    ) return originalOn.call(this, eventName, listener, ...args)

    const listeners = selectionListenerMap(this)
    const guarded = (...eventArgs) => {
      const mirror = this.__rustMirror
      if (mirror?.active === true && mirror?.status?.phase !== 'ready') {
        if (this.__elephantDeferredRustSelectionLog !== true) {
          Object.defineProperty(this, '__elephantDeferredRustSelectionLog', {
            configurable: true,
            value: true
          })
          console.info('[elephantnote:muya-rust] deferred selection synchronization until session readiness', {
            phase: mirror?.status?.phase || 'unknown',
            revision: Number(mirror?.status?.revision || 0)
          })
        }
        return undefined
      }
      return listener.apply(this, eventArgs)
    }
    listeners.set(listener, guarded)
    return originalOn.call(this, eventName, guarded, ...args)
  }

  if (originalOff) {
    prototype.off = function(eventName, listener, ...args) {
      const guarded = typeof listener === 'function'
        ? selectionListenerMap(this).get(listener) || listener
        : listener
      return originalOff.call(this, eventName, guarded, ...args)
    }
  }

  Object.defineProperty(prototype, MUYA_PATCH_FLAG, {
    configurable: true,
    value: true
  })
  return true
}

const diagnosticState = (state, expectedPath) => ({
  expectedPath,
  activePath: state?.activeFile?.path || state?.notePath || null,
  markdownLength: String(state?.markdown || '').length,
  editorRuntime: state?.editorRuntime || null,
  rustMirror: state?.rustMirror || null
})

const waitForRecoveredOpen = async(api, expectedPath, originalError) => {
  const deadline = Date.now() + OPEN_RECOVERY_TIMEOUT_MS
  let last = null

  while (Date.now() <= deadline) {
    last = await api.readState()
    const activePath = last?.activeFile?.path || last?.notePath || ''
    if (
      packagedNotePathMatches(activePath, expectedPath) &&
      canonicalRustEditorIsReady(last, expectedPath)
    ) return last
    if (last?.rustMirror?.phase === 'error') break
    await wait(25)
  }

  const originalMessage = originalError?.message || String(originalError)
  throw new Error(`Packaged note opening did not reach a canonical Rust-ready editor: ${JSON.stringify({
    ...diagnosticState(last, expectedPath),
    originalError: originalMessage
  })}`)
}

const waitForCanonicalMarkdownReplacement = async(api, expectedMarkdown) => {
  const deadline = Date.now() + SET_MARKDOWN_READINESS_TIMEOUT_MS
  const expected = String(expectedMarkdown || '')
  let last = null

  while (Date.now() <= deadline) {
    last = await api.readState()
    const activePath = last?.activeFile?.path || last?.notePath || ''
    if (
      String(last?.markdown || '') === expected &&
      canonicalRustEditorIsReady(last, activePath)
    ) return last
    if (last?.rustMirror?.phase === 'error') break
    await wait(25)
  }

  throw new Error(`Packaged setMarkdown did not reach the exact canonical Rust-ready document: ${JSON.stringify({
    expectedMarkdownLength: expected.length,
    ...diagnosticState(last, last?.activeFile?.path || last?.notePath || '')
  })}`)
}

const patchAutomationApi = (api) => {
  if (
    !api ||
    api[API_PATCH_FLAG] === true ||
    typeof api.openNote !== 'function' ||
    typeof api.readState !== 'function'
  ) return api

  const originalOpenNote = api.openNote.bind(api)
  api.openNote = async(expectedPath, ...args) => {
    try {
      return await originalOpenNote(expectedPath, ...args)
    } catch (error) {
      const message = [error?.message, error?.stack, String(error)].filter(Boolean).join('\n')
      const recoverable = message.includes('Timed out opening note:') ||
        message.includes('Opened note did not reach a canonical Rust-ready editor:')
      if (!recoverable) throw error
      console.warn('[automation-api] recovering packaged note open with normalized path and Rust readiness', {
        expectedPath,
        error: error?.message || String(error)
      })
      return waitForRecoveredOpen(api, String(expectedPath || ''), error)
    }
  }

  if (typeof api.setMarkdown === 'function') {
    const originalSetMarkdown = api.setMarkdown.bind(api)
    api.setMarkdown = async(markdown, ...args) => {
      const result = await originalSetMarkdown(markdown, ...args)
      await waitForCanonicalMarkdownReplacement(api, markdown)
      return result
    }
  }

  Object.defineProperty(api, API_PATCH_FLAG, {
    configurable: true,
    value: true
  })
  return api
}

const installAutomationApiGuard = (target = globalThis) => {
  const existing = target[API_PROPERTY]
  if (existing) patchAutomationApi(existing)

  const descriptor = Object.getOwnPropertyDescriptor(target, API_PROPERTY)
  if (!descriptor?.configurable || typeof descriptor.set !== 'function') return false

  Object.defineProperty(target, API_PROPERTY, {
    configurable: true,
    enumerable: descriptor.enumerable === true,
    get: descriptor.get,
    set(api) {
      descriptor.set.call(target, api)
      patchAutomationApi(descriptor.get?.call(target) || api)
    }
  })
  return true
}

installNativeTauriInvokeBridge()
installRustSelectionReadinessGuard()
installAutomationApiGuard()

export {
  installAutomationApiGuard,
  installNativeTauriInvokeBridge,
  installRustSelectionReadinessGuard,
  patchAutomationApi,
  waitForCanonicalMarkdownReplacement
}

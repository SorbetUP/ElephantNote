import Muya from '../../../muya/lib'
import {
  canonicalRustEditorIsReady,
  packagedNotePathMatches
} from './packagedEditorReadinessContracts.mjs'

const API_PROPERTY = '__ELEPHANT_ACCEPTANCE_TEST__'
const API_PATCH_FLAG = '__elephantPackagedEditorReadinessPatched'
const MUYA_PATCH_FLAG = '__elephantRustSelectionReadinessPatched'
const OPEN_RECOVERY_TIMEOUT_MS = 20_000
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

installRustSelectionReadinessGuard()
installAutomationApiGuard()

export {
  installAutomationApiGuard,
  installRustSelectionReadinessGuard,
  patchAutomationApi
}

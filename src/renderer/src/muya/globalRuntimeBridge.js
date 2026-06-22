import { createMuyaFullEditorRuntime } from './fullEditorRuntime.js'
import { isMuyaRuntimeActive, isMuyaRuntimeEnabled, readMuyaRuntimeMode } from './runtimeFlags.js'

export const createGlobalMuyaRuntimeBridge = (target = globalThis) => ({
  mode: () => readMuyaRuntimeMode(target),
  enabled: () => isMuyaRuntimeEnabled(readMuyaRuntimeMode(target)),
  active: () => isMuyaRuntimeActive(readMuyaRuntimeMode(target)),
  setMode: (mode) => {
    target.__ELEPHANT_MUYA_RUNTIME_MODE__ = mode
    return readMuyaRuntimeMode(target)
  },
  createEditor: createMuyaFullEditorRuntime
})

export const installGlobalMuyaRuntimeBridge = (target = globalThis) => {
  if (!target.__ELEPHANT_MUYA_RUNTIME__) {
    target.__ELEPHANT_MUYA_RUNTIME__ = createGlobalMuyaRuntimeBridge(target)
  }
  return target.__ELEPHANT_MUYA_RUNTIME__
}

export default installGlobalMuyaRuntimeBridge

export const MUYA_RUNTIME_FLAGS = Object.freeze({
  disabled: 'disabled',
  shadow: 'shadow',
  active: 'active'
})

export const readMuyaRuntimeMode = (source = globalThis) => {
  const raw = source.__ELEPHANT_MUYA_RUNTIME_MODE__ || 'disabled'
  return Object.values(MUYA_RUNTIME_FLAGS).includes(raw) ? raw : 'disabled'
}

export const isMuyaRuntimeEnabled = (mode = readMuyaRuntimeMode()) => mode === MUYA_RUNTIME_FLAGS.active || mode === MUYA_RUNTIME_FLAGS.shadow
export const isMuyaRuntimeActive = (mode = readMuyaRuntimeMode()) => mode === MUYA_RUNTIME_FLAGS.active

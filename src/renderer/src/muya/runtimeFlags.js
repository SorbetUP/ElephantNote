export const MUYA_RUNTIME_FLAGS = Object.freeze({
  disabled: 'disabled',
  shadow: 'shadow',
  active: 'active'
})

export const defaultMuyaRuntimeMode = (source = globalThis) => {
  if (source.__MARKTEXT_RUNTIME__ && source.__MARKTEXT_RUNTIME__ !== 'electron') return 'active'
  return 'disabled'
}

export const readMuyaRuntimeMode = (source = globalThis) => {
  const raw = source.__ELEPHANT_MUYA_RUNTIME_MODE__ || defaultMuyaRuntimeMode(source)
  return Object.values(MUYA_RUNTIME_FLAGS).includes(raw) ? raw : defaultMuyaRuntimeMode(source)
}

export const isMuyaRuntimeEnabled = (mode = readMuyaRuntimeMode()) => mode === MUYA_RUNTIME_FLAGS.active || mode === MUYA_RUNTIME_FLAGS.shadow
export const isMuyaRuntimeActive = (mode = readMuyaRuntimeMode()) => mode === MUYA_RUNTIME_FLAGS.active

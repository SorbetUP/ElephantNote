export const MUYA_RUNTIME_FLAGS = Object.freeze({
  disabled: 'disabled',
  shadow: 'shadow',
  active: 'active',
  rust: 'rust'
})

export const defaultMuyaRuntimeMode = (source = globalThis) => {
  if (source.__MARKTEXT_RUNTIME__) return 'shadow'
  return 'disabled'
}

export const readMuyaRuntimeMode = (source = globalThis) => {
  const raw = source.__ELEPHANT_MUYA_RUNTIME_MODE__ || defaultMuyaRuntimeMode(source)
  return Object.values(MUYA_RUNTIME_FLAGS).includes(raw) ? raw : defaultMuyaRuntimeMode(source)
}

export const isMuyaRuntimeEnabled = (mode = readMuyaRuntimeMode()) =>
  mode === MUYA_RUNTIME_FLAGS.active ||
  mode === MUYA_RUNTIME_FLAGS.shadow ||
  mode === MUYA_RUNTIME_FLAGS.rust

export const isMuyaRuntimeActive = (mode = readMuyaRuntimeMode()) =>
  mode === MUYA_RUNTIME_FLAGS.active || mode === MUYA_RUNTIME_FLAGS.rust

export const isMuyaRustRuntime = (mode = readMuyaRuntimeMode()) =>
  mode === MUYA_RUNTIME_FLAGS.rust

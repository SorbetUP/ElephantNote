import { describe, expect, it } from 'vitest'

import {
  MUYA_RUNTIME_FLAGS,
  defaultMuyaRuntimeMode,
  isMuyaRuntimeActive,
  isMuyaRuntimeEnabled,
  readMuyaRuntimeMode
} from '../../../Elephant/frontend/src/renderer/src/muya/runtimeFlags.js'

describe('Muya runtime flags', () => {
  it('keeps the obsolete page-level runtime disabled unless explicitly requested', () => {
    expect(defaultMuyaRuntimeMode({ __MARKTEXT_RUNTIME__: true })).toBe(MUYA_RUNTIME_FLAGS.disabled)
    expect(readMuyaRuntimeMode({ __MARKTEXT_RUNTIME__: true })).toBe(MUYA_RUNTIME_FLAGS.disabled)
    expect(isMuyaRuntimeEnabled(MUYA_RUNTIME_FLAGS.disabled)).toBe(false)
  })

  it('still supports explicit shadow diagnostics and active mode', () => {
    expect(readMuyaRuntimeMode({ __ELEPHANT_MUYA_RUNTIME_MODE__: 'shadow' })).toBe('shadow')
    expect(readMuyaRuntimeMode({ __ELEPHANT_MUYA_RUNTIME_MODE__: 'active' })).toBe('active')
    expect(isMuyaRuntimeEnabled('shadow')).toBe(true)
    expect(isMuyaRuntimeActive('active')).toBe(true)
  })

  it('rejects invalid mode values by returning the safe disabled mode', () => {
    expect(readMuyaRuntimeMode({ __ELEPHANT_MUYA_RUNTIME_MODE__: 'fake' })).toBe('disabled')
  })
})

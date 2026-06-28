import { describe, expect, it } from 'vitest'
import {
  getAcceleratorFromKeyboardEvent,
  isCompositionEvent,
  isValidAccelerator,
  setKeyboardLayout
} from '../../../src/renderer/src/platform/runtimeLocalShortcutShim.js'

describe('runtime local shortcut shim', () => {
  it('normalizes keyboard events into accelerators', () => {
    const result = getAcceleratorFromKeyboardEvent({
      key: 's',
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
      metaKey: false
    })

    expect(result).toEqual({
      accelerator: 'Ctrl+Alt+S',
      isValid: true
    })
  })

  it('validates and detects composition state', () => {
    expect(isValidAccelerator('Cmd+Shift+P')).toBe(true)
    expect(isValidAccelerator('Shift')).toBe(false)
    expect(isCompositionEvent({ isComposing: true })).toBe(true)
    expect(isCompositionEvent({ keyCode: 229 })).toBe(true)
    expect(isCompositionEvent({ key: 'a' })).toBe(false)
  })

  it('exposes a harmless keyboard layout setter', () => {
    expect(() => setKeyboardLayout('fr-FR', { })).not.toThrow()
  })
})

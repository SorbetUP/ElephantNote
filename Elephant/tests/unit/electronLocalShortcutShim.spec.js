import { describe, expect, it } from 'vitest'
import {
  getAcceleratorFromKeyboardEvent,
  isCompositionEvent,
  isValidElectronAccelerator,
  setKeyboardLayout
} from '../../../src/renderer/src/platform/electronLocalShortcutShim.js'

describe('electron local shortcut shim', () => {
  it('normalizes keyboard events into electron-style accelerators', () => {
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
    expect(isValidElectronAccelerator('Cmd+Shift+P')).toBe(true)
    expect(isValidElectronAccelerator('Shift')).toBe(false)
    expect(isCompositionEvent({ isComposing: true })).toBe(true)
    expect(isCompositionEvent({ keyCode: 229 })).toBe(true)
    expect(isCompositionEvent({ key: 'a' })).toBe(false)
  })

  it('exposes a harmless keyboard layout setter', () => {
    expect(() => setKeyboardLayout('fr-FR', { })).not.toThrow()
  })
})

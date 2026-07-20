import { isEqualAccelerator } from 'common/keybinding'

const characterKeys = ['0', '1', '9', 'A', 'b', 'G', 'Z', '~', '!', '@', '#']
const nonCharacterKeys = [
  'F1', 'F5', 'F24', 'Plus', 'Space', 'Tab', 'Backspace', 'Delete', 'Insert',
  'Return', 'Enter', 'Up', 'Down', 'Left', 'Right', 'Home', 'End', 'PageUp',
  'PageDown', 'Escape', 'Esc', 'VolumeUp', 'VolumeDown', 'VolumeMute',
  'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause', 'PrintScreen'
]
const modifiers = [
  'Command', 'Cmd', 'Control', 'Ctrl', 'CommandOrControl', 'CmdOrCtrl',
  'Alt', 'Option', 'AltGr', 'Shift'
]

describe('electron accelerator equality', () => {
  it('matches representative non-character keys', () => {
    for (const key of ['F2', 'F10', 'PageUp', 'Tab', ...nonCharacterKeys]) {
      expect(isEqualAccelerator(key, key), key).to.equal(true)
    }
  })

  it('rejects different keys and missing modifiers', () => {
    for (const [left, right] of [
      ['F2', 'F3'],
      ['Left', 'Down'],
      ['F1', '1'],
      ['F2', 'Ctrl+F2'],
      ['Ctrl+A', 'A+Ctrl+Alt'],
      ['Ctrl+A', 'ctrl+alt+a'],
      ['a', 'b'],
      ['Ctrl+a+shift', 'ctrl+Shift+b']
    ]) {
      expect(isEqualAccelerator(left, right), `${left} != ${right}`).to.equal(false)
    }
  })

  it('normalizes modifier order and case', () => {
    for (const [left, right] of [
      ['Ctrl+A', 'A+Ctrl'],
      ['Ctrl+Alt+A', 'ctrl+alt+a'],
      ['Ctrl+Shift+A', 'ctrl+shift+A'],
      ['Ctrl+a+shift', 'ctrl+Shift+a']
    ]) {
      expect(isEqualAccelerator(left, right), `${left} == ${right}`).to.equal(true)
    }
  })

  it('rejects malformed or empty accelerators', () => {
    for (const [left, right] of [
      ['Ctrl+', 'Ctrl+Plus'],
      ['Ctrl++', 'Ctrl+Plus'],
      ['', 'Ctrl+A'],
      ['ctrl+Shift+b', '']
    ]) {
      expect(isEqualAccelerator(left, right), `${left} invalid against ${right}`).to.equal(false)
    }
  })

  it('matches every supported modifier/key combination without generating fake test cases', () => {
    const keys = [...characterKeys, ...nonCharacterKeys]
    for (const modifier of modifiers) {
      for (const key of keys) {
        expect(
          isEqualAccelerator(`${modifier}+${key}`, `${key}+${modifier}`),
          `${modifier}+${key}`
        ).to.equal(true)
      }
    }
  })
})

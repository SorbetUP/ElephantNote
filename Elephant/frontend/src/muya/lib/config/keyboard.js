import { generateKeyHash } from '../utils/hash'

export const EVENT_KEYS = Object.freeze(
  generateKeyHash([
    'Enter',
    'Backspace',
    'Space',
    'Delete',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Tab',
    'Escape'
  ])
)

export const KEYS_TO_IGNORE = Object.freeze(
  generateKeyHash([
    'Alt',
    'AltGraph',
    'CapsLock',
    'Control',
    'Fn',
    'FnLock',
    'Hyper',
    'Meta',
    'NumLock',
    'ScrollLock',
    'Shift',
    'Super',
    'Symbol',
    'SymbolLock',
    'F1',
    'F2',
    'F3',
    'F4',
    'F5',
    'F6',
    'F7',
    'F8',
    'F9',
    'F10',
    'F11',
    'F12'
  ])
)

const isMac = process.platform === 'darwin'
const windowStates = new WeakMap()

const keyAliases = new Map([
  ['esc', 'escape'],
  ['escape', 'escape'],
  ['return', 'enter'],
  ['enter', 'enter'],
  ['space', ' '],
  ['spacebar', ' '],
  ['tab', 'tab'],
  ['backspace', 'backspace'],
  ['delete', 'delete'],
  ['del', 'delete'],
  ['insert', 'insert'],
  ['ins', 'insert'],
  ['home', 'home'],
  ['end', 'end'],
  ['pageup', 'pageup'],
  ['pagedown', 'pagedown'],
  ['left', 'arrowleft'],
  ['right', 'arrowright'],
  ['up', 'arrowup'],
  ['down', 'arrowdown'],
  ['plus', '+'],
  ['add', '+'],
  ['numadd', '+'],
  ['minus', '-'],
  ['subtract', '-'],
  ['numsub', '-'],
  ['`', '`'],
  [',', ','],
  ['.', '.'],
  ['/', '/'],
  ['\\', '\\'],
  [';', ';'],
  ["'", "'"],
  ['[', '['],
  [']', ']'],
  ['-', '-'],
  ['=', '='],
  ['_', '_']
])

function createModifierState() {
  return {
    ctrl: false,
    meta: false,
    alt: false,
    shift: false
  }
}

function normalizeKey(key) {
  const normalized = `${key}`.trim().toLowerCase()

  if (/^f(?:[1-9]|1[0-9]|2[0-4])$/.test(normalized)) {
    return normalized
  }

  if (/^[a-z]$/.test(normalized) || /^[0-9]$/.test(normalized)) {
    return normalized
  }

  return keyAliases.get(normalized) || normalized
}

function parseAccelerator(accelerator) {
  if (typeof accelerator !== 'string' || accelerator.trim().length === 0) {
    throw new Error('Accelerator must be a non-empty string.')
  }

  const modifiers = createModifierState()
  const tokens = accelerator.split('+').map(token => token.trim()).filter(Boolean)
  let key = ''

  for (const token of tokens) {
    const normalized = token.toLowerCase()

    if (normalized === 'cmdorctrl' || normalized === 'commandorcontrol') {
      if (isMac) {
        modifiers.meta = true
      } else {
        modifiers.ctrl = true
      }
      continue
    }

    if (normalized === 'ctrl' || normalized === 'control') {
      modifiers.ctrl = true
      continue
    }

    if (normalized === 'cmd' || normalized === 'command' || normalized === 'meta') {
      modifiers.meta = true
      continue
    }

    if (normalized === 'alt' || normalized === 'option') {
      modifiers.alt = true
      continue
    }

    if (normalized === 'shift') {
      modifiers.shift = true
      continue
    }

    if (key) {
      throw new Error(`Invalid accelerator "${accelerator}".`)
    }

    key = normalizeKey(token)
    if (key === '_') {
      modifiers.shift = true
    }
  }

  if (!key) {
    throw new Error(`Invalid accelerator "${accelerator}".`)
  }

  return { key, modifiers }
}

function getInputKey(input) {
  if (input.key) {
    return normalizeKey(input.key)
  }

  if (/^Key[A-Z]$/.test(input.code)) {
    return input.code.slice(3).toLowerCase()
  }

  if (/^Digit[0-9]$/.test(input.code)) {
    return input.code.slice(5)
  }

  return normalizeKey(input.code || '')
}

function modifiersMatch(expected, input) {
  return expected.ctrl === Boolean(input.control) &&
    expected.meta === Boolean(input.meta) &&
    expected.alt === Boolean(input.alt) &&
    expected.shift === Boolean(input.shift)
}

function matches(parsed, input) {
  return getInputKey(input) === parsed.key && modifiersMatch(parsed.modifiers, input)
}

function getWindowState(win) {
  let state = windowStates.get(win)
  if (state) {
    return state
  }

  state = {
    shortcuts: new Map(),
    listener: (event, input) => {
      if (input.type !== 'keyDown') {
        return
      }

      for (const shortcut of state.shortcuts.values()) {
        if (matches(shortcut.parsed, input)) {
          event.preventDefault()
          shortcut.callback()
          return
        }
      }
    }
  }

  windowStates.set(win, state)
  win.webContents.on('before-input-event', state.listener)
  win.once('closed', () => {
    if (!win.isDestroyed()) {
      win.webContents.removeListener('before-input-event', state.listener)
    }
    windowStates.delete(win)
  })

  return state
}

function registerOne(win, accelerator, callback) {
  if (!win || !win.webContents || typeof callback !== 'function') {
    throw new Error('register expects a BrowserWindow, an accelerator and a callback.')
  }

  const parsed = parseAccelerator(accelerator)
  const state = getWindowState(win)
  state.shortcuts.set(accelerator, { parsed, callback })
}

function unregisterOne(win, accelerator) {
  const state = windowStates.get(win)
  if (!state) {
    return
  }

  state.shortcuts.delete(accelerator)
  if (state.shortcuts.size === 0 && !win.isDestroyed()) {
    win.webContents.removeListener('before-input-event', state.listener)
    windowStates.delete(win)
  }
}

export function isValidElectronAccelerator(accelerator) {
  try {
    parseAccelerator(accelerator)
    return true
  } catch (_) {
    return false
  }
}

export const electronLocalshortcut = {
  register(win, accelerator, callback) {
    if (Array.isArray(accelerator)) {
      for (const item of accelerator) {
        registerOne(win, item, callback)
      }
      return
    }

    registerOne(win, accelerator, callback)
  },

  unregister(win, accelerator) {
    if (Array.isArray(accelerator)) {
      for (const item of accelerator) {
        unregisterOne(win, item)
      }
      return
    }

    unregisterOne(win, accelerator)
  },

  unregisterAll(win) {
    const state = windowStates.get(win)
    if (!state) {
      return
    }

    state.shortcuts.clear()
    if (!win.isDestroyed()) {
      win.webContents.removeListener('before-input-event', state.listener)
    }
    windowStates.delete(win)
  },

  setKeyboardLayout() {
    // Compatibility hook for the historical @hfelix/electron-localshortcut API.
    // Electron already provides normalized KeyboardInputEvent data here; the reference
    // Electron app only needs this method to exist during startup and layout changes.
  }
}

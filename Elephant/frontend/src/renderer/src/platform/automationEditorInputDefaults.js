const PATCH_FLAG = '__elephantEditorInputDefaultsInstalled'

const editorElement = (target, selector) => {
  const element = target.document?.querySelector?.(selector)
  if (!element) throw new Error(`press target was not found: ${selector}`)
  return element
}

const restoreSelectionAfterFocus = (target, element) => {
  const selection = target.getSelection?.() || target.window?.getSelection?.()
  const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  element.focus?.()
  if (!savedRange || !element.contains(savedRange.commonAncestorContainer)) return
  const current = target.getSelection?.() || target.window?.getSelection?.()
  current?.removeAllRanges()
  current?.addRange(savedRange)
}

const dispatchEnterDefault = (target, element, key) => {
  const InputEventConstructor = target.InputEvent || target.window?.InputEvent
  if (typeof InputEventConstructor !== 'function') {
    throw new Error('Enter default emulation requires InputEvent support')
  }

  const inputType = key === 'Shift+Enter' ? 'insertLineBreak' : 'insertParagraph'
  const beforeInput = new InputEventConstructor('beforeinput', {
    inputType,
    data: null,
    bubbles: true,
    cancelable: true,
    composed: true
  })

  // WebKit versions used by Tauri may discard non-text inputType values on
  // synthetic InputEvent construction. Restore the browser-observable field so
  // the event is identical at the editor boundary to a real Enter default.
  if (beforeInput.inputType !== inputType) {
    Object.defineProperty(beforeInput, 'inputType', {
      configurable: true,
      enumerable: true,
      value: inputType
    })
  }

  element.dispatchEvent(beforeInput)
  if (!beforeInput.defaultPrevented) {
    throw new Error(`The visible editor did not claim the ${inputType} beforeinput event`)
  }
}

const waitForRustMutation = async(target, before, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const current = target.__ELEPHANT_MUYA_RUST_MIRROR__
    if (current?.phase === 'error') {
      throw new Error(`Rust editor failed while applying Enter: ${current.error || current.reason || 'unknown error'}`)
    }
    if (
      Number(current?.revision) > Number(before?.revision || 0) ||
      Number(current?.markdownLength) !== Number(before?.markdownLength || 0)
    ) return current
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error('The visible Enter key did not reach a completed Rust editor mutation')
}

export const installEditorAutomationInputDefaults = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || typeof api.press !== 'function' || api[PATCH_FLAG]) return false

  const originalPress = api.press.bind(api)
  api.press = async(selector, key) => {
    if (key !== 'Enter' && key !== 'Shift+Enter') return originalPress(selector, key)

    const element = editorElement(target, selector)
    const KeyboardEventConstructor = target.KeyboardEvent || target.window?.KeyboardEvent
    if (typeof KeyboardEventConstructor !== 'function') {
      throw new Error('press requires KeyboardEvent support')
    }

    const rustEditor = element.closest?.('[data-testid="muya-rust-runtime-editor"]') ||
      element.querySelector?.('[data-testid="muya-rust-runtime-editor"]')
    const beforeRust = rustEditor ? { ...(target.__ELEPHANT_MUYA_RUST_MIRROR__ || {}) } : null

    restoreSelectionAfterFocus(target, element)
    const eventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      shiftKey: key === 'Shift+Enter',
      bubbles: true,
      cancelable: true,
      composed: true
    }
    const keydown = new KeyboardEventConstructor('keydown', eventInit)
    element.dispatchEvent(keydown)
    if (!keydown.defaultPrevented) dispatchEnterDefault(target, element, key)
    element.dispatchEvent(new KeyboardEventConstructor('keyup', eventInit))

    if (rustEditor) await waitForRustMutation(target, beforeRust)

    console.info('[automation-api] emulated trusted Enter default', {
      selector,
      key,
      keydownPrevented: keydown.defaultPrevented,
      rustMutationCompleted: Boolean(rustEditor)
    })
    return api.readDom(selector)
  }

  Object.defineProperty(api, PATCH_FLAG, {
    value: true,
    enumerable: false
  })
  return true
}

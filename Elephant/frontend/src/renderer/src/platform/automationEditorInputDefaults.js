const PATCH_FLAG = '__elephantEditorInputDefaultsInstalled'

const editorElement = (target, selector) => {
  const element = target.document?.querySelector?.(selector)
  if (!element) throw new Error(`press target was not found: ${selector}`)
  return element
}

const dispatchEnterDefault = (target, element, key) => {
  const InputEventConstructor = target.InputEvent || target.window?.InputEvent
  if (typeof InputEventConstructor !== 'function') {
    throw new Error('Enter default emulation requires InputEvent support')
  }

  const beforeInput = new InputEventConstructor('beforeinput', {
    inputType: key === 'Shift+Enter' ? 'insertLineBreak' : 'insertParagraph',
    data: null,
    bubbles: true,
    cancelable: true,
    composed: true
  })
  element.dispatchEvent(beforeInput)
  if (!beforeInput.defaultPrevented) {
    throw new Error('The visible editor did not claim the Enter beforeinput event')
  }
}

export const installEditorAutomationInputDefaults = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || typeof api.press !== 'function' || api[PATCH_FLAG]) return false

  const originalPress = api.press.bind(api)
  api.press = (selector, key) => {
    if (key !== 'Enter' && key !== 'Shift+Enter') return originalPress(selector, key)

    const element = editorElement(target, selector)
    const KeyboardEventConstructor = target.KeyboardEvent || target.window?.KeyboardEvent
    if (typeof KeyboardEventConstructor !== 'function') {
      throw new Error('press requires KeyboardEvent support')
    }

    element.focus?.()
    const eventInit = {
      key: 'Enter',
      shiftKey: key === 'Shift+Enter',
      bubbles: true,
      cancelable: true,
      composed: true
    }
    const keydown = new KeyboardEventConstructor('keydown', eventInit)
    element.dispatchEvent(keydown)
    if (!keydown.defaultPrevented) dispatchEnterDefault(target, element, key)
    element.dispatchEvent(new KeyboardEventConstructor('keyup', eventInit))

    console.info('[automation-api] emulated trusted Enter default', {
      selector,
      key,
      keydownPrevented: keydown.defaultPrevented
    })
    return api.readDom(selector)
  }

  Object.defineProperty(api, PATCH_FLAG, {
    value: true,
    enumerable: false
  })
  return true
}

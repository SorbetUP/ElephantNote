const PATCH_FLAG = '__elephantCanonicalInsertTextInstalled'

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const restoreSelectionAfterFocus = (target, element) => {
  const selection = target.getSelection?.() || target.window?.getSelection?.()
  const savedRange = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null
  element.focus?.()
  if (!savedRange || !element.contains(savedRange.commonAncestorContainer)) return
  const current = target.getSelection?.() || target.window?.getSelection?.()
  current?.removeAllRanges()
  current?.addRange(savedRange)
}

const waitForRustMutation = async(target, before, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() <= deadline) {
    const current = target.__ELEPHANT_MUYA_RUST_MIRROR__
    if (current?.phase === 'error') {
      throw new Error(`Rust editor failed while applying text input: ${current.error || current.reason || 'unknown error'}`)
    }
    if (
      Number(current?.revision) > Number(before?.revision || 0) ||
      Number(current?.markdownLength) !== Number(before?.markdownLength || 0)
    ) return current
    await wait(20)
  }
  throw new Error('The visible text input did not reach a completed Rust editor mutation')
}

const install = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || api[PATCH_FLAG]) return false

  api.insertText = async(selector, value) => {
    if (!selector || typeof selector !== 'string') throw new TypeError('insertText requires a CSS selector')
    if (typeof value !== 'string') throw new TypeError('insertText requires a string value')
    const element = target.document?.querySelector?.(selector)
    if (!element) throw new Error(`insertText target was not found: ${selector}`)

    restoreSelectionAfterFocus(target, element)
    const InputEventConstructor = target.InputEvent || target.window?.InputEvent
    if (typeof InputEventConstructor !== 'function') throw new Error('insertText requires InputEvent support')

    const beforeRust = { ...(target.__ELEPHANT_MUYA_RUST_MIRROR__ || {}) }
    const inputEvent = new InputEventConstructor('beforeinput', {
      inputType: 'insertText',
      data: value,
      bubbles: true,
      cancelable: true,
      composed: true
    })
    const dispatched = element.dispatchEvent(inputEvent)

    if (dispatched && !inputEvent.defaultPrevented) {
      const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
      if (typeof activeMuya?.__beforeInput !== 'function') {
        throw new Error('The visible editor did not claim insertText and no canonical Muya handler is active')
      }

      let fallbackPrevented = false
      const fallbackEvent = {
        inputType: 'insertText',
        data: value,
        target: element,
        currentTarget: element,
        isComposing: false,
        defaultPrevented: false,
        preventDefault() {
          fallbackPrevented = true
          this.defaultPrevented = true
        },
        stopPropagation() {},
        stopImmediatePropagation() {}
      }
      await activeMuya.__beforeInput(fallbackEvent)
      if (!fallbackPrevented) {
        throw new Error('The canonical Muya handler did not claim insertText')
      }
    }

    await waitForRustMutation(target, beforeRust)
    console.info('[automation-api] canonical visible text input completed', {
      selector,
      valueLength: value.length,
      dispatched,
      browserClaimed: inputEvent.defaultPrevented
    })
    return api.readDom(selector)
  }

  Object.defineProperty(api, PATCH_FLAG, { value: true, enumerable: false })
  return true
}

const installWhenReady = async(target = globalThis) => {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (install(target)) return true
    await wait(20)
  }
  console.error('[automation-api] canonical insertText patch was not installed')
  return false
}

void installWhenReady()

export { install as installCanonicalAutomationInsertText }

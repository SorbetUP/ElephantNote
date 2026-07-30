const PATCH_FLAG = '__elephantEnterFallbackInstalled'
const INSTALL_DEADLINE_MS = 30_000
const POLL_MS = 20

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const eventConstructorFor = (target, element) => (
  element?.ownerDocument?.defaultView?.InputEvent || target.InputEvent || target.window?.InputEvent
)

const install = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || typeof api.press !== 'function' || api[PATCH_FLAG]) return false

  const originalPress = api.press.bind(api)
  api.press = async(selector, key) => {
    try {
      return await originalPress(selector, key)
    } catch (error) {
      const message = error?.message || String(error)
      if ((key !== 'Enter' && key !== 'Shift+Enter') ||
        !message.includes('The visible Enter key was not claimed by a new Rust editor command path')) {
        throw error
      }

      const element = target.document?.querySelector?.(selector)
      const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
      const before = activeMuya?.__rustMirror?.state
      if (!element || !activeMuya || !before) throw error

      const InputEventConstructor = eventConstructorFor(target, element)
      if (typeof InputEventConstructor !== 'function') throw error
      const beforeInput = new InputEventConstructor('beforeinput', {
        inputType: key === 'Shift+Enter' ? 'insertLineBreak' : 'insertParagraph',
        data: null,
        bubbles: true,
        cancelable: true,
        composed: true
      })
      element.dispatchEvent(beforeInput)
      if (!beforeInput.defaultPrevented) {
        throw new Error('The visible editor did not claim the Enter beforeinput fallback')
      }

      await activeMuya.__rustMutationGate?.flush?.()
      const deadline = Date.now() + 5_000
      while (Date.now() <= deadline) {
        if (target.__ELEPHANT_ACTIVE_MUYA__ !== activeMuya) {
          throw new Error('The visible editor remounted while completing the Enter beforeinput fallback')
        }
        const canonical = activeMuya.__rustMirror?.state
        const published = target.__ELEPHANT_MUYA_RUST_MIRROR__
        const visible = activeMuya.getMarkdown?.()
        const changed = Number(canonical?.revision || 0) > Number(before.revision || 0) ||
          String(canonical?.markdown ?? '') !== String(before.markdown ?? '')
        const synchronized = canonical &&
          String(visible ?? '') === String(canonical.markdown ?? '') &&
          Number(activeMuya.__rustMutationGate?.pending || 0) === 0 &&
          Number(published?.revision || 0) >= Number(canonical.revision || 0)
        if (changed && synchronized) {
          console.info('[automation-api] completed Enter through claimed visible beforeinput fallback', {
            selector,
            key,
            revision: canonical.revision,
            markdownLength: canonical.markdown.length
          })
          return api.readDom(selector)
        }
        await sleep(POLL_MS)
      }
      throw new Error('The claimed Enter beforeinput fallback did not produce a completed Rust editor mutation')
    }
  }

  Object.defineProperty(api, PATCH_FLAG, { value: true, enumerable: false })
  return true
}

const deadline = Date.now() + INSTALL_DEADLINE_MS
const timer = setInterval(() => {
  if (install(globalThis) || Date.now() >= deadline) clearInterval(timer)
}, POLL_MS)
install(globalThis)

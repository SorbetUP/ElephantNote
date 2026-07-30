const PATCH_FLAG = '__elephantAutomationCommandErrorObservabilityInstalled'
const EDITOR_INPUT_FLAG = '__elephantEditorInputDefaultsInstalled'

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const browserSelectionFor = (target, element) => target.getSelection?.() ||
  target.window?.getSelection?.() ||
  element?.ownerDocument?.defaultView?.getSelection?.()

const selectionOffsetsWithin = (target, element) => {
  const selection = browserSelectionFor(target, element)
  if (!selection?.anchorNode || !selection?.focusNode || !element) return null
  if (
    (selection.anchorNode !== element && !element.contains?.(selection.anchorNode)) ||
    (selection.focusNode !== element && !element.contains?.(selection.focusNode))
  ) return null

  const offsetOf = (node, offset) => {
    const range = element.ownerDocument.createRange()
    range.selectNodeContents(element)
    range.setEnd(node, offset)
    return range.toString().length
  }

  try {
    return {
      anchor: offsetOf(selection.anchorNode, selection.anchorOffset),
      focus: offsetOf(selection.focusNode, selection.focusOffset)
    }
  } catch {
    return null
  }
}

const textPointAt = (element, requestedOffset) => {
  const document = element.ownerDocument
  const showText = document.defaultView?.NodeFilter?.SHOW_TEXT ?? 4
  const walker = document.createTreeWalker(element, showText)
  let remaining = Math.max(0, Number(requestedOffset) || 0)
  let node = walker.nextNode()
  let last = null

  while (node) {
    last = node
    const length = String(node.data || '').length
    if (remaining <= length) return { node, offset: remaining }
    remaining -= length
    node = walker.nextNode()
  }

  if (last) return { node: last, offset: String(last.data || '').length }
  return { node: element, offset: element.childNodes?.length || 0 }
}

const restoreSelectionOffsets = (target, element, saved) => {
  if (!element || !saved) return false
  const selection = browserSelectionFor(target, element)
  if (!selection) return false
  const anchor = textPointAt(element, saved.anchor)
  const focus = textPointAt(element, saved.focus)

  if (typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
  } else {
    const range = element.ownerDocument.createRange()
    const start = saved.anchor <= saved.focus ? anchor : focus
    const end = saved.anchor <= saved.focus ? focus : anchor
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    selection.removeAllRanges()
    selection.addRange(range)
  }
  element.ownerDocument.dispatchEvent(new element.ownerDocument.defaultView.Event('selectionchange', { bubbles: true }))
  return true
}

const diagnosticError = (command, error) => {
  const originalMessage = error?.message || String(error)
  const originalStack = String(error?.stack || '')
  const message = `${command} failed: ${originalMessage}`
  const diagnostic = new Error(message)
  const diagnosticStack = String(diagnostic.stack || '')
  const preservedStack = originalStack && !originalStack.includes(originalMessage)
    ? `Original stack: ${originalStack}`
    : originalStack
  diagnostic.stack = `${diagnostic.name}: ${message}${preservedStack ? `\n${preservedStack}` : ''}${diagnosticStack ? `\nWrapper stack:\n${diagnosticStack}` : ''}`
  return diagnostic
}

const install = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || api[PATCH_FLAG] || !api[EDITOR_INPUT_FLAG] || typeof api.press !== 'function') return false

  const originalPress = api.press.bind(api)
  api.press = async(selector, key) => {
    const initialElement = target.document?.querySelector?.(selector)
    const savedSelection = selectionOffsetsWithin(target, initialElement)
    try {
      return await originalPress(selector, key)
    } catch (error) {
      const message = error?.message || String(error)
      const liveElement = target.document?.querySelector?.(selector)
      const surfaceWasReplaced = Boolean(
        savedSelection &&
        liveElement &&
        (liveElement !== initialElement || initialElement?.isConnected === false)
      )
      const enterWasNotClaimed = (key === 'Enter' || key === 'Shift+Enter') &&
        message.includes('was not claimed by a new Rust editor command path')

      if (surfaceWasReplaced && enterWasNotClaimed) {
        restoreSelectionOffsets(target, liveElement, savedSelection)
        console.warn('[automation-api] retrying Enter on the replacement Rust editor surface', {
          selector,
          key,
          anchor: savedSelection.anchor,
          focus: savedSelection.focus
        })
        try {
          return await originalPress(selector, key)
        } catch (retryError) {
          throw diagnosticError(`press(${JSON.stringify(key)}) after Rust surface replacement`, retryError)
        }
      }

      throw diagnosticError(`press(${JSON.stringify(key)})`, error)
    }
  }

  Object.defineProperty(api, PATCH_FLAG, { value: true, enumerable: false })
  console.info('[automation-api] installed command error observability')
  return true
}

const installWhenReady = async(target = globalThis) => {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (install(target)) return true
    await wait(20)
  }
  console.error('[automation-api] command error observability was not installed')
  return false
}

void installWhenReady()

export { install as installAutomationCommandErrorObservability }

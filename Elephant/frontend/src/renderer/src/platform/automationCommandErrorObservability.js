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

const synchronizeMuyaSelection = (target) => {
  const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
  if (!activeMuya?.contentState) return
  const selectionChanges = activeMuya.contentState.selectionChange()
  if (selectionChanges?.start && selectionChanges?.end) {
    activeMuya.contentState.cursor = {
      start: { ...selectionChanges.start },
      end: { ...selectionChanges.end },
      isEdit: true
    }
  }
  activeMuya.dispatchSelectionChange?.(activeMuya.contentState.cursor)
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
  const EventConstructor = element.ownerDocument.defaultView?.Event
  if (typeof EventConstructor === 'function') {
    element.ownerDocument.dispatchEvent(new EventConstructor('selectionchange', { bubbles: true }))
  }
  synchronizeMuyaSelection(target)
  return true
}

const canonicalEditorState = (target) => {
  const state = target.__ELEPHANT_ACTIVE_MUYA__?.__rustMirror?.state
  return {
    revision: Number(state?.revision || 0),
    markdown: String(state?.markdown ?? '')
  }
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
    const before = canonicalEditorState(target)
    try {
      return await originalPress(selector, key)
    } catch (error) {
      const message = error?.message || String(error)
      const enterWasNotClaimed = (key === 'Enter' || key === 'Shift+Enter') &&
        message.includes('was not claimed by a new Rust editor command path')

      if (savedSelection && enterWasNotClaimed) {
        // Give a genuinely accepted asynchronous transaction one event-loop turn
        // before considering a retry. Never dispatch a second Enter if Rust or
        // the canonical Markdown already moved.
        await wait(40)
        const after = canonicalEditorState(target)
        const unchanged = after.revision === before.revision && after.markdown === before.markdown
        const liveElement = target.document?.querySelector?.(selector)
        if (unchanged && liveElement && restoreSelectionOffsets(target, liveElement, savedSelection)) {
          console.warn('[automation-api] retrying Enter after restoring the canonical selection', {
            selector,
            key,
            anchor: savedSelection.anchor,
            focus: savedSelection.focus,
            surfaceReplaced: liveElement !== initialElement || initialElement?.isConnected === false
          })
          try {
            return await originalPress(selector, key)
          } catch (retryError) {
            throw diagnosticError(`press(${JSON.stringify(key)}) after selection restoration`, retryError)
          }
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

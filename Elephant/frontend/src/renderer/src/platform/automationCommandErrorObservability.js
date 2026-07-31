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

const terminalLineEndingEquivalent = (exported, canonical) => {
  if (Math.abs(exported.length - canonical.length) !== 1) return false
  if (!exported.endsWith('\n') && !canonical.endsWith('\n')) return false
  return exported.replace(/\n$/, '') === canonical.replace(/\n$/, '')
}

const canonicalSurfaceIsSynchronized = (activeMuya, canonicalState) => {
  if (!canonicalState || typeof activeMuya?.getMarkdown !== 'function') return false
  try {
    const exported = String(activeMuya.getMarkdown() ?? '')
    const canonical = String(canonicalState.markdown ?? '')
    return exported === canonical || terminalLineEndingEquivalent(exported, canonical)
  } catch {
    return false
  }
}

const waitForLiveRustEditor = async(target, selector, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let last = null

  while (Date.now() <= deadline) {
    const element = target.document?.querySelector?.(selector)
    const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
    const sameSurface = Boolean(element && activeMuya?.container === element)

    if (sameSurface) {
      try {
        await activeMuya.__rustMirror?.ready
        await activeMuya.__rustCanonicalReady
        await activeMuya.__rustMutationGate?.flush?.()
      } catch (error) {
        throw new Error(`Rust editor readiness failed before Enter: ${error?.message || String(error)}`)
      }
    }

    const currentElement = target.document?.querySelector?.(selector)
    const currentMuya = target.__ELEPHANT_ACTIVE_MUYA__
    const published = target.__ELEPHANT_MUYA_RUST_MIRROR__
    const canonical = currentMuya?.__rustMirror?.state
    const currentSameSurface = Boolean(currentElement && currentMuya?.container === currentElement)
    const synchronized = canonicalSurfaceIsSynchronized(currentMuya, canonical)
    const idle = Number(currentMuya?.__rustMutationGate?.pending || 0) === 0

    last = {
      element: Boolean(currentElement),
      activeMuya: Boolean(currentMuya),
      sameSurface: currentSameSurface,
      phase: published?.phase || null,
      revision: Number(published?.revision || 0),
      canonicalRevision: Number(canonical?.revision || 0),
      synchronized,
      idle
    }

    if (published?.phase === 'error') {
      throw new Error(`Rust editor failed before Enter: ${published.error || published.reason || 'unknown error'}`)
    }
    if (currentSameSurface && published?.phase === 'ready' && synchronized && idle) {
      return { element: currentElement, activeMuya: currentMuya }
    }
    await wait(20)
  }

  throw new Error(`The visible Rust editor did not become ready before Enter: ${JSON.stringify(last)}`)
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
    const isEnter = key === 'Enter' || key === 'Shift+Enter'
    const isRustTarget = Boolean(
      initialElement?.closest?.('[data-testid="muya-rust-runtime-editor"]') ||
      initialElement?.querySelector?.('[data-testid="muya-rust-runtime-editor"]')
    )

    if (isEnter && isRustTarget) {
      const { element, activeMuya } = await waitForLiveRustEditor(target, selector)
      const liveSelection = selectionOffsetsWithin(target, element)
      if (savedSelection && (element !== initialElement || !liveSelection)) {
        if (!restoreSelectionOffsets(target, element, savedSelection)) {
          throw new Error('Unable to restore the visible editor selection on the canonical Rust surface before Enter')
        }
        await activeMuya.__rustMirror?.flush?.()
        await activeMuya.__rustMutationGate?.flush?.()
        const restored = selectionOffsetsWithin(target, element)
        if (!restored || restored.anchor !== savedSelection.anchor || restored.focus !== savedSelection.focus) {
          throw new Error(`The visible editor selection changed while reacquiring the Rust surface: ${JSON.stringify({
            expected: savedSelection,
            restored
          })}`)
        }
        console.info('[automation-api] reacquired canonical Rust surface before Enter', {
          selector,
          key,
          anchor: restored.anchor,
          focus: restored.focus,
          surfaceReplaced: element !== initialElement || initialElement?.isConnected === false
        })
      }
    }

    const before = canonicalEditorState(target)
    try {
      return await originalPress(selector, key)
    } catch (error) {
      const diagnosticText = [error?.message, error?.stack, String(error)].filter(Boolean).join('\n')
      const enterWasNotClaimed = isEnter &&
        diagnosticText.includes('was not claimed by a new Rust editor command path')

      if (savedSelection && enterWasNotClaimed) {
        // Give a genuinely accepted asynchronous transaction one event-loop turn
        // before considering a retry. Never dispatch a second Enter if Rust or
        // the canonical Markdown already moved.
        await wait(40)
        const after = canonicalEditorState(target)
        const unchanged = after.revision === before.revision && after.markdown === before.markdown
        const retryElement = target.document?.querySelector?.(selector)
        if (unchanged && retryElement && restoreSelectionOffsets(target, retryElement, savedSelection)) {
          const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
          await activeMuya?.__rustMirror?.flush?.()
          await activeMuya?.__rustMutationGate?.flush?.()
          console.warn('[automation-api] retrying Enter after restoring the canonical selection', {
            selector,
            key,
            anchor: savedSelection.anchor,
            focus: savedSelection.focus,
            surfaceReplaced: retryElement !== initialElement || initialElement?.isConnected === false
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

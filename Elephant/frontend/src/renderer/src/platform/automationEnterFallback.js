const PATCH_STATE = '__elephantEnterFallbackState'
const INSTALL_DEADLINE_MS = 30_000
const READY_TIMEOUT_MS = 5_000
const MUTATION_TIMEOUT_MS = 5_000
const POLL_MS = 20

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const browserSelectionFor = (target, element) => target.getSelection?.() ||
  target.window?.getSelection?.() ||
  element?.ownerDocument?.defaultView?.getSelection?.()

const selectionBelongsTo = (selection, element) => Boolean(
  selection?.anchorNode &&
  selection?.focusNode &&
  selection.anchorNode.isConnected !== false &&
  selection.focusNode.isConnected !== false &&
  (selection.anchorNode === element || element.contains?.(selection.anchorNode)) &&
  (selection.focusNode === element || element.contains?.(selection.focusNode))
)

const selectionOffsetsWithin = (target, element) => {
  const selection = browserSelectionFor(target, element)
  if (!selectionBelongsTo(selection, element)) return null

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

const terminalLineEndingEquivalent = (left, right) => {
  const first = String(left ?? '')
  const second = String(right ?? '')
  if (Math.abs(first.length - second.length) !== 1) return false
  if (!first.endsWith('\n') && !second.endsWith('\n')) return false
  return first.replace(/\n$/, '') === second.replace(/\n$/, '')
}

const canonicalSurfaceIsSynchronized = (activeMuya, canonical) => {
  if (!canonical || typeof activeMuya?.getMarkdown !== 'function') return false
  try {
    const visible = String(activeMuya.getMarkdown() ?? '')
    const markdown = String(canonical.markdown ?? '')
    return visible === markdown || terminalLineEndingEquivalent(visible, markdown)
  } catch {
    return false
  }
}

const rustEditorFor = (element) => element?.closest?.('[data-testid="muya-rust-runtime-editor"]') ||
  element?.querySelector?.('[data-testid="muya-rust-runtime-editor"]')

const sameRustSurface = (left, right) => {
  const leftSurface = rustEditorFor(left)
  const rightSurface = rustEditorFor(right)
  return Boolean(leftSurface && leftSurface === rightSurface)
}

const instanceRustStatus = (activeMuya) => activeMuya?.__rustMirror?.status || null

const instanceStatusMatchesCanonical = (status, canonical) => Boolean(
  status?.phase === 'ready' &&
  !status?.error &&
  canonical &&
  Number(status.revision || 0) >= Number(canonical.revision || 0) &&
  Number(status.markdownLength || 0) === String(canonical.markdown ?? '').length
)

const waitForLiveRustEditor = async(target, selector) => {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let last = null

  while (Date.now() <= deadline) {
    const element = target.document?.querySelector?.(selector)
    const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
    const status = instanceRustStatus(activeMuya)
    const canonical = activeMuya?.__rustMirror?.state
    const sameSurface = Boolean(element && sameRustSurface(activeMuya?.container, element))
    const idle = Number(activeMuya?.__rustMutationGate?.pending || 0) === 0
    const synchronized = canonicalSurfaceIsSynchronized(activeMuya, canonical)
    const statusCurrent = instanceStatusMatchesCanonical(status, canonical)

    last = {
      element: Boolean(element),
      activeMuya: Boolean(activeMuya),
      sameSurface,
      phase: status?.phase || null,
      statusRevision: Number(status?.revision || 0),
      statusMarkdownLength: Number(status?.markdownLength || 0),
      canonicalRevision: Number(canonical?.revision || 0),
      canonicalMarkdownLength: String(canonical?.markdown ?? '').length,
      idle,
      synchronized,
      statusCurrent
    }

    if (status?.phase === 'error' || canonical?.error) {
      throw new Error(`Rust editor failed before Enter: ${status?.error || canonical?.error || status?.reason || 'unknown error'}`)
    }
    if (sameSurface && statusCurrent && idle && synchronized) {
      return { element, activeMuya, canonical }
    }
    await sleep(POLL_MS)
  }

  console.error('[automation-api] Enter readiness timed out for the current Rust instance', last)
  throw new Error(`The current visible Rust editor did not become ready before Enter: ${JSON.stringify(last)}`)
}

const restoreVisibleSelection = async(api, target, selector, element, savedSelection) => {
  if (!savedSelection) {
    throw new Error('Enter requires a visible browser selection inside the current Rust editor')
  }

  const current = selectionOffsetsWithin(target, element)
  if (current?.anchor === savedSelection.anchor && current?.focus === savedSelection.focus) return current
  if (typeof api.selectText !== 'function') {
    throw new Error('Enter cannot restore the visible selection because selectText is unavailable')
  }

  await api.selectText(selector, savedSelection.anchor, savedSelection.focus)
  const liveElement = target.document?.querySelector?.(selector)
  const restored = liveElement ? selectionOffsetsWithin(target, liveElement) : null
  if (restored?.anchor !== savedSelection.anchor || restored?.focus !== savedSelection.focus) {
    throw new Error(`Enter could not restore the visible selection on the active Rust surface: ${JSON.stringify({
      expected: savedSelection,
      restored
    })}`)
  }
  return restored
}

const createBeforeInput = (target, element, inputType) => {
  const InputEventConstructor = element?.ownerDocument?.defaultView?.InputEvent ||
    target.InputEvent ||
    target.window?.InputEvent
  if (typeof InputEventConstructor !== 'function') {
    throw new Error('Visible Rust Enter requires InputEvent support')
  }
  return new InputEventConstructor('beforeinput', {
    inputType,
    data: null,
    bubbles: true,
    cancelable: true,
    composed: true
  })
}

const waitForCompletedMutation = async(target, expectedMuya, before, selector, key) => {
  const deadline = Date.now() + MUTATION_TIMEOUT_MS
  let last = null

  while (Date.now() <= deadline) {
    const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
    const status = instanceRustStatus(expectedMuya)
    const canonical = expectedMuya?.__rustMirror?.state
    const idle = Number(expectedMuya?.__rustMutationGate?.pending || 0) === 0
    const synchronized = canonicalSurfaceIsSynchronized(expectedMuya, canonical)
    const changed = Number(canonical?.revision || 0) > Number(before.revision || 0) ||
      String(canonical?.markdown ?? '') !== String(before.markdown ?? '')
    const statusCurrent = instanceStatusMatchesCanonical(status, canonical)

    last = {
      sameRuntime: activeMuya === expectedMuya,
      phase: status?.phase || null,
      beforeRevision: Number(before.revision || 0),
      canonicalRevision: Number(canonical?.revision || 0),
      statusRevision: Number(status?.revision || 0),
      beforeMarkdownLength: String(before.markdown ?? '').length,
      canonicalMarkdownLength: String(canonical?.markdown ?? '').length,
      statusMarkdownLength: Number(status?.markdownLength || 0),
      idle,
      synchronized,
      statusCurrent,
      changed
    }

    if (status?.phase === 'error' || canonical?.error) {
      throw new Error(`Rust editor failed while applying ${key}: ${status?.error || canonical?.error || status?.reason || 'unknown error'}`)
    }
    if (activeMuya !== expectedMuya) {
      throw new Error(`The visible editor remounted while applying ${key}`)
    }
    if (changed && statusCurrent && idle && synchronized) {
      console.info('[automation-api] completed Enter on the current visible Rust generation', {
        selector,
        key,
        revision: canonical.revision,
        markdownLength: String(canonical.markdown ?? '').length
      })
      return canonical
    }
    await sleep(POLL_MS)
  }

  console.error('[automation-api] Enter mutation timed out for the current Rust instance', last)
  throw new Error(`The claimed visible ${key} did not produce a completed Rust mutation: ${JSON.stringify(last)}`)
}

const dispatchVisibleEnter = async(api, target, selector, key, initialElement) => {
  const savedSelection = selectionOffsetsWithin(target, initialElement)
  const ready = await waitForLiveRustEditor(target, selector)
  await restoreVisibleSelection(api, target, selector, ready.element, savedSelection)

  const element = target.document?.querySelector?.(selector)
  const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
  const before = activeMuya?.__rustMirror?.state
  if (!element || activeMuya !== ready.activeMuya || !sameRustSurface(activeMuya?.container, element) || !before) {
    throw new Error('The Rust editor generation changed after restoring the visible Enter selection')
  }

  const KeyboardEventConstructor = element.ownerDocument?.defaultView?.KeyboardEvent ||
    target.KeyboardEvent ||
    target.window?.KeyboardEvent
  if (typeof KeyboardEventConstructor !== 'function') {
    throw new Error('Visible Rust Enter requires KeyboardEvent support')
  }

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

  let beforeInput = null
  if (!keydown.defaultPrevented) {
    beforeInput = createBeforeInput(target, element, key === 'Shift+Enter' ? 'insertLineBreak' : 'insertParagraph')
    element.dispatchEvent(beforeInput)
  }
  element.dispatchEvent(new KeyboardEventConstructor('keyup', eventInit))

  if (!keydown.defaultPrevented && !beforeInput?.defaultPrevented) {
    throw new Error('The current visible Rust editor did not claim Enter through keydown or beforeinput')
  }

  await waitForCompletedMutation(target, activeMuya, {
    revision: Number(before.revision || 0),
    markdown: String(before.markdown ?? '')
  }, selector, key)
  return api.readDom(selector)
}

const install = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || typeof api.press !== 'function') return false

  const previous = api[PATCH_STATE]
  if (previous?.wrapper === api.press) return true

  // Other automation modules are loaded asynchronously and may replace `press`.
  // Keep this generation-aware wrapper outermost, but retain the original path
  // for every non-Rust target and every key other than Enter.
  const originalPress = api.press.bind(api)
  const wrapper = async(selector, key) => {
    if (key !== 'Enter' && key !== 'Shift+Enter') return originalPress(selector, key)
    const initialElement = target.document?.querySelector?.(selector)
    if (!initialElement || !rustEditorFor(initialElement)) return originalPress(selector, key)
    return dispatchVisibleEnter(api, target, selector, key, initialElement)
  }

  api.press = wrapper
  Object.defineProperty(api, PATCH_STATE, {
    configurable: true,
    enumerable: false,
    value: { wrapper, originalPress }
  })
  return true
}

const deadline = Date.now() + INSTALL_DEADLINE_MS
const timer = setInterval(() => {
  install(globalThis)
  if (Date.now() >= deadline) clearInterval(timer)
}, POLL_MS)
install(globalThis)

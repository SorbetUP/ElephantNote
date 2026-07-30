const PATCH_FLAG = '__elephantCanonicalInsertTextPreflightInstalled'
const EDITOR_INPUT_FLAG = '__elephantEditorInputDefaultsInstalled'
const DURABILITY_FLAG = '__elephantEditorDurabilityAutomationFenceInstalled'

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const browserSelectionFor = (target, element) => target.getSelection?.() ||
  target.window?.getSelection?.() ||
  element?.ownerDocument?.defaultView?.getSelection?.()

const selectionOffsetsWithin = (target, element) => {
  const selection = browserSelectionFor(target, element)
  if (!selection?.anchorNode || !selection?.focusNode) return null
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
      focus: offsetOf(selection.focusNode, selection.focusOffset),
      textLength: String(element.textContent || '').length
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

const restoreSelection = (target, element, saved) => {
  if (!saved) return
  const liveLength = String(element.textContent || '').length
  const selectedInterimEnd = saved.anchor === saved.focus && saved.focus === saved.textLength
  const anchorOffset = selectedInterimEnd ? liveLength : Math.min(saved.anchor, liveLength)
  const focusOffset = selectedInterimEnd ? liveLength : Math.min(saved.focus, liveLength)
  const anchor = textPointAt(element, anchorOffset)
  const focus = textPointAt(element, focusOffset)
  const selection = browserSelectionFor(target, element)
  if (!selection) throw new Error('The live Rust editor has no Selection API')

  if (typeof selection.setBaseAndExtent === 'function') {
    selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
    return
  }

  const range = element.ownerDocument.createRange()
  const start = anchorOffset <= focusOffset ? anchor : focus
  const end = anchorOffset <= focusOffset ? focus : anchor
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  selection.removeAllRanges()
  selection.addRange(range)
}

const terminalLineEndingEquivalent = (exported, canonical) => {
  // Muya omits exactly one final empty paragraph that Rust retains as a terminal
  // LF. The position of the caret does not change that serialization fact. Keep
  // the comparison strict: only one terminal LF may differ and every preceding
  // character must remain identical.
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
    // Muya can briefly expose a half-rendered ContentState while the queued Rust
    // transaction is repainting the contenteditable. That transient serializer
    // exception is not a failed user mutation; the ready/idle loop below must
    // wait for the same real surface to settle and then evaluate it again.
    return false
  }
}

const waitForLiveRustEditor = async(target, selector, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs
  let last = null

  while (Date.now() <= deadline) {
    const element = target.document?.querySelector?.(selector)
    const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
    const published = target.__ELEPHANT_MUYA_RUST_MIRROR__
    const canonical = activeMuya?.__rustMirror?.state
    const sameSurface = Boolean(element && activeMuya?.container === element)
    const synchronized = canonicalSurfaceIsSynchronized(activeMuya, canonical)
    const idle = Number(activeMuya?.__rustMutationGate?.pending || 0) === 0

    last = {
      element: Boolean(element),
      activeMuya: Boolean(activeMuya),
      sameSurface,
      phase: published?.phase || null,
      revision: Number(published?.revision || 0),
      canonicalRevision: Number(canonical?.revision || 0),
      synchronized: Boolean(synchronized),
      idle
    }

    if (published?.phase === 'error') {
      throw new Error(`Rust editor failed before visible text input: ${published.error || published.reason || 'unknown error'}`)
    }
    if (sameSurface && published?.phase === 'ready' && synchronized && idle) return { element, activeMuya }
    await wait(20)
  }

  throw new Error(`The visible Rust editor did not become ready before text input: ${JSON.stringify(last)}`)
}

const dispatchVisibleCharacter = async(target, selector, character) => {
  const { element, activeMuya } = await waitForLiveRustEditor(target, selector)
  const before = activeMuya?.__rustMirror?.state
  const beforeRevision = Number(before?.revision || 0)
  const beforeMarkdown = String(before?.markdown || '')
  const InputEventConstructor = target.InputEvent || target.window?.InputEvent
  if (typeof InputEventConstructor !== 'function') {
    throw new Error('Visible Rust text input requires InputEvent support')
  }

  element.focus?.()
  const event = new InputEventConstructor('beforeinput', {
    inputType: 'insertText',
    data: character,
    bubbles: true,
    cancelable: true,
    composed: true
  })
  if (event.inputType !== 'insertText') {
    Object.defineProperty(event, 'inputType', {
      configurable: true,
      enumerable: true,
      value: 'insertText'
    })
  }
  if (event.data !== character) {
    Object.defineProperty(event, 'data', {
      configurable: true,
      enumerable: true,
      value: character
    })
  }

  element.dispatchEvent(event)
  if (!event.defaultPrevented) {
    throw new Error('The visible Rust editor did not claim the insertText beforeinput event')
  }

  const deadline = Date.now() + 10_000
  let last = null
  while (Date.now() <= deadline) {
    const live = target.__ELEPHANT_ACTIVE_MUYA__
    const state = live?.__rustMirror?.state
    const published = target.__ELEPHANT_MUYA_RUST_MIRROR__
    const idle = Number(live?.__rustMutationGate?.pending || 0) === 0
    const synchronized = canonicalSurfaceIsSynchronized(live, state)
    last = {
      revision: Number(state?.revision || 0),
      markdownLength: String(state?.markdown || '').length,
      phase: published?.phase || null,
      idle,
      synchronized
    }
    if (published?.phase === 'error') {
      throw new Error(`Rust editor failed while applying visible text: ${published.error || published.reason || 'unknown error'}`)
    }
    if (
      Number(state?.revision || 0) > beforeRevision &&
      String(state?.markdown || '') !== beforeMarkdown &&
      published?.phase === 'ready' &&
      synchronized &&
      idle
    ) return state
    await wait(20)
  }

  throw new Error(`The visible insertText event did not complete a Rust mutation: ${JSON.stringify({ beforeRevision, character, last })}`)
}

const install = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || api[PATCH_FLAG]) return false
  if (!api[EDITOR_INPUT_FLAG] || !api[DURABILITY_FLAG] || typeof api.insertText !== 'function') return false

  const originalInsertText = api.insertText.bind(api)
  api.insertText = async(selector, value) => {
    if (!selector || typeof selector !== 'string') throw new TypeError('insertText requires a CSS selector')
    if (typeof value !== 'string') throw new TypeError('insertText requires a string value')

    const initialElement = target.document?.querySelector?.(selector)
    const isRustTarget = Boolean(
      initialElement?.closest?.('[data-testid="muya-rust-runtime-editor"]') ||
      initialElement?.querySelector?.('[data-testid="muya-rust-runtime-editor"]')
    )
    if (!isRustTarget) return originalInsertText(selector, value)

    const savedSelection = selectionOffsetsWithin(target, initialElement)
    const { element } = await waitForLiveRustEditor(target, selector)
    const liveSelection = selectionOffsetsWithin(target, element)
    if (element !== initialElement || !liveSelection) restoreSelection(target, element, savedSelection)

    let characterIndex = 0
    for (const character of value) {
      characterIndex += 1
      try {
        await dispatchVisibleCharacter(target, selector, character)
      } catch (error) {
        // Some WebKit builds expose a stack containing only a source location.
        // Keep a real Error for lint and runtime semantics, but normalize its
        // stack so the external automation transport always retains the exact
        // failed character and invariant message.
        const message = `Visible Rust insertText failed at character ${characterIndex}/${value.length} ${JSON.stringify(character)}: ${error?.message || String(error)}; stack=${error?.stack || 'none'}`
        const wrappedError = new Error(message)
        const stack = String(wrappedError.stack || '')
        if (!stack.includes(message)) {
          wrappedError.stack = `${wrappedError.name}: ${message}${stack ? `\n${stack}` : ''}`
        }
        throw wrappedError
      }
    }
    return api.readDom(selector)
  }

  Object.defineProperty(api, PATCH_FLAG, { value: true, enumerable: false })
  console.info('[automation-api] installed live Rust editor text-input preflight')
  return true
}

const installWhenReady = async(target = globalThis) => {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    if (install(target)) return true
    await wait(20)
  }
  console.error('[automation-api] live Rust editor text-input preflight was not installed')
  return false
}

void installWhenReady()

export { install as installCanonicalAutomationInsertText }

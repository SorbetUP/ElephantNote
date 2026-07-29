const PATCH_FLAG = '__elephantEditorInputDefaultsInstalled'

const editorElement = (target, selector) => {
  const element = target.document?.querySelector?.(selector)
  if (!element) throw new Error(`press target was not found: ${selector}`)
  return element
}

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
  } catch (error) {
    throw new Error(`Unable to capture the visible editor selection before focus: ${error?.name || 'Error'}: ${error?.message || String(error)}`)
  }
}

const liveTextPointAt = (element, requestedOffset) => {
  const document = element.ownerDocument
  const showText = document.defaultView?.NodeFilter?.SHOW_TEXT ?? 4
  const walker = document.createTreeWalker(element, showText)
  let remaining = Math.max(0, Number(requestedOffset) || 0)
  let node = walker.nextNode()
  let lastTextNode = null

  while (node) {
    lastTextNode = node
    const length = String(node.data || '').length
    if (remaining <= length) return { node, offset: remaining }
    remaining -= length
    node = walker.nextNode()
  }

  if (lastTextNode) {
    return { node: lastTextNode, offset: String(lastTextNode.data || '').length }
  }
  return { node: element, offset: element.childNodes?.length || 0 }
}

export const restoreSelectionAfterFocus = (target, element, selector = null) => {
  const currentBeforeFocus = browserSelectionFor(target, element)

  // The visible selection created by selectText is already the authoritative
  // browser range. Refocusing the contenteditable can synchronously recreate
  // Muya descendants and invalidate a perfectly valid middle-of-paragraph
  // selection before the keydown reaches the Rust owner. Synthetic events are
  // dispatched directly to the element, so no focus transition is required.
  if (selectionBelongsTo(currentBeforeFocus, element)) return element

  const saved = selectionOffsetsWithin(target, element)
  element.focus?.()
  const liveElement = selector ? editorElement(target, selector) : element
  if (!saved) return liveElement

  const current = browserSelectionFor(target, liveElement)
  if (!current) throw new Error('Unable to restore the visible editor selection: Selection API is unavailable')

  const anchor = liveTextPointAt(liveElement, saved.anchor)
  const focus = liveTextPointAt(liveElement, saved.focus)
  try {
    if (typeof current.setBaseAndExtent === 'function') {
      current.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset)
    } else if (saved.anchor === saved.focus) {
      const range = liveElement.ownerDocument.createRange()
      range.setStart(anchor.node, anchor.offset)
      range.collapse(true)
      current.removeAllRanges()
      current.addRange(range)
    } else if (typeof current.extend === 'function') {
      const range = liveElement.ownerDocument.createRange()
      range.setStart(anchor.node, anchor.offset)
      range.collapse(true)
      current.removeAllRanges()
      current.addRange(range)
      current.extend(focus.node, focus.offset)
    } else {
      const range = liveElement.ownerDocument.createRange()
      const start = saved.anchor <= saved.focus ? anchor : focus
      const end = saved.anchor <= saved.focus ? focus : anchor
      range.setStart(start.node, start.offset)
      range.setEnd(end.node, end.offset)
      current.removeAllRanges()
      current.addRange(range)
    }
  } catch (error) {
    throw new Error(`Unable to restore the visible editor selection after focus: ${error?.name || 'Error'}: ${error?.message || String(error)}`)
  }
  return liveElement
}

const rustEditorFor = (element) => element?.closest?.('[data-testid="muya-rust-runtime-editor"]') ||
  element?.querySelector?.('[data-testid="muya-rust-runtime-editor"]')

const inputEventConstructorFor = (target, element) => element?.ownerDocument?.defaultView?.InputEvent ||
  target.InputEvent ||
  target.window?.InputEvent

const genericEventConstructorFor = (target, element) => element?.ownerDocument?.defaultView?.Event ||
  target.Event ||
  target.window?.Event

const defineEventField = (event, name, value) => {
  if (event?.[name] === value) return true
  try {
    Object.defineProperty(event, name, {
      configurable: true,
      enumerable: true,
      value
    })
    return event[name] === value
  } catch {
    return false
  }
}

const createBeforeInput = (target, element, inputType, data) => {
  const InputEventConstructor = inputEventConstructorFor(target, element)
  const eventInit = {
    inputType,
    data,
    bubbles: true,
    cancelable: true,
    composed: true
  }

  let beforeInput = null
  if (typeof InputEventConstructor === 'function') {
    try {
      beforeInput = new InputEventConstructor('beforeinput', eventInit)
    } catch (error) {
      console.warn('[automation-api] native InputEvent construction failed; using a realm-local beforeinput event', {
        inputType,
        error: error?.message || String(error)
      })
    }
  }

  if (!beforeInput || !defineEventField(beforeInput, 'inputType', inputType) ||
    (data !== null && !defineEventField(beforeInput, 'data', data))) {
    const EventConstructor = genericEventConstructorFor(target, element)
    if (typeof EventConstructor !== 'function') {
      throw new Error(`${inputType} requires Event support at the visible editor boundary`)
    }
    beforeInput = new EventConstructor('beforeinput', {
      bubbles: true,
      cancelable: true,
      composed: true
    })
    if (!defineEventField(beforeInput, 'inputType', inputType) ||
      (data !== null && !defineEventField(beforeInput, 'data', data))) {
      throw new Error(`Unable to expose ${inputType} metadata on the visible beforeinput event`)
    }
  }

  return beforeInput
}

const dispatchClaimedBeforeInput = (target, element, inputType, data) => {
  const beforeInput = createBeforeInput(target, element, inputType, data)
  element.dispatchEvent(beforeInput)
  if (!beforeInput.defaultPrevented) {
    throw new Error(`The visible editor did not claim the ${inputType} beforeinput event`)
  }
  return beforeInput
}

const dispatchEnterDefault = (target, element, key) => {
  const inputType = key === 'Shift+Enter' ? 'insertLineBreak' : 'insertParagraph'
  return dispatchClaimedBeforeInput(target, element, inputType, null)
}

const waitForPublishedRustState = async(target, expectedMuya, before, label, timeoutMs = 5000) => {
  if (expectedMuya?.__rustMutationGate?.flush) await expectedMuya.__rustMutationGate.flush()

  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() <= deadline) {
    const published = target.__ELEPHANT_MUYA_RUST_MIRROR__
    const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
    if (published?.phase === 'error') {
      throw new Error(`Rust editor failed while applying ${label}: ${published.error || published.reason || 'unknown error'}`)
    }
    if (activeMuya !== expectedMuya) {
      throw new Error(`The visible editor remounted while applying ${label} instead of completing the same user interaction`)
    }

    const canonicalState = expectedMuya?.__rustMirror?.state
    const visibleMarkdown = expectedMuya?.getMarkdown?.()
    const mutationObserved = canonicalState && (
      Number(canonicalState.revision || 0) > Number(before?.canonicalRevision || before?.revision || 0) ||
      String(canonicalState.markdown ?? '') !== String(before?.canonicalMarkdown ?? '')
    )
    const publishedCurrent = canonicalState &&
      Number(published?.revision || 0) >= Number(canonicalState.revision || 0) &&
      Number(published?.markdownLength || 0) === String(canonicalState.markdown ?? '').length
    const visibleSynchronized = canonicalState &&
      String(visibleMarkdown ?? '') === String(canonicalState.markdown ?? '') &&
      Number(expectedMuya?.__rustMutationGate?.pending || 0) === 0

    last = {
      beforeRevision: Number(before?.revision || 0),
      beforeCanonicalRevision: Number(before?.canonicalRevision || 0),
      beforeMarkdownLength: Number(before?.markdownLength || 0),
      beforeCanonicalMarkdownLength: String(before?.canonicalMarkdown ?? '').length,
      publishedRevision: Number(published?.revision || 0),
      publishedMarkdownLength: Number(published?.markdownLength || 0),
      canonicalRevision: Number(canonicalState?.revision || 0),
      canonicalMarkdownLength: String(canonicalState?.markdown ?? '').length,
      visibleMarkdownLength: String(visibleMarkdown ?? '').length,
      pending: Number(expectedMuya?.__rustMutationGate?.pending || 0),
      mutationObserved
    }

    if (mutationObserved && publishedCurrent && visibleSynchronized) return published
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`The visible ${label} did not reach a completed and rendered Rust editor mutation: ${JSON.stringify(last)}`)
}

const waitForRustMutation = async(target, before, mutationPromise, expectedMuya, timeoutMs = 5000) => {
  const transaction = mutationPromise?.then ? await mutationPromise : null
  if (!transaction?.state || !transaction.documentChanged) {
    throw new Error(`Rust Enter completed without a document mutation: ${JSON.stringify({
      documentChanged: transaction?.documentChanged,
      selectionChanged: transaction?.selectionChanged,
      revision: transaction?.state?.revision,
      markdownLength: transaction?.state?.markdown?.length
    })}`)
  }

  if (expectedMuya?.__rustMutationGate?.flush) await expectedMuya.__rustMutationGate.flush()

  const transactionRevision = Number(transaction.state.revision || 0)
  const transactionMarkdown = String(transaction.state.markdown ?? '')
  const deadline = Date.now() + timeoutMs
  let last = null

  while (Date.now() <= deadline) {
    const current = target.__ELEPHANT_MUYA_RUST_MIRROR__
    const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
    if (current?.phase === 'error') {
      throw new Error(`Rust editor failed while applying Enter: ${current.error || current.reason || 'unknown error'}`)
    }
    if (activeMuya !== expectedMuya) {
      throw new Error('The visible editor remounted while applying Enter instead of completing the same user interaction')
    }

    const canonicalState = expectedMuya?.__rustMirror?.state
    const visibleMarkdown = expectedMuya?.getMarkdown?.()
    const exactCommandPublished = Number(canonicalState?.revision || 0) >= transactionRevision &&
      Number(current?.revision || 0) >= transactionRevision
    const canonicalContainsTransaction = String(canonicalState?.markdown ?? '') === transactionMarkdown ||
      Number(canonicalState?.revision || 0) > transactionRevision
    const visibleSynchronized = canonicalState &&
      String(visibleMarkdown ?? '') === String(canonicalState.markdown ?? '') &&
      Number(expectedMuya?.__rustMutationGate?.pending || 0) === 0

    last = {
      beforeRevision: Number(before?.revision || 0),
      beforeMarkdownLength: Number(before?.markdownLength || 0),
      transactionRevision,
      transactionMarkdownLength: transactionMarkdown.length,
      publishedRevision: Number(current?.revision || 0),
      publishedMarkdownLength: Number(current?.markdownLength || 0),
      canonicalRevision: Number(canonicalState?.revision || 0),
      canonicalMarkdownLength: String(canonicalState?.markdown ?? '').length,
      visibleMarkdownLength: String(visibleMarkdown ?? '').length,
      pending: Number(expectedMuya?.__rustMutationGate?.pending || 0)
    }

    if (exactCommandPublished && canonicalContainsTransaction && visibleSynchronized) return current
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`The visible Enter key did not reach a completed and rendered Rust editor mutation: ${JSON.stringify(last)}`)
}

export const installEditorAutomationInputDefaults = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || typeof api.press !== 'function' || api[PATCH_FLAG]) return false

  const originalPress = api.press.bind(api)
  const originalInsertText = typeof api.insertText === 'function' ? api.insertText.bind(api) : null

  if (originalInsertText) {
    api.insertText = async(selector, text) => {
      if (typeof text !== 'string') throw new TypeError('insertText requires a string value')
      const initialElement = editorElement(target, selector)
      if (!rustEditorFor(initialElement)) return originalInsertText(selector, text)

      let characterCount = 0
      for (const character of text) {
        // A completed Rust render can replace the editable descendants between
        // two characters. Resolve the current surface for every event and keep an
        // existing live browser range untouched; only focus when no live range is
        // available at all.
        let element = editorElement(target, selector)
        element = restoreSelectionAfterFocus(target, element, selector)
        const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
        if (!activeMuya) throw new Error('The visible Rust editor has no active Muya runtime')

        const canonicalBefore = activeMuya.__rustMirror?.state
        const beforeRust = {
          ...(target.__ELEPHANT_MUYA_RUST_MIRROR__ || {}),
          canonicalRevision: Number(canonicalBefore?.revision || 0),
          canonicalMarkdown: String(canonicalBefore?.markdown ?? '')
        }

        // Real keyboard input delivers one beforeinput transaction per typed
        // Unicode character. Dispatching a whole sentence as one smartInput
        // command exercises a different, unsupported path and can fail before
        // the deliberate Enter mutation is reached.
        dispatchClaimedBeforeInput(target, element, 'insertText', character)
        await waitForPublishedRustState(target, activeMuya, beforeRust, `text input character ${characterCount + 1}`)
        characterCount += 1
      }

      console.info('[automation-api] dispatched trusted text input', {
        selector,
        valueLength: text.length,
        characterCount,
        rustMutationCompleted: true
      })
      return api.readDom(selector)
    }
  }

  api.press = async(selector, key) => {
    if (key !== 'Enter' && key !== 'Shift+Enter') return originalPress(selector, key)

    let element = editorElement(target, selector)
    element = restoreSelectionAfterFocus(target, element, selector)
    const KeyboardEventConstructor = element?.ownerDocument?.defaultView?.KeyboardEvent ||
      target.KeyboardEvent ||
      target.window?.KeyboardEvent
    if (typeof KeyboardEventConstructor !== 'function') {
      throw new Error('press requires KeyboardEvent support')
    }

    const rustEditor = rustEditorFor(element)
    const activeMuya = rustEditor ? target.__ELEPHANT_ACTIVE_MUYA__ : null
    const beforeRust = rustEditor ? { ...(target.__ELEPHANT_MUYA_RUST_MIRROR__ || {}) } : null
    const beforeEnterSequence = Number(activeMuya?.__lastRustEnterMutation?.sequence || 0)

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

    if (rustEditor) {
      const ownedMutation = activeMuya?.__lastRustEnterMutation
      const mutationPromise = keydown.__elephantRustMutationPromise || ownedMutation?.promise
      const mutationSequence = Number(keydown.__elephantRustMutationSequence || ownedMutation?.sequence || 0)
      if (!mutationPromise?.then || mutationSequence <= beforeEnterSequence) {
        throw new Error('The visible Enter key was not claimed by a new Rust editor command path')
      }
      await waitForRustMutation(target, beforeRust, mutationPromise, activeMuya)
    }

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

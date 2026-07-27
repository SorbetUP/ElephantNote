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

const rustEditorFor = (element) => element?.closest?.('[data-testid="muya-rust-runtime-editor"]') ||
  element?.querySelector?.('[data-testid="muya-rust-runtime-editor"]')

const inputEventConstructorFor = (target, element) => element?.ownerDocument?.defaultView?.InputEvent ||
  target.InputEvent ||
  target.window?.InputEvent

const createBeforeInput = (target, element, inputType, data) => {
  const InputEventConstructor = inputEventConstructorFor(target, element)
  if (typeof InputEventConstructor !== 'function') {
    throw new Error(`${inputType} requires InputEvent support at the visible editor boundary`)
  }

  const beforeInput = new InputEventConstructor('beforeinput', {
    inputType,
    data,
    bubbles: true,
    cancelable: true,
    composed: true
  })

  // WebKit versions used by Tauri may discard synthetic inputType values.
  // Restore the browser-observable fields without touching the document itself.
  if (beforeInput.inputType !== inputType) {
    Object.defineProperty(beforeInput, 'inputType', {
      configurable: true,
      enumerable: true,
      value: inputType
    })
  }
  if (data !== null && beforeInput.data !== data) {
    Object.defineProperty(beforeInput, 'data', {
      configurable: true,
      enumerable: true,
      value: data
    })
  }
  return beforeInput
}

const dispatchEnterDefault = (target, element, key) => {
  const inputType = key === 'Shift+Enter' ? 'insertLineBreak' : 'insertParagraph'
  const beforeInput = createBeforeInput(target, element, inputType, null)
  element.dispatchEvent(beforeInput)
  if (!beforeInput.defaultPrevented) {
    throw new Error(`The visible editor did not claim the ${inputType} beforeinput event`)
  }
}

const waitForPublishedRustState = async(target, expectedMuya, before, label, timeoutMs = 5000) => {
  // The visible beforeinput event queues a production Rust transaction. Draining
  // the mutation gate is the authoritative completion boundary; the checks below
  // additionally require that this exact user action changed canonical state.
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
  // Await the exact command created by the document-capture keydown handler.
  // The returned transaction is the primary proof that the visible Enter event
  // reached the production Rust command path and changed its canonical document.
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

    // The next real keystroke may run only after the exact Rust transaction has
    // been published, rendered by Muya, canonically synchronized, and drained.
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
      const element = editorElement(target, selector)
      const rustEditor = rustEditorFor(element)
      if (!rustEditor) return originalInsertText(selector, text)

      const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__
      if (!activeMuya) throw new Error('The visible Rust editor has no active Muya runtime')
      const canonicalBefore = activeMuya.__rustMirror?.state
      const beforeRust = {
        ...(target.__ELEPHANT_MUYA_RUST_MIRROR__ || {}),
        canonicalRevision: Number(canonicalBefore?.revision || 0),
        canonicalMarkdown: String(canonicalBefore?.markdown ?? '')
      }

      restoreSelectionAfterFocus(target, element)
      const beforeInput = createBeforeInput(target, element, 'insertText', text)
      element.dispatchEvent(beforeInput)
      if (!beforeInput.defaultPrevented) {
        throw new Error('The visible Rust editor did not claim the insertText beforeinput event')
      }

      await waitForPublishedRustState(target, activeMuya, beforeRust, 'text input')
      console.info('[automation-api] dispatched trusted text input', {
        selector,
        valueLength: text.length,
        rustMutationCompleted: true
      })
      return api.readDom(selector)
    }
  }

  api.press = async(selector, key) => {
    if (key !== 'Enter' && key !== 'Shift+Enter') return originalPress(selector, key)

    const element = editorElement(target, selector)
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

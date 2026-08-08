const AUTOMATION_FENCE_FLAG = '__elephantEditorDurabilityAutomationFenceInstalled'

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const cloneState = (state) => state && ({
  ...state,
  selection: state.selection ? { ...state.selection } : state.selection
})

const findPrototypeMethod = (instance, name) => {
  let prototype = Object.getPrototypeOf(instance)
  while (prototype) {
    if (typeof prototype[name] === 'function') return prototype[name]
    prototype = Object.getPrototypeOf(prototype)
  }
  return null
}

const checkpointState = (target = globalThis) => target.__ELEPHANT_BUFFERED_STATE_CHECKPOINT__ || null

const waitForCheckpointAdvance = async(target, previousRevision, label, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs
  let last = null
  while (Date.now() <= deadline) {
    const checkpoint = checkpointState(target)
    last = checkpoint && {
      requestedRevision: Number(checkpoint.requestedRevision || 0),
      persistedRevision: Number(checkpoint.persistedRevision || 0),
      pending: Boolean(checkpoint.pending),
      error: checkpoint.error || null
    }
    if (checkpoint?.error) throw new Error(`${label} recovery checkpoint failed: ${checkpoint.error}`)
    if (Number(checkpoint?.requestedRevision || 0) > Number(previousRevision || 0)) {
      const targetRevision = Number(checkpoint.requestedRevision || 0)
      await checkpoint.flush(targetRevision)
      if (Number(checkpoint.persistedRevision || 0) < targetRevision) {
        throw new Error(`${label} returned before recovery revision ${targetRevision} was persisted`)
      }
      return targetRevision
    }
    await sleep(20)
  }
  throw new Error(`${label} did not create a durable recovery checkpoint: ${JSON.stringify(last)}`)
}

export const installEditorDurabilityAutomationFence = (target = globalThis) => {
  const api = target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__
  if (!api || api[AUTOMATION_FENCE_FLAG] || typeof api.insertText !== 'function') return false

  const originalInsertText = api.insertText.bind(api)
  const originalPress = typeof api.press === 'function' ? api.press.bind(api) : null
  const isRustEditorTarget = (selector) => Boolean(
    target.document?.querySelector?.(selector)?.closest?.('[data-testid="muya-rust-runtime-editor"]') ||
    target.document?.querySelector?.(selector)?.querySelector?.('[data-testid="muya-rust-runtime-editor"]')
  )

  api.insertText = async(selector, text) => {
    if (!isRustEditorTarget(selector) || typeof text !== 'string' || text.length === 0) {
      return originalInsertText(selector, text)
    }
    const beforeRevision = Number(checkpointState(target)?.requestedRevision || 0)
    const result = await originalInsertText(selector, text)
    await waitForCheckpointAdvance(target, beforeRevision, 'text input')
    return result
  }

  if (originalPress) {
    api.press = async(selector, key) => {
      if (!isRustEditorTarget(selector) || (key !== 'Enter' && key !== 'Shift+Enter')) {
        return originalPress(selector, key)
      }
      const beforeRevision = Number(checkpointState(target)?.requestedRevision || 0)
      const result = await originalPress(selector, key)
      await waitForCheckpointAdvance(target, beforeRevision, key)
      return result
    }
  }

  Object.defineProperty(api, AUTOMATION_FENCE_FLAG, {
    configurable: false,
    enumerable: false,
    value: true
  })
  return true
}

export const installNativeInputDurability = (runtime) => {
  const muya = runtime?.muya
  const contentState = muya?.contentState
  const mirror = muya?.__rustMirror
  const mutationGate = muya?.__rustMutationGate
  const applyDomInput = contentState && findPrototypeMethod(contentState, 'inputHandler')

  if (!muya || !contentState || !mirror || !mutationGate?.enqueue || !applyDomInput) {
    return () => {}
  }

  const previousInputHandler = contentState.inputHandler
  let disposed = false
  let recoverySequence = 0

  const restoreCanonicalDocument = (fallbackMarkdown = '') => {
    const acceptedMarkdown = String(mirror.state?.markdown ?? fallbackMarkdown)
    if (typeof muya.__setProgrammaticMarkdown === 'function') {
      muya.__setProgrammaticMarkdown(acceptedMarkdown, undefined, true)
    } else {
      muya.setMarkdown?.(acceptedMarkdown)
    }
    return acceptedMarkdown
  }

  const reportRejectedNativeInput = (error, evidence = {}) => {
    console.error('[elephantnote:muya-rust] native input recovery rejected; restored canonical document', {
      sequence: evidence.sequence ?? null,
      inputType: String(evidence.inputType || 'unknown'),
      rejectedMarkdownLength: Number(evidence.rejectedMarkdownLength || 0),
      restoredMarkdownLength: Number(evidence.restoredMarkdownLength || 0),
      phase: evidence.phase || 'unknown',
      error: error?.message || String(error)
    })
    muya.__reportRustError?.(error)
  }

  const recoverNativeInput = (event) => {
    if (disposed) return undefined

    // A synthetic automation helper can emit `input` immediately after the
    // Rust-owned `beforeinput` handler prevented the browser default and queued
    // the canonical mutation. Muya's input handler is synchronous; returning the
    // mutation gate Promise here breaks its event pipeline. Ignore this duplicate
    // input event and let the durability fence await the checkpoint separately.
    if (mutationGate.pending > 0) return undefined

    // Composition is already captured at the editor boundary and committed as
    // one Rust transaction on compositionend. The temporary DOM mutations must
    // remain visual-only until that transaction renders the accepted document.
    if (
      muya.__rustComposition ||
      event?.isComposing ||
      event?.type === 'compositionend' ||
      event?.inputType === 'insertCompositionText'
    ) {
      return undefined
    }

    const inputType = String(event?.inputType || 'unknown')
    const sequence = ++recoverySequence
    runtime.markUserMutation?.(`native-input:${inputType}`)

    // The browser has already changed the contenteditable DOM. Rebuild Muya's
    // logical blocks from that exact DOM before reading Markdown. This path only
    // runs for a real `input` event; ordinary Rust-owned beforeinput operations
    // prevent the browser default and therefore never reach it.
    try {
      applyDomInput.call(contentState, event)
    } catch (error) {
      const restoredMarkdown = restoreCanonicalDocument()
      reportRejectedNativeInput(error, {
        sequence,
        inputType,
        restoredMarkdownLength: restoredMarkdown.length,
        phase: 'content-state-rebuild'
      })
      return undefined
    }

    const pending = mutationGate.enqueue(async() => {
      const canonicalBefore = String(mirror.state?.markdown || '')
      let visibleMarkdown = ''
      try {
        await mirror.flush()
        visibleMarkdown = String(muya.getMarkdown?.() || '')
        const canonicalCurrent = String(mirror.state?.markdown || canonicalBefore)
        if (visibleMarkdown === canonicalCurrent) {
          return {
            state: cloneState(mirror.state),
            documentChanged: false,
            selectionChanged: false,
            nativeInputRecovered: false
          }
        }

        const muyaIndexCursor = contentState.getMuyaIndexCursor?.()
        await mirror.sync(visibleMarkdown, 'native-input-recovery', {
          muyaIndexCursor,
          continueGroup: true
        })
        await mirror.flush()

        const state = cloneState(mirror.state)
        if (!state || String(state.markdown || '') !== visibleMarkdown) {
          throw new Error('Native input recovery did not converge the visible Muya document and canonical Rust Markdown.')
        }

        console.warn('[elephantnote:muya-rust] recovered browser input that bypassed beforeinput', {
          sequence,
          inputType,
          previousMarkdownLength: canonicalCurrent.length,
          recoveredMarkdownLength: visibleMarkdown.length,
          revision: state.revision
        })

        return {
          state,
          documentChanged: true,
          selectionChanged: true,
          nativeInputRecovered: true
        }
      } catch (error) {
        // Never leave a rejected browser mutation visible. Re-render the last
        // accepted Rust document synchronously before the mutation gate replays
        // a parent change notification, so neither autosave nor the recovery
        // journal can capture a DOM-only value.
        const restoredMarkdown = restoreCanonicalDocument(canonicalBefore)
        console.error('[elephantnote:muya-rust] native input recovery rejected; restored canonical document', {
          sequence,
          inputType,
          rejectedMarkdownLength: visibleMarkdown.length,
          restoredMarkdownLength: restoredMarkdown.length,
          phase: 'rust-synchronization',
          error: error?.message || String(error)
        })
        throw error
      }
    })

    muya.__lastRustNativeInputRecovery = { sequence, promise: pending }
    pending.catch((error) => muya.__reportRustError?.(error))

    // Muya's native input event pipeline is synchronous. The durability work is
    // deliberately queued and observed through the checkpoint fence; leaking the
    // Promise to Muya makes ordinary insertText/input dispatch fail before the
    // Rust transaction and recovery checkpoint can complete.
    return undefined
  }

  contentState.inputHandler = recoverNativeInput

  return () => {
    disposed = true
    if (contentState.inputHandler === recoverNativeInput) {
      contentState.inputHandler = previousInputHandler
    }
  }
}

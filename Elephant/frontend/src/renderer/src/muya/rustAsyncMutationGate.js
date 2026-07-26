export const createRustAsyncMutationGate = ({ dispatch, onSuppressed = () => {} } = {}) => {
  if (typeof dispatch !== 'function') {
    throw new TypeError('A Muya dispatchChange callback is required.')
  }
  if (typeof onSuppressed !== 'function') {
    throw new TypeError('A suppressed-dispatch callback must be a function.')
  }

  let pending = 0
  let replayRequested = false
  let tail = Promise.resolve()

  const guardedDispatch = (...args) => {
    if (pending > 0) {
      replayRequested = true
      onSuppressed(...args)
      return undefined
    }
    return dispatch(...args)
  }

  const enqueue = (operation) => {
    if (typeof operation !== 'function') {
      return Promise.reject(new TypeError('A Rust editor operation is required.'))
    }

    // Increment synchronously. Muya calls dispatchChange immediately after its
    // keyboard hook returns, before an asynchronous Rust operation gets a turn.
    pending += 1

    const result = tail
      .catch(() => undefined)
      .then(operation)
    const settled = result.finally(() => {
      pending = Math.max(0, pending - 1)

      // The immediate Muya change notification was intentionally suppressed while
      // Rust owned the mutation. Replay it exactly once after the final queued
      // Rust command has rendered the canonical document. Without this replay the
      // parent model and autosave continue to hold the pre-keyboard Markdown and
      // can remount that stale document before the next visible keystroke.
      if (pending === 0 && replayRequested) {
        replayRequested = false
        dispatch()
      }
    })

    // A failed command must not poison the ordering of later commands.
    tail = settled.catch(() => undefined)
    return settled
  }

  const flush = async() => {
    await tail
    // A completion callback can synchronously enqueue another operation while
    // the previous tail is settling. Repeat until the visible editor queue is
    // genuinely empty rather than merely observing one completed promise.
    if (pending > 0) return flush()
  }

  return {
    dispatch: guardedDispatch,
    enqueue,
    flush,
    get pending () {
      return pending
    }
  }
}

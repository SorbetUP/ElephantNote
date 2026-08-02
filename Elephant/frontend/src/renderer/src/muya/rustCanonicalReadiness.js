const INITIAL_SESSION_TIMEOUT_MS = 5_000

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const withTimeout = async(promise, timeoutMs, message) => {
  let timer = null
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const isRecoverableInitializationFailure = (error) => {
  const message = String(error?.message || error || '')
  return message === 'Rust Muya session is not initialized.' ||
    message === 'Rust Muya initial session readiness timed out.'
}

export const createRustCanonicalReadiness = ({
  previousReady,
  reset,
  refreshClipboard,
  reportClipboardError = () => {}
}) => {
  const hasInitializedSessionBarrier = previousReady != null

  // Muya calls the most-derived setMarkdown implementation from its base
  // constructor. At that point RustOwnedMuya has not created __rustMirror yet.
  // Scheduling a reset from this bootstrap pass races the mirror's own initial
  // session creation on WebKit: the reset can replace the pending create before
  // its readiness promise has established an initialized Tauri session, leaving
  // the visible editor permanently in "mounting". The derived constructor always
  // installs a second canonical barrier after __rustMirror.ready exists, using the
  // Markdown Muya actually rendered. Therefore the pre-mirror bootstrap pass must
  // be a no-op rather than an unchained asynchronous reset.
  if (!hasInitializedSessionBarrier) return Promise.resolve()

  const awaitInitialSession = () => withTimeout(
    previousReady,
    INITIAL_SESSION_TIMEOUT_MS,
    'Rust Muya initial session readiness timed out.'
  )

  const runReset = () => awaitInitialSession().then(() => reset())
  const canonicalReady = runReset().catch(async(error) => {
    // WebKit can publish the mirror object before its queued native create has
    // become observable, and a lost renderer wake-up can leave the original
    // readiness promise pending forever. In both cases issue a fresh production
    // reset after yielding. This does not accept a partial editor: the replacement
    // reset must complete successfully and remains the canonical readiness barrier.
    if (!isRecoverableInitializationFailure(error)) throw error
    await wait(0)
    return reset()
  })

  // Clipboard metadata is useful for toolbar state, but it is not part of the
  // canonical document boundary. A stalled platform clipboard query must never
  // prevent the editor from mounting, opening a note, or accepting Rust-owned
  // input. Keep the refresh ordered after the reset without chaining it into the
  // readiness promise consumed by the editor lifecycle and automation bridge.
  void canonicalReady.then(
    () => Promise.resolve()
      .then(() => refreshClipboard())
      .catch(reportClipboardError),
    () => {}
  )

  return canonicalReady
}

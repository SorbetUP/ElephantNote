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

  const runReset = () => Promise.resolve(previousReady).then(() => reset())
  const canonicalReady = runReset().catch(async(error) => {
    // A WebKit mount can publish the mirror object one microtask before the
    // native session created by its initial reset is observable to the next
    // canonical reset. Preserve the production reset and retry it once after the
    // current task has yielded. Any persistent or different error still rejects
    // the canonical readiness barrier and fails every caller unchanged.
    if (error?.message !== 'Rust Muya session is not initialized.') throw error
    await new Promise((resolve) => setTimeout(resolve, 0))
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

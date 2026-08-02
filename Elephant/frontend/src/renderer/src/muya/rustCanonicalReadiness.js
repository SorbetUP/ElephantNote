export const createRustCanonicalReadiness = ({
  previousReady,
  reset,
  refreshClipboard,
  reportClipboardError = () => {}
}) => {
  const hasInitializedSessionBarrier = previousReady != null
  const runReset = () => Promise.resolve(previousReady).then(() => reset())
  const canonicalReady = runReset().catch(async(error) => {
    // A WebKit mount can publish the mirror object one microtask before the
    // native session created by its initial reset is observable to the next
    // canonical reset. This is a real lifecycle race, not an acceptable proof
    // failure: preserve the same production reset and retry it once after the
    // current task has yielded. Any persistent or different error still rejects
    // the canonical readiness barrier and fails every caller unchanged.
    if (error?.message !== 'Rust Muya session is not initialized.') throw error
    await new Promise((resolve) => setTimeout(resolve, 0))
    return reset()
  })

  // Muya calls the most-derived setMarkdown implementation from its base
  // constructor. During that bootstrap pass the Rust mirror has not exposed an
  // initialization barrier yet. The reset may safely join the mirror queue once
  // the constructor stack unwinds, but a clipboard query must not run from that
  // unchained pass: query commands require an already initialized session and
  // would mark an otherwise healthy editor as crashed before mount readiness.
  // Every normal constructor/remount call supplies the mirror or prior canonical
  // barrier, so clipboard metadata is refreshed after those real lifecycle
  // boundaries only.
  if (hasInitializedSessionBarrier) {
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
  }

  return canonicalReady
}

export const createRustCanonicalReadiness = ({
  previousReady,
  reset,
  refreshClipboard,
  reportClipboardError = () => {}
}) => {
  const hasInitializedSessionBarrier = previousReady != null
  const canonicalReady = Promise.resolve(previousReady).then(() => reset())

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

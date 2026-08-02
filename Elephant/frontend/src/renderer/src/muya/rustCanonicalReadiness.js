export const createRustCanonicalReadiness = ({
  previousReady,
  reset,
  refreshClipboard,
  reportClipboardError = () => {}
}) => {
  const canonicalReady = Promise.resolve(previousReady).then(() => reset())

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

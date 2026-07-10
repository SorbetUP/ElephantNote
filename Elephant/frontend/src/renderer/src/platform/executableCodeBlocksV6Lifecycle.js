const HOSTS = '[data-code-block], [data-role="code-block"], [data-type="code-block"], .ag-code-block, .code-block'

const removedCodeHost = (node) => {
  if (node?.nodeType !== 1) return false
  if (node.matches?.(HOSTS) && node.querySelector?.('pre code')) return true
  return Boolean(node.querySelector?.(`${HOSTS} pre code`))
}

export const installExecutableCodeBlocksV6Lifecycle = (runtime) => {
  if (!runtime || runtime.__v6LifecycleInstalled) return runtime
  runtime.__v6LifecycleInstalled = true

  const originalScheduleScan = runtime.scheduleScan.bind(runtime)
  runtime.scheduleScan = (reason = 'mutation') => {
    if (reason === 'dom-content-loaded' && runtime.metrics.scans > 0) return
    return originalScheduleScan(reason)
  }

  const deletionObserver = new MutationObserver((records) => {
    const removed = records.some((record) =>
      [...record.removedNodes].some(removedCodeHost))
    if (removed) runtime.scheduleScan('code-host-removed')
  })
  deletionObserver.observe(document.documentElement || document.body, {
    subtree: true,
    childList: true
  })

  const originalDispose = runtime.dispose.bind(runtime)
  runtime.dispose = () => {
    deletionObserver.disconnect()
    originalDispose()
  }

  return runtime
}

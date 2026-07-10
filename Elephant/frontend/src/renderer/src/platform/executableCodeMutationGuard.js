const RUNTIME_CLASS_PREFIX = 'en-code-v4-'

const semanticClassName = (target) => [...(target?.classList || [])]
  .filter((className) => !className.startsWith(RUNTIME_CLASS_PREFIX))
  .sort()
  .join(' ')

export const installWithCodeMutationGuard = (target, install) => {
  const NativeMutationObserver = target?.MutationObserver || globalThis.MutationObserver
  if (typeof NativeMutationObserver !== 'function') return install(target)

  const semanticClasses = new WeakMap()

  class CodeMutationObserver {
    constructor(callback) {
      this.observer = new NativeMutationObserver((records, observer) => {
        const filtered = records.filter((record) => {
          if (record.type !== 'attributes' || record.attributeName !== 'class') return true
          const current = semanticClassName(record.target)
          const previous = semanticClasses.get(record.target)
          semanticClasses.set(record.target, current)
          return previous === undefined || previous !== current
        })
        if (filtered.length) callback(filtered, observer)
      })
    }

    observe(targetNode, options) {
      this.observer.observe(targetNode, options)
    }

    disconnect() {
      this.observer.disconnect()
    }

    takeRecords() {
      return this.observer.takeRecords()
    }
  }

  const globalTarget = globalThis
  const previousGlobal = globalTarget.MutationObserver
  const previousTarget = target?.MutationObserver
  globalTarget.MutationObserver = CodeMutationObserver
  if (target && target !== globalTarget) target.MutationObserver = CodeMutationObserver
  try {
    return install(target)
  } finally {
    globalTarget.MutationObserver = previousGlobal
    if (target && target !== globalTarget) target.MutationObserver = previousTarget
  }
}

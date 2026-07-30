const BLOCK_SELECTOR = '[data-elephant-editor-layer="block"][data-elephant-editor-kind]'
const SEMANTIC_ATTRIBUTE_FILTER = [
  'data-elephant-editor-layer',
  'data-elephant-editor-kind',
  'data-elephant-editor-node',
  'data-language'
]

const blockDescriptor = (element) => Object.freeze({
  nodeId: Number(element.getAttribute('data-elephant-editor-node')) || null,
  kind: element.getAttribute('data-elephant-editor-kind') || '',
  language: element.getAttribute('data-language') || '',
  element
})

const microtask = (root, callback) => {
  const windowRef = root?.ownerDocument?.defaultView
  if (typeof windowRef?.queueMicrotask === 'function') {
    windowRef.queueMicrotask(callback)
    return
  }
  if (typeof globalThis.queueMicrotask === 'function') {
    globalThis.queueMicrotask(callback)
    return
  }
  Promise.resolve().then(callback)
}

const containsSemanticBlock = (node) => node?.nodeType === 1 && Boolean(
  node.matches?.(BLOCK_SELECTOR) || node.querySelector?.(BLOCK_SELECTOR)
)

const changesSemanticBlockStructure = (mutation) => {
  if (mutation.type === 'attributes') return true
  return [...mutation.addedNodes, ...mutation.removedNodes].some(containsSemanticBlock)
}

export const createRustEditorRuntimeBinding = ({ runtime, getMarkdown = () => '' } = {}) => {
  if (!runtime?.bridge || typeof runtime.bridge.dispatch !== 'function') {
    throw new TypeError('A live Rust editor runtime is required')
  }

  const listeners = new Set()
  const root = runtime.domContainer || null
  const elementIds = new WeakMap()
  let nextElementId = 1
  let disposed = false
  let observer = null
  let domNotificationQueued = false

  const semanticElements = () => root?.querySelectorAll ? [...root.querySelectorAll(BLOCK_SELECTOR)] : []
  const elementId = (element) => {
    if (!elementIds.has(element)) elementIds.set(element, nextElementId++)
    return elementIds.get(element)
  }
  const semanticSignature = () => semanticElements()
    .map((element) => [
      elementId(element),
      element.getAttribute('data-elephant-editor-node') || '',
      element.getAttribute('data-elephant-editor-kind') || '',
      element.getAttribute('data-language') || ''
    ].join(':'))
    .join('|')

  let lastSemanticSignature = semanticSignature()

  const payload = (detail = {}) => Object.freeze({
    engine: 'rust',
    markdown: String(detail.markdown ?? getMarkdown() ?? ''),
    revision: runtime.bridge.revision,
    selection: runtime.bridge.selection,
    root,
    ...detail
  })

  const notify = (detail = {}) => {
    if (disposed) return
    const event = payload(detail)
    for (const listener of [...listeners]) listener(event)
  }

  const scheduleSemanticDomNotification = () => {
    if (disposed || domNotificationQueued) return
    domNotificationQueued = true
    microtask(root, () => {
      domNotificationQueued = false
      if (disposed) return
      const nextSignature = semanticSignature()
      if (nextSignature === lastSemanticSignature) return
      lastSemanticSignature = nextSignature
      notify({ reason: 'dom-change' })
    })
  }

  const MutationObserverConstructor = root?.ownerDocument?.defaultView?.MutationObserver || globalThis.MutationObserver
  if (root?.querySelectorAll && typeof MutationObserverConstructor === 'function') {
    observer = new MutationObserverConstructor((mutations) => {
      if (mutations.some(changesSemanticBlockStructure)) scheduleSemanticDomNotification()
    })
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: SEMANTIC_ATTRIBUTE_FILTER
    })
  }

  const resource = Object.freeze({
    apiVersion: 1,
    owner: 'elephant.core.editor',
    engine: 'rust',
    root,
    getMarkdown: () => String(getMarkdown() ?? ''),
    snapshot: () => runtime.bridge.snapshot(),
    dispatch: (command) => runtime.bridge.dispatch(command),
    queryBlocks(options = {}) {
      const kind = typeof options === 'string' ? options : String(options.kind || '')
      const language = typeof options === 'object' ? String(options.language || '') : ''
      return semanticElements()
        .filter((element) => !kind || element.getAttribute('data-elephant-editor-kind') === kind)
        .filter((element) => !language || element.getAttribute('data-language') === language)
        .map(blockDescriptor)
    },
    watch(listener, options = {}) {
      if (typeof listener !== 'function') {
        throw new TypeError('Editor runtime listener must be a function')
      }
      listeners.add(listener)
      if (options.immediate !== false) listener(payload({ reason: 'attached' }))
      return () => listeners.delete(listener)
    }
  })

  return Object.freeze({
    resource,
    notify,
    dispose() {
      disposed = true
      observer?.disconnect()
      observer = null
      domNotificationQueued = false
      listeners.clear()
    }
  })
}

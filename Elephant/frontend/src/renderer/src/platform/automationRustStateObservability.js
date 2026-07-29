const PROPERTY = '__ELEPHANT_ACCEPTANCE_TEST__'
const PATCH_FLAG = '__elephantRustStateObservabilityInstalled'

const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Number(value)
  : fallback

const rustStateSnapshot = (target, baseState = {}) => {
  const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__ || null
  const published = target.__ELEPHANT_MUYA_RUST_MIRROR__ || null
  const canonical = activeMuya?.__rustMirror?.state || null
  const pending = finiteNumber(activeMuya?.__rustMutationGate?.pending)
  const phase = published?.phase || (canonical ? 'ready' : activeMuya ? 'mounting' : 'inactive')
  const notePath = baseState?.notePath || null
  const canonicalMarkdown = typeof canonical?.markdown === 'string' ? canonical.markdown : null

  return {
    ...baseState,
    activeFile: notePath
      ? {
          path: notePath,
          markdownLength: String(baseState?.markdown || '').length,
          isSaved: baseState?.isSaved !== false
        }
      : null,
    editorRuntime: {
      engine: activeMuya ? 'rust' : null,
      active: Boolean(activeMuya),
      contentEditable: activeMuya?.container?.getAttribute?.('contenteditable') || null,
      pendingMutations: pending
    },
    rustMirror: {
      active: Boolean(activeMuya),
      phase,
      error: published?.error || canonical?.error || null,
      revision: finiteNumber(published?.revision, finiteNumber(canonical?.revision)),
      markdownLength: finiteNumber(
        published?.markdownLength,
        canonicalMarkdown === null ? 0 : canonicalMarkdown.length
      ),
      canonicalRevision: finiteNumber(canonical?.revision),
      canonicalMarkdownLength: canonicalMarkdown === null ? 0 : canonicalMarkdown.length,
      pending
    }
  }
}

const enhance = (target, api) => {
  if (!api || typeof api !== 'object' || api[PATCH_FLAG] === true) return api
  if (typeof api.readState !== 'function') return api

  const originalReadState = api.readState.bind(api)
  api.readState = (...args) => rustStateSnapshot(target, originalReadState(...args))
  Object.defineProperty(api, PATCH_FLAG, {
    value: true,
    enumerable: false
  })
  return api
}

const install = (target = globalThis) => {
  const existing = target[PROPERTY]
  if (existing) enhance(target, existing)

  const descriptor = Object.getOwnPropertyDescriptor(target, PROPERTY)
  if (!descriptor?.configurable || typeof descriptor.set !== 'function') return

  Object.defineProperty(target, PROPERTY, {
    configurable: true,
    enumerable: descriptor.enumerable === true,
    get: descriptor.get,
    set(api) {
      descriptor.set.call(target, api)
      enhance(target, descriptor.get?.call(target) || api)
    }
  })
}

install()

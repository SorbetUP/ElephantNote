const PROPERTY = '__ELEPHANT_ACCEPTANCE_TEST__'
const PATCH_FLAG = '__elephantRustStateObservabilityInstalled'
const OPEN_NOTE_READY_TIMEOUT_MS = 15_000

const finiteNumber = (value, fallback = 0) => Number.isFinite(Number(value))
  ? Number(value)
  : fallback

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const activeContentEditable = (activeMuya) => {
  const container = activeMuya?.container || null
  if (!container) return null
  if (container.getAttribute?.('contenteditable') === 'true') return container
  return container.querySelector?.('[contenteditable="true"]') || null
}

const liveMuyaMarkdown = (activeMuya) => {
  if (typeof activeMuya?.getMarkdown !== 'function') return null
  try {
    return String(activeMuya.getMarkdown() ?? '')
  } catch {
    return null
  }
}

const rustStateSnapshot = (target, baseState = {}) => {
  const activeMuya = target.__ELEPHANT_ACTIVE_MUYA__ || null
  const published = target.__ELEPHANT_MUYA_RUST_MIRROR__ || null
  const canonical = activeMuya?.__rustMirror?.state || null
  const editable = activeContentEditable(activeMuya)
  const pending = finiteNumber(activeMuya?.__rustMutationGate?.pending)
  const canonicalMarkdown = typeof canonical?.markdown === 'string' ? canonical.markdown : null
  const renderedMarkdown = liveMuyaMarkdown(activeMuya)
  const canonicalRevision = finiteNumber(canonical?.revision)
  const publishedRevision = finiteNumber(published?.revision)
  const publishedMarkdownLength = finiteNumber(published?.markdownLength)
  const canonicalMarkdownLength = canonicalMarkdown === null ? 0 : canonicalMarkdown.length
  const renderedMatchesCanonical = canonicalMarkdown !== null && renderedMarkdown === canonicalMarkdown
  const canonicalReady = Boolean(
    activeMuya &&
    canonical &&
    !canonical?.error &&
    pending === 0 &&
    editable?.isConnected === true &&
    renderedMatchesCanonical
  )
  const phase = published?.phase === 'error' || canonical?.error
    ? 'error'
    : canonicalReady
      ? 'ready'
      : activeMuya
        ? 'mounting'
        : 'inactive'
  const notePath = baseState?.notePath || null

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
      contentEditable: editable?.getAttribute?.('contenteditable') || null,
      contentEditableConnected: editable?.isConnected === true,
      pendingMutations: pending
    },
    rustMirror: {
      active: Boolean(activeMuya),
      phase,
      error: published?.error || canonical?.error || null,
      revision: publishedRevision,
      markdownLength: publishedMarkdownLength,
      canonicalRevision,
      canonicalMarkdownLength,
      renderedMarkdownLength: renderedMarkdown === null ? 0 : renderedMarkdown.length,
      renderedMatchesCanonical,
      pending
    }
  }
}

const isVisibleSurface = (target, element) => {
  if (!element || element.isConnected === false || element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false
  const style = target.getComputedStyle?.(element) || element.ownerDocument?.defaultView?.getComputedStyle?.(element)
  return style?.display !== 'none' && style?.visibility !== 'hidden'
}

const visibleRustEditorSurface = (target) => {
  const activeContainer = target.__ELEPHANT_ACTIVE_MUYA__?.container
  if (isVisibleSurface(target, activeContainer)) return activeContainer

  const candidates = target.document?.querySelectorAll?.(
    '[data-testid="muya-rust-runtime-editor"], .muya-rust-runtime-editor, [data-muya-editor="true"], .muya-editor, .en-editor-host'
  ) || []
  return [...candidates].find((element) => isVisibleSurface(target, element)) || null
}

const renderedMuyaMarkdown = (target) => liveMuyaMarkdown(target.__ELEPHANT_ACTIVE_MUYA__)

const waitForOpenedRustEditor = async(target, readBaseState, expectedPath) => {
  const deadline = Date.now() + OPEN_NOTE_READY_TIMEOUT_MS
  let last = null

  while (Date.now() <= deadline) {
    last = rustStateSnapshot(target, readBaseState())
    const activePath = String(last?.activeFile?.path || '')
    const expectedActive = activePath === expectedPath || activePath.endsWith(`/${expectedPath}`)
    if (
      expectedActive &&
      last?.editorRuntime?.active === true &&
      last?.editorRuntime?.contentEditable === 'true' &&
      last?.editorRuntime?.contentEditableConnected === true &&
      last?.rustMirror?.active === true &&
      last?.rustMirror?.phase === 'ready' &&
      last?.rustMirror?.renderedMatchesCanonical === true &&
      !last?.rustMirror?.error &&
      last?.rustMirror?.pending === 0
    ) return last

    await wait(25)
  }

  throw new Error(`Opened note did not reach a canonical Rust-ready editor: ${JSON.stringify({
    expectedPath,
    activeFile: last?.activeFile || null,
    editorRuntime: last?.editorRuntime || null,
    rustMirror: last?.rustMirror || null
  })}`)
}

const enhance = (target, api) => {
  if (!api || typeof api !== 'object' || api[PATCH_FLAG] === true) return api
  if (typeof api.readState !== 'function') return api

  const originalReadState = api.readState.bind(api)
  api.readState = (...args) => rustStateSnapshot(target, originalReadState(...args))

  if (typeof api.readDisplayed === 'function') {
    const originalReadDisplayed = api.readDisplayed.bind(api)
    api.readDisplayed = (...args) => {
      const baseState = originalReadDisplayed(...args)
      const surface = visibleRustEditorSurface(target)
      if (!surface) return baseState
      const surfaceText = surface.innerText || surface.textContent || ''
      const renderedMarkdown = renderedMuyaMarkdown(target)
      return {
        ...baseState,
        // WebKit can report only the contenteditable sentinel/newline through
        // innerText while the same visible Muya ContentState contains the full
        // document. Expose the live Muya serialization as the displayed text and
        // retain the raw DOM text separately so the proof cannot hide that fact.
        displayedText: renderedMarkdown === null ? surfaceText : renderedMarkdown,
        displayedSurfaceText: surfaceText,
        displayedHtml: surface.innerHTML || '',
        displayedSource: renderedMarkdown === null ? 'dom-text' : 'muya-content-state'
      }
    }
  }

  if (typeof api.openNote === 'function') {
    const originalOpenNote = api.openNote.bind(api)
    api.openNote = async(path, ...args) => {
      await originalOpenNote(path, ...args)
      return waitForOpenedRustEditor(target, originalReadState, String(path || ''))
    }
  }

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

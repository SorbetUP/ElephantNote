const INSTALL_FLAG = '__elephantCanonicalInputSurfaceInstalled'
const TEST_ID = 'muya-rust-runtime-editor'
const HOST_ATTRIBUTE = 'data-elephant-rust-editor-host'
const SURFACE_ATTRIBUTE = 'data-elephant-rust-input-surface'
const POLL_MS = 20
const INSTALL_ATTEMPTS = 3000

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const automationApi = (target) => target.__ELEPHANT_ACCEPTANCE_TEST__ || target.__ELEPHANT_AUTOMATION__

const canonicalInputSurface = (target) => {
  const surface = target.__ELEPHANT_ACTIVE_MUYA__?.container
  if (!surface?.isConnected) return null
  if (surface.getAttribute?.('contenteditable') !== 'true' && surface.isContentEditable !== true) return null
  return surface
}

export const publishCanonicalInputSurface = (target = globalThis) => {
  if (!automationApi(target)) return false

  const surface = canonicalInputSurface(target)
  if (!surface) return false

  let changed = false
  const selector = `[data-testid="${TEST_ID}"]`
  for (const candidate of target.document?.querySelectorAll?.(selector) || []) {
    if (candidate === surface) continue
    candidate.removeAttribute('data-testid')
    candidate.setAttribute(HOST_ATTRIBUTE, 'true')
    changed = true
  }

  if (surface.getAttribute('data-testid') !== TEST_ID) {
    surface.setAttribute('data-testid', TEST_ID)
    changed = true
  }
  if (surface.getAttribute(SURFACE_ATTRIBUTE) !== 'true') {
    surface.setAttribute(SURFACE_ATTRIBUTE, 'true')
    changed = true
  }

  if (changed) {
    console.info('[automation-api] published canonical Rust input surface', {
      contentEditable: surface.getAttribute('contenteditable'),
      connected: surface.isConnected,
      revision: Number(target.__ELEPHANT_ACTIVE_MUYA__?.__rustMirror?.state?.revision || 0)
    })
  }
  return true
}

const install = (target = globalThis) => {
  if (target[INSTALL_FLAG] === true) return true
  if (!automationApi(target)) return false

  const refresh = () => publishCanonicalInputSurface(target)
  const observer = typeof target.MutationObserver === 'function'
    ? new target.MutationObserver(refresh)
    : null
  observer?.observe(target.document?.documentElement, {
    childList: true,
    subtree: true
  })
  const timer = target.setInterval(refresh, 50)

  const dispose = () => {
    observer?.disconnect()
    target.clearInterval(timer)
  }
  target.addEventListener?.('beforeunload', dispose, { once: true })

  Object.defineProperty(target, INSTALL_FLAG, {
    configurable: true,
    enumerable: false,
    value: true
  })
  refresh()
  console.info('[automation-api] canonical Rust input surface publisher installed')
  return true
}

const installWhenReady = async(target = globalThis) => {
  for (let attempt = 0; attempt < INSTALL_ATTEMPTS; attempt += 1) {
    if (install(target)) return true
    await wait(POLL_MS)
  }
  console.error('[automation-api] canonical Rust input surface publisher was not installed')
  return false
}

const invoke = globalThis.__TAURI__?.core?.invoke
if (typeof invoke === 'function') {
  void invoke('tauri_acceptance_enabled')
    .then((enabled) => enabled === true ? installWhenReady() : false)
    .catch((error) => {
      console.error('[automation-api] canonical input surface enablement check failed', error)
    })
}

export { install as installCanonicalInputSurfacePublisher }

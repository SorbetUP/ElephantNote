let seed = 1

const seededRandom = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0
  return seed / 0x100000000
}

const rect = Object.freeze({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON() {
    return this
  }
})

export const installDeterministicBrowser = (scenarioSeed = 1) => {
  seed = scenarioSeed
  Math.random = seededRandom
  window.DIRNAME = '/characterization-vault'

  Object.defineProperty(window.navigator, 'deviceMemory', {
    configurable: true,
    value: 8
  })
  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: 'MacIntel'
  })

  window.matchMedia = window.matchMedia || (() => ({
    matches: false,
    media: '',
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false }
  }))

  globalThis.ResizeObserver = globalThis.ResizeObserver || class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.IntersectionObserver = globalThis.IntersectionObserver || class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return [] }
  }

  window.requestAnimationFrame = (callback) => setTimeout(() => callback(0), 0)
  window.cancelAnimationFrame = (id) => clearTimeout(id)
  globalThis.requestAnimationFrame = window.requestAnimationFrame
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame

  window.scrollTo = () => {}
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.getBoundingClientRect = () => rect
  Range.prototype.getBoundingClientRect = () => rect
  Range.prototype.getClientRects = () => []

  if (globalThis.SVGElement) {
    SVGElement.prototype.getBBox = () => rect
    SVGElement.prototype.getComputedTextLength = () => 0
    SVGElement.prototype.getCTM = () => null
    SVGElement.prototype.getScreenCTM = () => null
  }

  for (const property of ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight']) {
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get: () => 0
    })
  }

  document.execCommand = () => true
  document.queryCommandSupported = () => true
  document.queryCommandState = () => false

  if (!globalThis.CSS) globalThis.CSS = {}
  if (!globalThis.CSS.escape) {
    globalThis.CSS.escape = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&')
  }

  if (!URL.createObjectURL) URL.createObjectURL = () => 'blob:muya-characterization'
  if (!URL.revokeObjectURL) URL.revokeObjectURL = () => {}

  document.body.innerHTML = '<main id="characterization-root"></main>'
  document.documentElement.removeAttribute('style')
}

export const settle = async() => {
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

export const createMount = () => {
  const host = document.getElementById('characterization-root')
  const mount = document.createElement('div')
  mount.className = 'editor-component'
  host.appendChild(mount)
  return mount
}

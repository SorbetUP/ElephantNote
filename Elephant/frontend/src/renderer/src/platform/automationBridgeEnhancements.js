const DEFAULT_NODE_LIMIT = 250
const DEFAULT_TEXT_LIMIT = 2000
const DEFAULT_LOG_LIMIT = 500

const boundedText = (value, limit = DEFAULT_TEXT_LIMIT) => {
  const text = String(value || '')
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 3))}...` : text
}

const isVisible = (target, element) => {
  if (!element || element.hidden || element.getAttribute?.('aria-hidden') === 'true') return false
  const style = target.getComputedStyle?.(element)
  if (style?.display === 'none' || style?.visibility === 'hidden' || style?.opacity === '0') return false
  return typeof element.getClientRects !== 'function' || element.getClientRects().length > 0
}

const attributesOf = (element) => {
  const attributes = {}
  for (const attribute of element?.attributes || []) {
    if (/^(style|srcdoc)$/i.test(attribute.name)) continue
    attributes[attribute.name] = boundedText(attribute.value, 500)
  }
  return attributes
}

const accessibleName = (element) => boundedText(
  element?.getAttribute?.('aria-label') ||
  element?.getAttribute?.('title') ||
  element?.getAttribute?.('alt') ||
  element?.getAttribute?.('placeholder') ||
  element?.innerText ||
  element?.textContent || '',
  500
).trim()

const elementSnapshot = (target, element, selector = '') => {
  if (!element) return { selector, exists: false, visible: false }
  const rect = element.getBoundingClientRect?.() || {}
  const style = target.getComputedStyle?.(element)
  return {
    selector,
    exists: true,
    visible: isVisible(target, element),
    tag: String(element.tagName || '').toLowerCase(),
    role: element.getAttribute?.('role') || null,
    name: accessibleName(element),
    text: boundedText(element.innerText || element.textContent || ''),
    value: 'value' in element ? boundedText(element.value, 2000) : null,
    checked: 'checked' in element ? Boolean(element.checked) : null,
    disabled: 'disabled' in element ? Boolean(element.disabled) : null,
    attributes: attributesOf(element),
    bounds: {
      x: Number(rect.x || 0),
      y: Number(rect.y || 0),
      width: Number(rect.width || 0),
      height: Number(rect.height || 0)
    },
    style: style
      ? {
          display: style.display,
          visibility: style.visibility,
          opacity: style.opacity,
          position: style.position,
          overflow: style.overflow
        }
      : null
  }
}

const semanticSelector = [
  'button', 'a[href]', 'input', 'textarea', 'select', 'option',
  '[role]', '[aria-label]', '[data-testid]', '[contenteditable="true"]',
  'h1', 'h2', 'h3', 'h4', 'nav', 'main', 'aside', 'dialog', '[role="alert"]'
].join(',')

const normalizedLogLevel = (entry) => String(entry?.level || entry?.severity || '').toLowerCase()
const logText = (entry) => JSON.stringify(entry)

export const enhanceAutomationApi = ({ target = globalThis, api } = {}) => {
  if (!api || typeof api !== 'object') throw new TypeError('enhanceAutomationApi requires an API object')

  api.queryAll = (selector, limit = DEFAULT_NODE_LIMIT) => {
    if (!selector || typeof selector !== 'string') throw new TypeError('queryAll requires a CSS selector')
    const cappedLimit = Math.max(1, Math.min(2000, Number(limit) || DEFAULT_NODE_LIMIT))
    return [...(target.document?.querySelectorAll?.(selector) || [])]
      .slice(0, cappedLimit)
      .map((element, index) => elementSnapshot(target, element, `${selector}:nth-match(${index + 1})`))
  }

  api.uiSnapshot = (selector = 'body', options = {}) => {
    if (!selector || typeof selector !== 'string') throw new TypeError('uiSnapshot requires a CSS selector')
    const root = target.document?.querySelector?.(selector)
    const nodeLimit = Math.max(1, Math.min(2000, Number(options?.nodeLimit) || DEFAULT_NODE_LIMIT))
    const includeHidden = options?.includeHidden === true
    const elements = root
      ? [...root.querySelectorAll(semanticSelector)]
        .filter((element) => includeHidden || isVisible(target, element))
        .slice(0, nodeLimit)
        .map((element, index) => elementSnapshot(target, element, `${selector} semantic[${index}]`))
      : []
    const active = target.document?.activeElement
    return {
      protocolVersion: 1,
      title: target.document?.title || '',
      url: target.location?.href || '',
      viewport: {
        width: Number(target.innerWidth || 0),
        height: Number(target.innerHeight || 0),
        devicePixelRatio: Number(target.devicePixelRatio || 1)
      },
      root: elementSnapshot(target, root, selector),
      activeElement: active && active !== target.document?.body
        ? elementSnapshot(target, active, ':active-element')
        : null,
      elements,
      truncated: Boolean(root && root.querySelectorAll(semanticSelector).length > nodeLimit)
    }
  }

  api.logs = (filter = {}) => {
    const source = Array.isArray(target.__ELEPHANT_DEBUG_LOGS__)
      ? target.__ELEPHANT_DEBUG_LOGS__
      : Array.isArray(target.__ELEPHANT_ACCEPTANCE_LOGS__)
        ? target.__ELEPHANT_ACCEPTANCE_LOGS__
        : []
    const level = String(filter?.level || '').toLowerCase()
    const contains = String(filter?.contains || '').toLowerCase()
    const since = Number(filter?.since || 0)
    const limit = Math.max(1, Math.min(5000, Number(filter?.limit) || DEFAULT_LOG_LIMIT))
    return source
      .map((entry, index) => ({ index, ...entry }))
      .filter((entry) => !since || entry.index >= since)
      .filter((entry) => !level || normalizedLogLevel(entry) === level)
      .filter((entry) => !contains || logText(entry).toLowerCase().includes(contains))
      .slice(-limit)
  }

  api.clearLogs = () => {
    const previousCount = Array.isArray(target.__ELEPHANT_DEBUG_LOGS__)
      ? target.__ELEPHANT_DEBUG_LOGS__.length
      : 0
    if (Array.isArray(target.__ELEPHANT_DEBUG_LOGS__)) target.__ELEPHANT_DEBUG_LOGS__.length = 0
    if (Array.isArray(target.__ELEPHANT_ACCEPTANCE_LOGS__)) target.__ELEPHANT_ACCEPTANCE_LOGS__.length = 0
    return { cleared: previousCount }
  }

  api.assertUi = (expectation = {}) => {
    const selector = expectation?.selector
    if (!selector || typeof selector !== 'string') throw new TypeError('assertUi requires expectation.selector')
    const state = elementSnapshot(target, target.document?.querySelector?.(selector), selector)
    const failures = []
    if (expectation.exists !== undefined && state.exists !== expectation.exists) failures.push(`exists expected ${expectation.exists}, received ${state.exists}`)
    if (expectation.visible !== undefined && state.visible !== expectation.visible) failures.push(`visible expected ${expectation.visible}, received ${state.visible}`)
    if (expectation.textIncludes !== undefined && !state.text.includes(String(expectation.textIncludes))) failures.push(`text does not include ${JSON.stringify(expectation.textIncludes)}`)
    if (expectation.textEquals !== undefined && state.text !== String(expectation.textEquals)) failures.push('text does not equal the expected value')
    for (const [name, expected] of Object.entries(expectation.attributes || {})) {
      if (state.attributes?.[name] !== String(expected)) failures.push(`attribute ${name} expected ${JSON.stringify(String(expected))}, received ${JSON.stringify(state.attributes?.[name])}`)
    }
    if (failures.length) throw new Error(`UI assertion failed for ${selector}: ${failures.join('; ')}`)
    return { ok: true, state }
  }

  api.assertLogs = (expectation = {}) => {
    const entries = api.logs(expectation)
    const minimum = Number(expectation?.minCount ?? 1)
    const maximum = expectation?.maxCount === undefined ? Infinity : Number(expectation.maxCount)
    if (entries.length < minimum || entries.length > maximum) {
      throw new Error(`Log assertion failed: expected ${minimum}..${maximum} matching entries, received ${entries.length}`)
    }
    return { ok: true, count: entries.length, entries }
  }

  return api
}

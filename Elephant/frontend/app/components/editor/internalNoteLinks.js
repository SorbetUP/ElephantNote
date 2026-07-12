const EXTERNAL_PROTOCOL_RE = /^(?:https?:|mailto:|tel:|data:|javascript:|file:)/i
const MARKDOWN_PATH_RE = /\.md$/i

const decodeComponent = (value = '') => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const normalizeVaultPath = (value = '') => {
  const parts = []
  for (const part of String(value || '').replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return ''
      parts.pop()
      continue
    }
    parts.push(part)
  }
  return parts.join('/')
}

const parentPath = (value = '') => {
  const normalized = normalizeVaultPath(value)
  const parts = normalized.split('/').filter(Boolean)
  parts.pop()
  return parts.join('/')
}

export const markdownAnchorSlug = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-+|-+$/g, '')

export const resolveInternalNoteLink = ({
  href = '',
  currentNotePath = '',
  appOrigin = globalThis.location?.origin || ''
} = {}) => {
  const raw = String(href || '').trim()
  const current = normalizeVaultPath(currentNotePath)
  if (!raw || !current) return null

  if (raw.startsWith('#')) {
    return { path: current, anchor: decodeComponent(raw.slice(1)) }
  }

  let pathPart = raw
  let anchor = ''
  let vaultRooted = false

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    if (EXTERNAL_PROTOCOL_RE.test(raw)) {
      let parsed
      try {
        parsed = new URL(raw)
      } catch {
        return null
      }
      if (!appOrigin || parsed.origin !== appOrigin) return null
      pathPart = parsed.pathname.replace(/^\/+/, '')
      anchor = decodeComponent(parsed.hash.replace(/^#/, ''))
      vaultRooted = true
    } else {
      return null
    }
  } else {
    const hashIndex = raw.indexOf('#')
    if (hashIndex >= 0) {
      anchor = decodeComponent(raw.slice(hashIndex + 1))
      pathPart = raw.slice(0, hashIndex)
    }
    pathPart = pathPart.split('?')[0]
    vaultRooted = pathPart.startsWith('/')
  }

  pathPart = decodeComponent(pathPart).replace(/\\/g, '/')
  if (!MARKDOWN_PATH_RE.test(pathPart)) return null

  const path = vaultRooted
    ? normalizeVaultPath(pathPart.replace(/^\/+/, ''))
    : normalizeVaultPath(`${parentPath(current)}/${pathPart}`)
  if (!path || !MARKDOWN_PATH_RE.test(path)) return null

  return { path, anchor }
}

const headingCandidates = () => [
  ...document.querySelectorAll('.en-editor-host h1, .en-editor-host h2, .en-editor-host h3, .en-editor-host h4, .en-editor-host h5, .en-editor-host h6, .en-editor-host [data-block-type="heading"]')
]

const scrollToAnchor = (anchor, attempt = 0) => {
  if (!anchor || attempt > 24) return
  const decoded = decodeComponent(anchor)
  const escaped = globalThis.CSS?.escape ? globalThis.CSS.escape(decoded) : decoded.replace(/["\\]/g, '\\$&')
  const exact = document.querySelector(`#${escaped}, [name="${escaped}"], [data-id="${escaped}"]`)
  const slug = markdownAnchorSlug(decoded)
  const target = exact || headingCandidates().find((element) => markdownAnchorSlug(element.textContent) === slug)
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  window.setTimeout(() => scrollToAnchor(anchor, attempt + 1), 60)
}

export const handleEditorInternalLinkClick = (event, store) => {
  if (!event || event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return false
  const anchorElement = event.target?.closest?.('a[href]')
  if (!anchorElement) return false
  const resolved = resolveInternalNoteLink({
    href: anchorElement.getAttribute('href') || anchorElement.href,
    currentNotePath: store?.openedNotePath || '',
    appOrigin: globalThis.location?.origin || ''
  })
  if (!resolved) return false

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation?.()

  if (resolved.path !== store.openedNotePath) {
    store.openNote({
      path: resolved.path,
      title: resolved.path.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled',
      kind: 'note',
      type: 'note'
    })
  }
  if (resolved.anchor) scrollToAnchor(resolved.anchor)
  return true
}

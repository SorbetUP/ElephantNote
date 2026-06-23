import { installGlobalMuyaRuntimeBridge } from '../muya/globalRuntimeBridge.js'

const normalizeSlashes = (value) => String(value || '').replace(/\/g, '/')

const createPathFacade = () => {
  const join = (...parts) => normalize(joinedPath(parts))
  const normalize = (pathname) => {
    const value = normalizeSlashes(pathname)
    if (!value) return '.'
    const isDrive = /^[a-zA-Z]:\//.test(value)
    const prefix = value.startsWith('//') ? '//' : isDrive ? value.slice(0, 3) : value.startsWith('/') ? '/' : ''
    const body = value.slice(prefix.length).replace(/\/+/g, '/').replace(/\/+$/, '')
    if (!body) return prefix || '.'
    return prefix ? `${prefix.replace(/\/$/, '')}/${body}`.replace(/\/+/g, '/') : body
  }
  const dirname = (pathname) => {
    const normalized = normalize(pathname)
    if (normalized === '/' || /^[a-zA-Z]:\/$/.test(normalized)) return normalized
    const index = normalized.lastIndexOf('/')
    return index > 0 ? normalized.slice(0, index) : '.'
  }
  const basename = (pathname, ext = '') => {
    const value = normalizeSlashes(pathname).replace(/\/+$/, '')
    const index = value.lastIndexOf('/')
    const base = index >= 0 ? value.slice(index + 1) : value
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base
  }
  const extname = (pathname) => {
    const base = basename(pathname)
    const index = base.lastIndexOf('.')
    return index > 0 ? base.slice(index) : ''
  }
  const resolve = (...parts) => normalize(joinedPath(parts, true))
  const relative = (from, to) => {
    const fromParts = normalize(from).split('/').filter(Boolean)
    const toParts = normalize(to).split('/').filter(Boolean)
    while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
      fromParts.shift()
      toParts.shift()
    }
    return [...fromParts.map(() => '..'), ...toParts].join('/') || ''
  }
  const joinWithAbsolute = (parts, resolveMode = false) => {
    const filtered = parts.filter((part) => part !== undefined && part !== null && part !== '')
    if (!filtered.length) return resolveMode ? '/' : '.'
    return normalize(filtered.map((part) => normalizeSlashes(part)).join('/'))
  }
  function joinedPath(parts, resolveMode = false) {
    return joinWithAbsolute(parts, resolveMode)
  }
  return {
    sep: '/',
    delimiter: ':',
    normalize,
    join,
    resolve,
    dirname,
    basename,
    extname,
    isAbsolute: (pathname) => {
      const value = normalizeSlashes(pathname)
      return value.startsWith('/') || /^([a-zA-Z]:\/)/.test(value) || value.startsWith('//')
    },
    relative
  }
}

const createFileUtilsFallback = () => ({
  __elephantnoteBootstrapFallback: true,
  isFile: () => false,
  isDirectory: () => false,
  emptyDir: async() => {},
  copy: async() => {},
  ensureDir: async() => {},
  outputFile: async() => {},
  move: async() => {},
  stat: async() => ({}),
  writeFile: async() => {},
  readFile: async() => '',
  ensureDirSync: () => {},
  pathExistsSync: () => false,
  isChildOfDirectory: () => false,
  hasMarkdownExtension: (filename) => /\.md$/i.test(String(filename || '')),
  MARKDOWN_INCLUSIONS: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdtxt'],
  isSamePathSync: (pathA, pathB) => normalizeSlashes(pathA) === normalizeSlashes(pathB),
  isImageFile: (filepath) => /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(String(filepath || ''))
})

const installBootstrapGlobals = (target = globalThis) => {
  if (!target.path) target.path = createPathFacade()
  if (!target.fileUtils && !target.__TAURI__) target.fileUtils = createFileUtilsFallback()
  if (target.fileUtils?.__elephantnoteBootstrapFallback && target.__TAURI__) delete target.fileUtils
  if (!target.rgPath) target.rgPath = ''
  if (!target.global) target.global = target
  installGlobalMuyaRuntimeBridge(target)
}

installBootstrapGlobals()

export default installBootstrapGlobals

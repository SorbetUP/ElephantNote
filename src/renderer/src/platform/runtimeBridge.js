import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { confirm as confirmDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { writeText as clipboardWriteText, readText as clipboardReadText } from '@tauri-apps/plugin-clipboard-manager'
import keybindingsDarwin from '../../../main/keyboard/keybindingsDarwin.js'
import keybindingsLinux from '../../../main/keyboard/keybindingsLinux.js'
import keybindingsWindows from '../../../main/keyboard/keybindingsWindows.js'

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/')

const isAbsolute = (pathname) => {
  const value = normalizeSlashes(pathname)
  return (
    value.startsWith('/') ||
    /^([a-zA-Z]:\/)/.test(value) ||
    value.startsWith('//')
  )
}

const splitSegments = (pathname) => {
  const value = normalizeSlashes(pathname)
  const prefix = value.startsWith('//') ? '//' : value.match(/^([a-zA-Z]:\/)/)?.[1] || '/'
  const body = value.slice(prefix === '//' ? 2 : prefix.length).replace(/\/+/g, '/')
  const segments = body.split('/').filter((segment) => segment && segment !== '.')
  const resolved = []
  for (const segment of segments) {
    if (segment === '..') {
      if (resolved.length && resolved[resolved.length - 1] !== '..') {
        resolved.pop()
      } else if (!isAbsolute(prefix)) {
        resolved.push(segment)
      }
      continue
    }
    resolved.push(segment)
  }
  return { prefix, segments: resolved }
}

export const createPathFacade = () => {
  const join = (...parts) => normalize(joinedPath(parts))
  const normalize = (pathname) => {
    const value = normalizeSlashes(pathname)
    if (!value) return '.'
    const { prefix, segments } = splitSegments(value)
    const body = segments.join('/')
    if (!body) return prefix === '/' ? '/' : prefix || '.'
    return prefix === '/' || prefix === '//' || /^[a-zA-Z]:\/$/.test(prefix)
      ? `${prefix.replace(/\/$/, '')}/${body}`.replace(/\/+/g, '/')
      : body
  }
  const dirname = (pathname) => {
    const value = normalizeSlashes(pathname)
    if (!value) return '.'
    const normalized = normalize(value)
    if (normalized === '/' || /^[a-zA-Z]:\/$/.test(normalized)) return normalized
    const index = normalized.lastIndexOf('/')
    if (index <= 0) return isAbsolute(normalized) ? '/' : '.'
    return normalized.slice(0, index)
  }
  const basename = (pathname, ext = '') => {
    const value = normalizeSlashes(pathname)
    if (!value) return ''
    const normalized = value.replace(/\/+$/, '')
    const index = normalized.lastIndexOf('/')
    const base = index >= 0 ? normalized.slice(index + 1) : normalized
    return ext && base.endsWith(ext) ? base.slice(0, -ext.length) : base
  }
  const extname = (pathname) => {
    const base = basename(pathname)
    const index = base.lastIndexOf('.')
    return index > 0 ? base.slice(index) : ''
  }
  const resolve = (...parts) => normalize(joinedPath(parts, true))
  const relative = (from, to) => {
    const fromParts = splitSegments(resolve(from)).segments
    const toParts = splitSegments(resolve(to)).segments
    while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) {
      fromParts.shift()
      toParts.shift()
    }
    return [...fromParts.map(() => '..'), ...toParts].join('/') || ''
  }
  const joinWithAbsolute = (parts, resolveMode = false) => {
    const filtered = parts.filter((part) => part !== undefined && part !== null && part !== '')
    if (!filtered.length) return resolveMode ? '/' : '.'
    const resolved = filtered.map((part) => normalizeSlashes(part))
    const merged = resolved.join('/')
    return normalize(merged)
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
    isAbsolute,
    relative
  }
}

const createEventBus = (target = globalThis) => {
  const listeners = new Map()
  const add = (eventName, handler, once = false) => {
    const wrapped = (event) => {
      if (once) remove(eventName, handler)
      const detail = Array.isArray(event?.detail) ? event.detail : [event?.detail]
      handler?.({ error: event?.detail?.error || null }, ...detail)
    }
    const eventListeners = listeners.get(eventName) || new Map()
    eventListeners.set(handler, wrapped)
    listeners.set(eventName, eventListeners)
    target.addEventListener(eventName, wrapped)
    return () => remove(eventName, handler)
  }
  const remove = (eventName, handler) => {
    const eventListeners = listeners.get(eventName)
    const wrapped = eventListeners?.get(handler)
    if (!wrapped) return
    target.removeEventListener(eventName, wrapped)
    eventListeners.delete(handler)
    if (!eventListeners.size) listeners.delete(eventName)
  }
  const removeAll = (eventName) => {
    const eventListeners = listeners.get(eventName)
    if (!eventListeners) return
    for (const wrapped of eventListeners.values()) {
      target.removeEventListener(eventName, wrapped)
    }
    listeners.delete(eventName)
  }
  const send = (eventName, ...args) => {
    target.dispatchEvent(new CustomEvent(eventName, { detail: args }))
  }
  return {
    send,
    on: (eventName, handler) => add(eventName, handler, false),
    once: (eventName, handler) => add(eventName, handler, true),
    removeListener: remove,
    removeAllListeners: removeAll,
    invoke: async(channel, payload) => {
      const handler = listeners.get(`invoke:${channel}`)?.values()?.next()?.value
      if (handler) return handler({ detail: payload }, payload)
      if (channel === 'update-buffer-state') return true
      throw new Error(`No invoke handler registered for "${channel}"`)
    }
  }
}

const createShellFallback = () => ({
  openExternal: async(url) => {
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  openPath: async(pathname) => {
    window.open(`file://${pathname}`, '_blank', 'noopener,noreferrer')
  },
  showItemInFolder: async(pathname) => {
    window.open(`file://${pathname}`, '_blank', 'noopener,noreferrer')
  }
})

const createClipboardFallback = () => ({
  writeText: async(text) => navigator.clipboard?.writeText?.(text),
  readText: async() => navigator.clipboard?.readText?.()
})

const createWebUtilsFallback = () => ({
  getPathForFile: (file) => file?.path || file?.webkitRelativePath || file?.name || ''
})

const createCommandExistsFallback = () => ({
  exists: () => false
})

const STORAGE_PREFIX = 'elephantnote:tauri:'
const KEYBINDINGS_STORAGE_KEY = `${STORAGE_PREFIX}user-keybindings`
const SPELLCHECKER_STORAGE_KEY = `${STORAGE_PREFIX}spellchecker`
const USER_PREFS_STORAGE_KEY = `${STORAGE_PREFIX}preferences`
const USER_DATA_STORAGE_KEY = `${STORAGE_PREFIX}user-data`

export const installRuntimeBridge = (target = globalThis) => {
  const hasElectron = !!target?.electron?.ipcRenderer
  const hasTauri = !!target?.__TAURI__
  const markRuntime = (mode) => {
    target.__MARKTEXT_RUNTIME__ = mode
    return mode
  }
  if (!target.path) target.path = createPathFacade()
  if (!target.commandExists) target.commandExists = createCommandExistsFallback()
  if (!target.i18nUtils) target.i18nUtils = {}
  if (!target.elephantnote) target.elephantnote = {}

  if (hasElectron) {
    return { mode: markRuntime('electron'), installed: false }
  }

  const ipcRenderer = createEventBus(target)
  const shell = hasTauri
    ? {
        openExternal: async(url) => openUrl(url),
        openPath: async(pathname) => openPath(pathname),
        showItemInFolder: async(pathname) => revealItemInDir(pathname)
      }
    : createShellFallback()
  const clipboard = hasTauri
    ? { writeText: async(text) => clipboardWriteText(text), readText: async() => clipboardReadText() }
    : createClipboardFallback()
  const webUtils = createWebUtilsFallback()

  if (!target.fileUtils) {
    target.fileUtils = {
      isFile: () => false,
      isDirectory: () => false,
      ensureDirSync: () => {},
      pathExistsSync: () => false,
      isChildOfDirectory: () => false,
      hasMarkdownExtension: (filename) => /\.md$/i.test(String(filename || '')),
      MARKDOWN_INCLUSIONS: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdtxt'],
      isSamePathSync: (pathA, pathB) => normalizeSlashes(pathA) === normalizeSlashes(pathB),
      isImageFile: (filepath) => /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(String(filepath || ''))
    }
  }

  target.electron = {
    ipcRenderer,
    shell,
    clipboard,
    webUtils,
    process: {
      platform: target.navigator?.userAgentData?.platform || target.navigator?.platform || 'tauri',
      env: { MARKTEXT_VERSION_STRING: target.__MARKTEXT_VERSION_STRING__ || '' }
    }
  }

  return { mode: markRuntime(hasTauri ? 'tauri' : 'tauri-compatible'), installed: true }
}

export const createCompatibilitySurface = installRuntimeBridge

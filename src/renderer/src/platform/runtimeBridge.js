import { getCurrentWindow } from '@tauri-apps/api/window'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { confirm as confirmDialog, open as openDialog } from '@tauri-apps/plugin-dialog'
import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { writeText as clipboardWriteText, readText as clipboardReadText } from '@tauri-apps/plugin-clipboard-manager'
import keybindingsDarwin from '../../../main/keyboard/keybindingsDarwin.js'
import keybindingsLinux from '../../../main/keyboard/keybindingsLinux.js'
import keybindingsWindows from '../../../main/keyboard/keybindingsWindows.js'
import { pushDiagnosticLog } from './rendererDiagnostics'

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/')

const logBridge = (message, details = null) => {
  try {
    pushDiagnosticLog('debug', `runtimeBridge:${message}`, details)
  } catch {}
}

const summarizePayload = (payload) => {
  if (payload == null) return null
  if (typeof payload === 'string') return payload.length > 240 ? `${payload.slice(0, 240)}…` : payload
  if (Array.isArray(payload)) return { type: 'array', length: payload.length }
  if (typeof payload === 'object') {
    return Object.fromEntries(Object.entries(payload).slice(0, 12).map(([key, value]) => [
      key,
      typeof value === 'string' && value.length > 180 ? `${value.slice(0, 180)}…` : value
    ]))
  }
  return payload
}

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
  const body = value.slice(prefix === '//' ? 2 : prefix.length).replace(/\/+ /g, '/').replace(/\/+/g, '/')
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
    logBridge('ipc:on', { eventName, once })
    const wrapped = (event) => {
      if (once) remove(eventName, handler)
      const detail = Array.isArray(event?.detail) ? event.detail : [event?.detail]
      logBridge('ipc:event', { eventName, detail: detail.map(summarizePayload) })
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
    logBridge('ipc:removeListener', { eventName })
    target.removeEventListener(eventName, wrapped)
    eventListeners.delete(handler)
    if (!eventListeners.size) listeners.delete(eventName)
  }
  const removeAll = (eventName) => {
    const eventListeners = listeners.get(eventName)
    if (!eventListeners) return
    logBridge('ipc:removeAllListeners', { eventName })
    for (const wrapped of eventListeners.values()) {
      target.removeEventListener(eventName, wrapped)
    }
    listeners.delete(eventName)
  }
  const send = (eventName, ...args) => {
    logBridge('ipc:send', { eventName, args: args.map(summarizePayload) })
    target.dispatchEvent(new CustomEvent(eventName, { detail: args }))
  }
  return {
    send,
    on: (eventName, handler) => add(eventName, handler, false),
    once: (eventName, handler) => add(eventName, handler, true),
    removeListener: remove,
    removeAllListeners: removeAll,
    invoke: async(channel, payload) => {
      logBridge('ipc:invoke', { channel, payload: summarizePayload(payload) })
      const handler = listeners.get(`invoke:${channel}`)?.values()?.next()?.value
      if (handler) return handler({ detail: payload }, payload)
      if (channel === 'update-buffer-state') return true
      throw new Error(`No invoke handler registered for "${channel}"`)
    }
  }
}

const createShellFallback = () => ({
  openExternal: async(url) => {
    logBridge('shell:openExternal', { url })
    window.open(url, '_blank', 'noopener,noreferrer')
  },
  openPath: async(pathname) => {
    logBridge('shell:openPath', { pathname })
    window.open(`file://${pathname}`, '_blank', 'noopener,noreferrer')
  },
  showItemInFolder: async(pathname) => {
    logBridge('shell:showItemInFolder', { pathname })
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
const PANDOC_EXTENSIONS = new Set(['html', 'docx', 'odt', 'latex', 'tex', 'ltx', 'rst', 'rest', 'org', 'wiki', 'dokuwiki', 'textile', 'opml', 'epub'])
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'mdtxt', 'mdtext', 'mdx', 'text', 'txt'])

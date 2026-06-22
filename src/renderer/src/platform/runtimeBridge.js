import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openUrl, openPath, revealItemInDir } from '@tauri-apps/plugin-opener'
import { writeText as clipboardWriteText, readText as clipboardReadText } from '@tauri-apps/plugin-clipboard-manager'
import keybindingsDarwin from '../../../main/keyboard/keybindingsDarwin.js'
import keybindingsLinux from '../../../main/keyboard/keybindingsLinux.js'
import keybindingsWindows from '../../../main/keyboard/keybindingsWindows.js'
import { pushDiagnosticLog } from './rendererDiagnostics'

const normalizeSlashes = (value) => String(value || '').replace(/\\/g, '/')
const STORAGE_PREFIX = 'elephantnote:tauri:'
const USER_PREFS_STORAGE_KEY = `${STORAGE_PREFIX}preferences`
const USER_DATA_STORAGE_KEY = `${STORAGE_PREFIX}user-data`
const BUFFER_STORAGE_KEY = `${STORAGE_PREFIX}buffer-state`

const bridgeLog = (message, details = null) => {
  try { pushDiagnosticLog('debug', `runtimeBridge:${message}`, details) } catch {}
}

const summarize = (value) => {
  if (value == null) return null
  if (typeof value === 'string') return value.length > 240 ? `${value.slice(0, 240)}…` : value
  if (Array.isArray(value)) return { type: 'array', length: value.length }
  if (typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 12))
  return value
}

const readStoredJson = (target, key, fallback) => {
  try {
    const raw = target?.localStorage?.getItem(key) ?? target?.__TAURI_BRIDGE_STORAGE__?.get?.(key) ?? null
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch { return fallback }
}

const writeStoredJson = (target, key, value) => {
  try {
    const raw = JSON.stringify(value)
    if (!target.__TAURI_BRIDGE_STORAGE__) target.__TAURI_BRIDGE_STORAGE__ = new Map()
    target.__TAURI_BRIDGE_STORAGE__.set(key, raw)
    try { target?.localStorage?.setItem(key, raw) } catch {}
    return true
  } catch { return false }
}

const getStoredPreferences = (target) => readStoredJson(target, USER_PREFS_STORAGE_KEY, {})
const setStoredPreferences = (target, nextPrefs) => {
  const merged = { ...getStoredPreferences(target), ...(nextPrefs || {}) }
  writeStoredJson(target, USER_PREFS_STORAGE_KEY, merged)
  return merged
}
const getStoredUserData = (target) => readStoredJson(target, USER_DATA_STORAGE_KEY, {})
const setStoredUserData = (target, nextData) => {
  const merged = { ...getStoredUserData(target), ...(nextData || {}) }
  writeStoredJson(target, USER_DATA_STORAGE_KEY, merged)
  return merged
}

const isAbsolute = (pathname) => {
  const value = normalizeSlashes(pathname)
  return value.startsWith('/') || /^([a-zA-Z]:\/)/.test(value) || value.startsWith('//')
}

const splitSegments = (pathname) => {
  const value = normalizeSlashes(pathname)
  const prefix = value.startsWith('//') ? '//' : value.match(/^([a-zA-Z]:\/)/)?.[1] || '/'
  const body = value.slice(prefix === '//' ? 2 : prefix.length).replace(/\/+/g, '/')
  const segments = body.split('/').filter((segment) => segment && segment !== '.')
  const resolved = []
  for (const segment of segments) {
    if (segment === '..') {
      if (resolved.length && resolved[resolved.length - 1] !== '..') resolved.pop()
      else if (!isAbsolute(prefix)) resolved.push(segment)
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
    return prefix === '/' || prefix === '//' || /^[a-zA-Z]:\/$/.test(prefix) ? `${prefix.replace(/\/$/, '')}/${body}`.replace(/\/+/g, '/') : body
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
    while (fromParts.length && toParts.length && fromParts[0] === toParts[0]) { fromParts.shift(); toParts.shift() }
    return [...fromParts.map(() => '..'), ...toParts].join('/') || ''
  }
  const joinWithAbsolute = (parts, resolveMode = false) => {
    const filtered = parts.filter((part) => part !== undefined && part !== null && part !== '')
    if (!filtered.length) return resolveMode ? '/' : '.'
    return normalize(filtered.map((part) => normalizeSlashes(part)).join('/'))
  }
  function joinedPath(parts, resolveMode = false) { return joinWithAbsolute(parts, resolveMode) }
  return { sep: '/', delimiter: ':', normalize, join, resolve, dirname, basename, extname, isAbsolute, relative }
}

const createTauriFileUtilsFacade = (tauriFs) => ({
  isFile: () => false,
  isDirectory: () => false,
  emptyDir: async(pathname) => { if (tauriFs?.remove) return tauriFs.remove(pathname, { recursive: true }) },
  copy: async(src, dest) => tauriFs?.copyFile?.(src, dest),
  ensureDir: async(pathname) => tauriFs?.mkdir?.(pathname, { recursive: true }).catch(() => {}),
  outputFile: async(pathname, data) => typeof data === 'string' ? tauriFs?.writeTextFile?.(pathname, data) : tauriFs?.writeFile?.(pathname, data),
  move: async(src, dest) => tauriFs?.rename?.(src, dest),
  stat: async(pathname) => tauriFs?.stat?.(pathname),
  writeFile: async(pathname, data) => typeof data === 'string' ? tauriFs?.writeTextFile?.(pathname, data) : tauriFs?.writeFile?.(pathname, data),
  readFile: async(pathname) => tauriFs?.readTextFile?.(pathname) ?? tauriFs?.readFile?.(pathname),
  ensureDirSync: () => {},
  pathExistsSync: () => false,
  isChildOfDirectory: (dir, child) => normalizeSlashes(child).startsWith(normalizeSlashes(dir).replace(/\/+$/, '')),
  hasMarkdownExtension: (filename) => /\.md$/i.test(String(filename || '')),
  MARKDOWN_INCLUSIONS: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdtxt'],
  isSamePathSync: (pathA, pathB) => normalizeSlashes(pathA) === normalizeSlashes(pathB),
  isImageFile: (filepath) => /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(String(filepath || ''))
})

const createEventBus = (target = globalThis) => {
  const listeners = new Map()
  const add = (eventName, handler, once = false) => {
    bridgeLog('ipc:on', { eventName, once })
    const wrapped = (event) => {
      if (once) remove(eventName, handler)
      const detail = Array.isArray(event?.detail) ? event.detail : [event?.detail]
      bridgeLog('ipc:event', { eventName, detail: detail.map(summarize) })
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
    for (const wrapped of eventListeners.values()) target.removeEventListener(eventName, wrapped)
    listeners.delete(eventName)
  }
  const send = (eventName, ...args) => {
    bridgeLog('ipc:send', { eventName, args: args.map(summarize) })
    target.dispatchEvent(new CustomEvent(eventName, { detail: args }))
  }
  return { send, on: (eventName, handler) => add(eventName, handler, false), once: (eventName, handler) => add(eventName, handler, true), removeListener: remove, removeAllListeners: removeAll }
}

const getDefaultKeybindings = (target) => {
  const platform = String(target?.navigator?.platform || target?.navigator?.userAgent || '').toLowerCase()
  if (platform.includes('mac')) return keybindingsDarwin
  if (platform.includes('linux')) return keybindingsLinux
  return keybindingsWindows
}

const getCurrentLanguage = (target) => {
  const browserLocale = String(target?.navigator?.language || target?.navigator?.languages?.[0] || 'en').toLowerCase()
  if (browserLocale.startsWith('fr')) return 'fr'
  if (browserLocale.startsWith('zh')) return 'zh-CN'
  return 'en'
}

const createTauriFacade = (target, tauri) => {
  const coreApi = tauri?.core
  const fsApi = tauri?.fs
  const eventBus = createEventBus(target)
  const openFolderPath = async(pathname) => { if (pathname) { bridgeLog('open-folder:selected', { pathname }); eventBus.send('mt::open-directory', pathname) } }
  const dispatchNativeCommand = async(channel, args) => {
    bridgeLog('native:send', { channel, args: args.map(summarize) })
    switch (channel) {
      case 'mt::cmd-open-folder':
      case 'mt::ask-for-open-project-in-sidebar': {
        const folder = await openDialog({ multiple: false, directory: true, createDirectory: true })
        if (typeof folder === 'string' && folder) await openFolderPath(folder)
        else if (Array.isArray(folder) && folder[0]) await openFolderPath(folder[0])
        else bridgeLog('open-folder:cancelled')
        return true
      }
      case 'mt::ask-for-user-preference': eventBus.send('mt::user-preference', getStoredPreferences(target)); return true
      case 'mt::ask-for-user-data': eventBus.send('mt::user-preference', getStoredUserData(target)); return true
      case 'mt::set-user-preference': eventBus.send('mt::user-preference', setStoredPreferences(target, args[0])); return true
      case 'mt::set-user-data': eventBus.send('mt::user-preference', setStoredUserData(target, args[0])); return true
      default: return false
    }
  }
  const invoke = async(channel, payload) => {
    bridgeLog('native:invoke', { channel, payload: summarize(payload) })
    if (channel === 'update-buffer-state') { writeStoredJson(target, BUFFER_STORAGE_KEY, payload); return true }
    if (channel === 'mt::get-current-language') return getCurrentLanguage(target)
    if (channel === 'mt::keybinding-get-keyboard-info') return { layout: target?.navigator?.language || 'en-US', keymap: {} }
    if (channel === 'mt::keybinding-get-pref-keybindings') return { defaultKeybindings: getDefaultKeybindings(target), userKeybindings: new Map() }
    if (channel === 'mt::fs-trash-item') { if (fsApi?.remove) { await fsApi.remove(payload, { recursive: true }); return true } return false }
    if (!coreApi?.invoke) throw new Error('Tauri core API is unavailable')
    return coreApi.invoke(channel, payload)
  }
  return {
    ipcRenderer: { send: (channel, ...args) => { void dispatchNativeCommand(channel, args).then((handled) => { if (!handled) eventBus.send(channel, ...args) }) }, on: eventBus.on, once: eventBus.once, removeListener: eventBus.removeListener, removeAllListeners: eventBus.removeAllListeners, invoke },
    shell: { openExternal: async(url) => openUrl(url), openPath: async(pathname) => openPath(pathname), showItemInFolder: async(pathname) => revealItemInDir(pathname), exec: async(command, args = [], options = {}) => coreApi.invoke('shell_exec', { command, args, cwd: options.cwd || null, env: options.env || null }) },
    clipboard: { writeText: async(text) => clipboardWriteText(text), readText: async() => clipboardReadText() },
    webUtils: { getPathForFile: (file) => file?.path || file?.webkitRelativePath || file?.name || '' },
    process: { platform: target.navigator?.userAgentData?.platform || target.navigator?.platform || 'tauri', env: { MARKTEXT_VERSION_STRING: target.__MARKTEXT_VERSION_STRING__ || '' } },
    fs: fsApi
  }
}

export const installRuntimeBridge = (target = globalThis) => {
  const hasElectron = !!target?.electron?.ipcRenderer
  const hasTauri = !!target?.__TAURI__
  const markRuntime = (mode) => { target.__MARKTEXT_RUNTIME__ = mode; return mode }
  if (!target.path) target.path = createPathFacade()
  if (!target.commandExists) target.commandExists = { exists: () => false }
  if (!target.i18nUtils) target.i18nUtils = {}
  if (!target.elephantnote) target.elephantnote = {}
  if (hasElectron) return { mode: markRuntime('electron'), installed: false }
  if (hasTauri) {
    target.fileUtils = target.fileUtils || createTauriFileUtilsFacade(target.__TAURI__?.fs)
    target.electron = createTauriFacade(target, target.__TAURI__)
    return { mode: markRuntime('tauri'), installed: true }
  }
  const eventBus = createEventBus(target)
  target.fileUtils = target.fileUtils || createTauriFileUtilsFacade(null)
  target.electron = { ipcRenderer: eventBus, shell: {}, clipboard: {}, webUtils: {}, process: { platform: 'browser', env: {} } }
  return { mode: markRuntime('tauri-compatible'), installed: true }
}

export const createCompatibilitySurface = installRuntimeBridge

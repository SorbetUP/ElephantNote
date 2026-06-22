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
const PANDOC_EXTENSIONS = new Set(['html', 'docx', 'odt', 'latex', 'tex', 'ltx', 'rst', 'rest', 'org', 'wiki', 'dokuwiki', 'textile', 'opml', 'epub'])
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdown', 'mkdn', 'mkd', 'mdwn', 'mdtxt', 'mdtext', 'mdx', 'text', 'txt'])

const readStoredJson = (target, key, fallback) => {
  try {
    const raw =
      target?.localStorage?.getItem(key) ??
      target?.__TAURI_BRIDGE_STORAGE__?.get?.(key) ??
      null
    if (raw == null) return fallback
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

const writeStoredJson = (target, key, value) => {
  try {
    const raw = JSON.stringify(value)
    if (!target.__TAURI_BRIDGE_STORAGE__) {
      target.__TAURI_BRIDGE_STORAGE__ = new Map()
    }
    target.__TAURI_BRIDGE_STORAGE__.set(key, raw)
    if (target?.localStorage) {
      try {
        target.localStorage.setItem(key, raw)
      } catch {}
    }
    return true
  } catch {
    return false
  }
}

const getDefaultKeybindings = (target) => {
  const platform = String(target?.navigator?.platform || target?.navigator?.userAgent || '').toLowerCase()
  if (platform.includes('mac')) return keybindingsDarwin
  if (platform.includes('linux')) return keybindingsLinux
  return keybindingsWindows
}

const getCurrentLanguage = (target) => {
  const stored = target?.localStorage?.getItem(`${STORAGE_PREFIX}language`)
  if (stored) return stored
  const browserLocale = String(target?.navigator?.language || target?.navigator?.languages?.[0] || 'en')
  const normalized = browserLocale.toLowerCase()
  if (normalized.startsWith('zh-hk')) return 'zh-TW'
  if (normalized.startsWith('zh-tw')) return 'zh-TW'
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized.startsWith('en')) return 'en'
  if (normalized.startsWith('ja')) return 'ja'
  if (normalized.startsWith('ko')) return 'ko'
  if (normalized.startsWith('fr')) return 'fr'
  if (normalized.startsWith('de')) return 'de'
  if (normalized.startsWith('es')) return 'es'
  if (normalized.startsWith('pt')) return 'pt'
  if (normalized.startsWith('ru')) return 'ru'
  return 'en'
}

const getSpellcheckerState = (target) => {
  const state = readStoredJson(target, SPELLCHECKER_STORAGE_KEY, null)
  if (state && typeof state === 'object') return state
  return { enabled: false, language: 'en-US', words: [] }
}

const setSpellcheckerState = (target, nextState) => {
  const state = {
    enabled: !!nextState?.enabled,
    language: nextState?.language || 'en-US',
    words: Array.isArray(nextState?.words) ? nextState.words : []
  }
  writeStoredJson(target, SPELLCHECKER_STORAGE_KEY, state)
  return state
}

const getStoredPreferences = (target) => readStoredJson(target, USER_PREFS_STORAGE_KEY, {})
const setStoredPreferences = (target, nextPrefs) => {
  const current = getStoredPreferences(target)
  const merged = { ...current, ...(nextPrefs || {}) }
  writeStoredJson(target, USER_PREFS_STORAGE_KEY, merged)
  if (typeof merged.language === 'string' && merged.language) {
    try { target.dispatchEvent?.(new CustomEvent('language-changed', { detail: [merged.language] })) } catch {}
  }
  return merged
}
const getStoredUserData = (target) => readStoredJson(target, USER_DATA_STORAGE_KEY, {})
const setStoredUserData = (target, nextData) => {
  const current = getStoredUserData(target)
  const merged = { ...current, ...(nextData || {}) }
  writeStoredJson(target, USER_DATA_STORAGE_KEY, merged)
  return merged
}

const getFileExtension = (pathname) => {
  const value = String(pathname || '')
  const dot = value.lastIndexOf('.')
  if (dot < 0) return ''
  return value.slice(dot + 1).toLowerCase()
}

const createTauriFileUtilsFacade = (tauriFs) => {
  const metadataCache = new Map()
  const remember = (pathname, info) => {
    metadataCache.set(normalizeSlashes(pathname), info)
    return info
  }
  const getCached = (pathname) => metadataCache.get(normalizeSlashes(pathname))
  const probe = async(pathname) => {
    if (!tauriFs?.stat) return null
    try {
      const info = await tauriFs.stat(pathname)
      return remember(pathname, { isFile: !!info?.isFile, isDirectory: !!info?.isDirectory, info })
    } catch {
      return remember(pathname, { isFile: false, isDirectory: false })
    }
  }
  const readDir = async(pathname) => {
    if (!tauriFs?.readDir) return []
    try { return await tauriFs.readDir(pathname) } catch { return [] }
  }
  return {
    isFile: (pathname) => !!getCached(pathname)?.isFile,
    isDirectory: (pathname) => !!getCached(pathname)?.isDirectory,
    emptyDir: async(pathname) => {
      if (!tauriFs?.readDir || !tauriFs?.remove) return
      const entries = await readDir(pathname)
      await Promise.all(entries.map(async(entry) => {
        const entryPath = entry?.path || entry?.name
        if (!entryPath) return
        await tauriFs.remove(entryPath, { recursive: !!entry?.isDirectory })
      }))
    },
    copy: async(src, dest) => {
      if (tauriFs?.copyFile) return tauriFs.copyFile(src, dest)
      const data = await tauriFs?.readFile?.(src)
      if (data && tauriFs?.writeFile) return tauriFs.writeFile(dest, data)
    },
    ensureDir: async(pathname) => {
      if (tauriFs?.mkdir) {
        try { return await tauriFs.mkdir(pathname, { recursive: true }) } catch { return tauriFs.mkdir(pathname).catch(() => {}) }
      }
    },
    outputFile: async(pathname, data) => {
      if (typeof data === 'string' && tauriFs?.writeTextFile) return tauriFs.writeTextFile(pathname, data)
      if (tauriFs?.writeFile) return tauriFs.writeFile(pathname, data)
    },
    move: async(src, dest) => {
      if (tauriFs?.rename) return tauriFs.rename(src, dest)
    },
    stat: async(pathname) => {
      const info = await probe(pathname)
      return info?.info || info
    },
    writeFile: async(pathname, data) => {
      if (typeof data === 'string' && tauriFs?.writeTextFile) return tauriFs.writeTextFile(pathname, data)
      if (tauriFs?.writeFile) return tauriFs.writeFile(pathname, data)
    },
    readFile: async(pathname) => {
      if (tauriFs?.readFile) return tauriFs.readFile(pathname)
      if (tauriFs?.readTextFile) return tauriFs.readTextFile(pathname)
    },
    ensureDirSync: () => {},
    pathExistsSync: (pathname) => metadataCache.has(normalizeSlashes(pathname)),
    isChildOfDirectory: (dir, child) => {
      const normalizedDir = normalizeSlashes(dir).replace(/\/+$/, '')
      const normalizedChild = normalizeSlashes(child)
      return normalizedChild === normalizedDir || normalizedChild.startsWith(`${normalizedDir}/`)
    },
    hasMarkdownExtension: (filename) => /\.md$/i.test(String(filename || '')),
    MARKDOWN_INCLUSIONS: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdtxt'],
    isSamePathSync: (pathA, pathB) => normalizeSlashes(pathA) === normalizeSlashes(pathB),
    isImageFile: (filepath) => /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(String(filepath || ''))
  }
}

const createFileUtilsFallback = () => ({
  isFile: () => false,
  isDirectory: () => false,
  emptyDir: async() => { throw new Error('fileUtils.emptyDir is not available in the current runtime') },
  copy: async() => { throw new Error('fileUtils.copy is not available in the current runtime') },
  ensureDir: async() => { throw new Error('fileUtils.ensureDir is not available in the current runtime') },
  outputFile: async() => { throw new Error('fileUtils.outputFile is not available in the current runtime') },
  move: async() => { throw new Error('fileUtils.move is not available in the current runtime') },
  stat: async() => { throw new Error('fileUtils.stat is not available in the current runtime') },
  writeFile: async() => { throw new Error('fileUtils.writeFile is not available in the current runtime') },
  readFile: async() => { throw new Error('fileUtils.readFile is not available in the current runtime') },
  ensureDirSync: () => { throw new Error('fileUtils.ensureDirSync is not available in the current runtime') },
  pathExistsSync: () => false,
  isChildOfDirectory: () => false,
  hasMarkdownExtension: (filename) => /\.md$/i.test(String(filename || '')),
  MARKDOWN_INCLUSIONS: ['.md', '.markdown', '.mdown', '.mkdn', '.mkd', '.mdtxt'],
  isSamePathSync: (pathA, pathB) => normalizeSlashes(pathA) === normalizeSlashes(pathB),
  isImageFile: (filepath) => /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(String(filepath || ''))
})

const createTauriElectronFacade = (target, tauri) => {
  const coreApi = tauri?.core
  const fsApi = tauri?.fs
  const eventBus = createEventBus(target)
  const imageExtensions = ['jpeg', 'jpg', 'png', 'gif', 'svg', 'webp']
  const currentWindow = () => getCurrentWindow()
  const openEditorWindow = () => {
    const label = `editor-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return new WebviewWindow(label, { url: target.location?.href || '/', title: target.document?.title || 'Elephant' })
  }
  const decodeText = async(data) => {
    if (typeof data === 'string') return data
    if (data instanceof Uint8Array) return new TextDecoder().decode(data)
    if (data instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(data))
    return String(data ?? '')
  }
  const openMarkdownDocuments = async(filePaths) => {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths]
    for (const [index, pathname] of paths.filter(Boolean).entries()) {
      const markdown = await decodeText(await target.fileUtils?.readFile?.(pathname))
      const filename = target.path?.basename?.(pathname) || pathname.split('/').pop() || pathname
      eventBus.send('mt::open-new-tab', { pathname, filename, markdown, isMixedLineEndings: false }, {}, index === 0)
    }
  }
  const importPandocDocument = async(pathname) => false
  const openFolderPath = async(pathname) => {
    if (!pathname) return
    eventBus.send('mt::open-directory', pathname)
  }
  const searchImagePath = async() => []
  const dispatchNativeCommand = async(channel, args) => {
    switch (channel) {
      case 'mt::ask-for-open-project-in-sidebar':
      case 'mt::cmd-open-folder': {
        const folder = await openDialog({ multiple: false, directory: true, createDirectory: true })
        if (typeof folder === 'string' && folder) await openFolderPath(folder)
        else if (Array.isArray(folder) && folder[0]) await openFolderPath(folder[0])
        return true
      }
      case 'mt::ask-for-user-preference':
        eventBus.send('mt::user-preference', getStoredPreferences(target)); return true
      case 'mt::ask-for-user-data':
        eventBus.send('mt::user-preference', getStoredUserData(target)); return true
      case 'mt::set-user-preference': {
        const [settings] = args
        eventBus.send('mt::user-preference', setStoredPreferences(target, settings)); return true
      }
      case 'mt::set-user-data': {
        const [settings] = args
        eventBus.send('mt::user-preference', setStoredUserData(target, settings)); return true
      }
      case 'mt::open-file':
      case 'mt::open-file-by-window-id':
      case 'mt::cmd-open-file': {
        const filePath = args[0]
        if (filePath) await openMarkdownDocuments([filePath])
        return true
      }
      default:
        return false
    }
  }
  const invoke = async(channel, payload) => {
    if (channel === 'update-buffer-state') { writeStoredJson(target, `${STORAGE_PREFIX}buffer-state`, payload); return true }
    if (channel === 'mt::get-current-language') return getCurrentLanguage(target)
    if (channel === 'mt::fs-trash-item') { if (fsApi?.remove) return fsApi.remove(payload, { recursive: true }).then(() => true); return false }
    if (!coreApi?.invoke) throw new Error('Tauri core API is unavailable')
    return coreApi.invoke(channel, payload)
  }
  return {
    ipcRenderer: {
      send: (channel, ...args) => { void dispatchNativeCommand(channel, args).then((handled) => { if (!handled) eventBus.send(channel, ...args) }) },
      on: eventBus.on,
      once: eventBus.once,
      removeListener: eventBus.removeListener,
      removeAllListeners: eventBus.removeAllListeners,
      invoke
    },
    shell: {
      openExternal: async(url) => openUrl(url),
      openPath: async(pathname) => openPath(pathname),
      showItemInFolder: async(pathname) => revealItemInDir(pathname),
      exec: async(command, args = [], options = {}) => {
        if (!coreApi?.invoke) throw new Error('Tauri core API is unavailable')
        return coreApi.invoke('shell_exec', { command, args, cwd: options.cwd || null, env: options.env || null })
      }
    },
    clipboard: { writeText: async(text) => clipboardWriteText(text), readText: async() => clipboardReadText() },
    webUtils: { getPathForFile: (file) => file?.path || file?.webkitRelativePath || file?.name || '' },
    process: { platform: target.navigator?.userAgentData?.platform || target.navigator?.platform || 'tauri', env: { MARKTEXT_VERSION_STRING: target.__MARKTEXT_VERSION_STRING__ || '' } },
    fs: fsApi
  }
}

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
    if (!target.fileUtils) target.fileUtils = createFileUtilsFallback()
    return { mode: markRuntime('electron'), installed: false }
  }

  if (hasTauri) {
    const electron = createTauriElectronFacade(target, target.__TAURI__)
    if (!target.fileUtils) target.fileUtils = createTauriFileUtilsFacade(target.__TAURI__?.fs)
    target.electron = electron
    return { mode: markRuntime('tauri'), installed: true }
  }

  if (!target.fileUtils) target.fileUtils = createFileUtilsFallback()
  const ipcRenderer = createEventBus(target)
  const shell = createShellFallback()
  const clipboard = createClipboardFallback()
  const webUtils = createWebUtilsFallback()

  target.electron = {
    ipcRenderer,
    shell,
    clipboard,
    webUtils,
    process: { platform: target.navigator?.userAgentData?.platform || target.navigator?.platform || 'tauri', env: { MARKTEXT_VERSION_STRING: target.__MARKTEXT_VERSION_STRING__ || '' } }
  }

  return { mode: markRuntime('tauri-compatible'), installed: true }
}

export const createCompatibilitySurface = installRuntimeBridge

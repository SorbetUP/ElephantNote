const KNOWN_EXISTING_PATHS = new Set()
const HIDDEN_VAULT_ASSET_RE = /(?:^|\/)\.assets\//i
const IMAGE_ASSET_RE = /\.(?:png|jpe?g|gif|webp|svg|avif|bmp|ico)(?:[?#].*)?$/i
const EXCALIDRAW_SCENE_RE = /(?:^|\/)\.assets\/excalidraw-[^/]+\.excalidraw(?:[?#].*)?$/i
const ANDROID_PRIVATE_PATH_RE = /^\/data\/(?:data|user\/\d+)\/([^/]+)(\/.*)?$/

let cachedActiveVaultRoot = ''
let activeVaultLookup = null

const normalizeSlashes = (value = '') => String(value || '').replace(/\\/g, '/')

const fileUrlToPath = (value = '') => {
  const text = String(value || '')
  if (!/^file:/i.test(text)) return text
  try {
    const url = new URL(text)
    let pathname = decodeURIComponent(url.pathname)
    if (/^\/[a-z]:\//i.test(pathname)) pathname = pathname.slice(1)
    if (url.hostname && url.hostname !== 'localhost') return `//${url.hostname}${pathname}`
    return pathname
  } catch {
    return text.replace(/^file:\/\//i, '')
  }
}

const normalizeFilePath = (value = '') => {
  const text = fileUrlToPath(value)
  const pathApi = globalThis.window?.path
  const normalized = normalizeSlashes(text)
  if (!normalized) return normalized
  if (pathApi?.normalize) return normalizeSlashes(pathApi.normalize(normalized))
  const absolute = normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)
  const prefix = absolute ? (normalized.startsWith('/') ? '/' : normalized.slice(0, 3)) : ''
  const body = absolute && prefix ? normalized.slice(prefix.length) : normalized
  const parts = []
  for (const part of body.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (parts.length) parts.pop()
      continue
    }
    parts.push(part)
  }
  return `${prefix}${prefix && !prefix.endsWith('/') ? '/' : ''}${parts.join('/')}` || (absolute ? '/' : '.')
}

const parseAndroidPrivatePath = (pathname = '') => {
  const normalized = normalizeFilePath(pathname)
  const match = normalized.match(ANDROID_PRIVATE_PATH_RE)
  if (!match) return null
  return {
    normalized,
    packageName: match[1],
    suffix: match[2] || '',
    packageRoot: normalized.slice(0, normalized.length - (match[2] || '').length)
  }
}

export const canonicalizeAndroidPrivateVaultPath = (pathname = '', vaultRoot = cachedActiveVaultRoot) => {
  const normalized = normalizeFilePath(pathname)
  const candidate = parseAndroidPrivatePath(normalized)
  const activeRoot = parseAndroidPrivatePath(vaultRoot)
  if (!candidate || !activeRoot || candidate.packageName !== activeRoot.packageName) return normalized

  // /data/data/<package> and /data/user/0/<package> are aliases for the same
  // private Android application directory. Rust keeps one canonical spelling;
  // renderer APIs and WebView file pickers may return the other.
  return normalizeFilePath(`${activeRoot.packageRoot}${candidate.suffix}`)
}

const refreshActiveVaultRoot = async (target = globalThis) => {
  if (activeVaultLookup) return activeVaultLookup
  const invoke = target?.__TAURI__?.core?.invoke
  if (typeof invoke !== 'function') return cachedActiveVaultRoot

  activeVaultLookup = invoke('tauri_vaults_get')
    .then((payload) => {
      const root = normalizeFilePath(payload?.activeVault?.path || '')
      if (root) cachedActiveVaultRoot = root
      return cachedActiveVaultRoot
    })
    .catch((error) => {
      console.warn('[tauri:file-utils] unable to refresh active vault root', {
        error: error?.message || String(error)
      })
      return cachedActiveVaultRoot
    })
    .finally(() => {
      activeVaultLookup = null
    })

  return activeVaultLookup
}

export const resolveTauriVaultPath = async (target = globalThis, pathname = '') => {
  const root = await refreshActiveVaultRoot(target)
  return canonicalizeAndroidPrivateVaultPath(pathname, root)
}

const rememberPath = (pathname, isDirectory = false) => {
  const normalized = canonicalizeAndroidPrivateVaultPath(pathname)
  if (!normalized) return normalized
  KNOWN_EXISTING_PATHS.add(normalized)
  if (!isDirectory) {
    const parent = globalThis.window?.path?.dirname?.(normalized)
    if (parent) KNOWN_EXISTING_PATHS.add(canonicalizeAndroidPrivateVaultPath(parent))
  }
  return normalized
}

const shouldTrustHiddenAssetPath = (pathname = '') => {
  const normalized = canonicalizeAndroidPrivateVaultPath(pathname)
  return HIDDEN_VAULT_ASSET_RE.test(normalized) && (IMAGE_ASSET_RE.test(normalized) || EXCALIDRAW_SCENE_RE.test(normalized))
}

const wrapPathMethod = (target, fileUtils, name, pathIndexes = [0], afterSuccess = null) => {
  const original = fileUtils?.[name]
  if (typeof original !== 'function' || original.__ELEPHANT_PATH_GUARD__) return
  const wrapped = async(...args) => {
    const nextArgs = [...args]
    const root = await refreshActiveVaultRoot(target)
    for (const index of pathIndexes) {
      if (typeof nextArgs[index] === 'string') {
        nextArgs[index] = canonicalizeAndroidPrivateVaultPath(nextArgs[index], root)
      }
    }
    const result = await original.apply(fileUtils, nextArgs)
    afterSuccess?.(nextArgs, result)
    return result
  }
  wrapped.__ELEPHANT_PATH_GUARD__ = true
  fileUtils[name] = wrapped
}

const wrapSyncPathMethod = (fileUtils, name, pathIndexes = [0], mapper = null) => {
  const original = fileUtils?.[name]
  if (typeof original !== 'function' || original.__ELEPHANT_PATH_GUARD__) return
  const wrapped = (...args) => {
    const nextArgs = [...args]
    for (const index of pathIndexes) {
      if (typeof nextArgs[index] === 'string') {
        nextArgs[index] = canonicalizeAndroidPrivateVaultPath(nextArgs[index])
      }
    }
    return mapper ? mapper(original, nextArgs) : original.apply(fileUtils, nextArgs)
  }
  wrapped.__ELEPHANT_PATH_GUARD__ = true
  fileUtils[name] = wrapped
}

export const installTauriFileUtilsPathGuards = (target = globalThis) => {
  const fileUtils = target?.fileUtils
  if (!target?.__TAURI__ || !fileUtils || target.__ELEPHANT_FILE_UTILS_PATH_GUARDS__) return false
  target.__ELEPHANT_FILE_UTILS_PATH_GUARDS__ = true

  // Warm the cache immediately, but every asynchronous file operation also
  // refreshes it so switching vaults cannot leave a stale Android alias.
  void refreshActiveVaultRoot(target)

  wrapPathMethod(target, fileUtils, 'readFile', [0])
  wrapPathMethod(target, fileUtils, 'stat', [0], ([pathname], result) => {
    if (result?.isFile || result?.isDirectory) rememberPath(pathname, !!result?.isDirectory)
  })
  wrapPathMethod(target, fileUtils, 'ensureDir', [0], ([pathname]) => rememberPath(pathname, true))
  wrapPathMethod(target, fileUtils, 'outputFile', [0], ([pathname]) => rememberPath(pathname, false))
  wrapPathMethod(target, fileUtils, 'writeFile', [0], ([pathname]) => rememberPath(pathname, false))
  wrapPathMethod(target, fileUtils, 'copy', [0, 1], ([source, destination]) => rememberPath(destination, false))
  wrapPathMethod(target, fileUtils, 'copyFile', [0, 1], ([source, destination]) => rememberPath(destination, false))
  wrapPathMethod(target, fileUtils, 'move', [0, 1], ([source, destination]) => rememberPath(destination, false))

  wrapSyncPathMethod(fileUtils, 'pathExistsSync', [0], (original, args) => {
    const pathname = args[0]
    return original.apply(fileUtils, args) || KNOWN_EXISTING_PATHS.has(canonicalizeAndroidPrivateVaultPath(pathname)) || shouldTrustHiddenAssetPath(pathname)
  })
  wrapSyncPathMethod(fileUtils, 'isSamePathSync', [0, 1])
  wrapSyncPathMethod(fileUtils, 'isChildOfDirectory', [0, 1])
  wrapSyncPathMethod(fileUtils, 'isFile', [0], (original, args) => original.apply(fileUtils, args) || KNOWN_EXISTING_PATHS.has(canonicalizeAndroidPrivateVaultPath(args[0])))
  wrapSyncPathMethod(fileUtils, 'isDirectory', [0])

  console.info('[tauri:file-utils] Android vault path guards installed')
  return true
}

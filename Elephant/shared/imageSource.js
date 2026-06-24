import path from 'node:path'

const externalSourcePattern = /^(?:https?:|data:|blob:)/i
const fileSourcePattern = /^file:/i
const windowsAbsolutePattern = /^[a-z]:[\\/]/i

const normalizeLocalPath = (value = '') => String(value || '').replace(/\\/g, '/')
const safeDecodeURI = (value = '') => {
  try {
    return decodeURI(String(value || ''))
  } catch {
    return String(value || '')
  }
}
const safeDecodeURIComponent = (value = '') => {
  try {
    return decodeURIComponent(String(value || ''))
  } catch {
    return String(value || '')
  }
}
const stripLocalQueryOrHash = (value = '') => String(value || '').split(/[?#]/)[0]
const isWindowsAbsolutePath = (value = '') => windowsAbsolutePattern.test(normalizeLocalPath(value))
const isAbsoluteLocalPath = (value = '') => path.isAbsolute(String(value || '')) || isWindowsAbsolutePath(value)
const getPathApi = (...values) => values.some(isWindowsAbsolutePath) ? path.win32 : path

const fileUrlToPath = (value = '') => {
  if (!fileSourcePattern.test(String(value || ''))) return String(value || '')
  try {
    const url = new URL(value)
    let pathname = decodeURIComponent(url.pathname)
    if (/^\/[a-z]:\//i.test(pathname)) pathname = pathname.slice(1)
    if (url.hostname && url.hostname !== 'localhost') {
      return `//${url.hostname}${pathname}`
    }
    return pathname
  } catch {
    return String(value || '').replace(/^file:\/\//i, '')
  }
}
const pathToFileUrl = (value = '') => {
  const normalized = normalizeLocalPath(value)
  if (!normalized) return ''
  if (/^[a-z]:\//i.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }
  if (/^\/\//.test(normalized)) {
    return `file:${encodeURI(normalized)}`
  }
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${encodeURI(prefixed)}`
}

const encodeMarkdownPath = (value = '') => normalizeLocalPath(value)
  .split('/')
  .map((segment) => encodeURIComponent(safeDecodeURIComponent(segment)))
  .join('/')

const getSafeRelativePath = (targetPath = '', baseDirectory = '') => {
  if (!targetPath || !baseDirectory) return ''
  if (!isAbsoluteLocalPath(targetPath) || !isAbsoluteLocalPath(baseDirectory)) return ''
  const pathApi = getPathApi(targetPath, baseDirectory)
  const relative = pathApi.relative(baseDirectory, targetPath)
  if (!relative || relative.startsWith('..') || isAbsoluteLocalPath(relative)) return ''
  return normalizeLocalPath(relative)
}

export const resolveLocalImageSource = (src = '', baseDirectory = '') => {
  const value = String(src || '').trim()
  if (!value) return ''

  if (externalSourcePattern.test(value)) {
    return value
  }

  const withoutQuery = stripLocalQueryOrHash(value)
  const decoded = safeDecodeURI(withoutQuery)

  if (fileSourcePattern.test(decoded)) {
    return fileUrlToPath(decoded)
  }

  if (isAbsoluteLocalPath(decoded)) return normalizeLocalPath(decoded)
  const pathApi = getPathApi(baseDirectory, decoded)
  return normalizeLocalPath(pathApi.resolve(String(baseDirectory || ''), decoded))
}

export const toFileUrl = (filePath = '') => {
  const value = String(filePath || '').trim()
  if (!value) return ''
  return pathToFileUrl(value)
}

export const toMarkdownImageSource = (src = '', baseDirectory = '') => {
  const value = String(src || '').trim()
  if (!value) return ''
  if (externalSourcePattern.test(value)) return value

  const withoutQuery = stripLocalQueryOrHash(value)
  const decoded = safeDecodeURI(withoutQuery)

  if (!fileSourcePattern.test(decoded) && !isAbsoluteLocalPath(decoded)) {
    return encodeMarkdownPath(decoded)
  }

  const imagePath = resolveLocalImageSource(decoded, baseDirectory)
  const relativePath = getSafeRelativePath(imagePath, String(baseDirectory || '').trim())
  if (relativePath) return encodeMarkdownPath(relativePath)
  return toFileUrl(imagePath)
}

export const normalizeInsertedImageSource = (src = '', baseDirectory = '') => {
  const value = String(src || '').trim()
  if (!value) return ''
  if (/^(?:https?:|data:|blob:|file:)/i.test(value)) return value
  const imagePath = resolveLocalImageSource(value, baseDirectory)
  if (!imagePath) return value
  return toFileUrl(imagePath)
}

export const getImageBaseDirectory = (currentFilePath = '', fallbackDirectory = '') => {
  const pathname = String(currentFilePath || '').trim()
  if (pathname) {
    return normalizeLocalPath(getPathApi(pathname).dirname(pathname))
  }
  return String(fallbackDirectory || '').trim()
}

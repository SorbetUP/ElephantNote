import path from 'node:path'

const normalizeLocalPath = (value = '') => String(value || '').replace(/\\/g, '/')
const fileUrlToPath = (value = '') => {
  if (!String(value || '').startsWith('file://')) return String(value || '')
  try {
    const url = new URL(value)
    return decodeURIComponent(url.pathname)
  } catch {
    return String(value || '').replace(/^file:\/\//, '')
  }
}
const pathToFileUrl = (value = '') => {
  const normalized = normalizeLocalPath(value)
  if (!normalized) return ''
  if (/^[a-z]:\//i.test(normalized)) {
    return `file:///${encodeURI(normalized)}`
  }
  const prefixed = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${encodeURI(prefixed)}`
}

export const resolveLocalImageSource = (src = '', baseDirectory = '') => {
  const value = String(src || '').trim()
  if (!value) return ''

  const withoutQuery = value.split(/[?#]/)[0]
  let decoded = withoutQuery
  try {
    decoded = decodeURI(withoutQuery)
  } catch {
    decoded = withoutQuery
  }

  if (/^(?:https?:|data:|blob:)/i.test(decoded)) {
    return decoded
  }

  if (decoded.startsWith('file://')) {
    try {
      return fileUrlToPath(decoded)
    } catch {
      return decoded.replace(/^file:\/\//, '')
    }
  }

  if (path.isAbsolute(decoded)) return decoded
  return path.resolve(String(baseDirectory || ''), decoded)
}

export const toFileUrl = (filePath = '') => {
  const value = String(filePath || '').trim()
  if (!value) return ''
  try {
    return pathToFileUrl(value)
  } catch {
    return pathToFileUrl(value)
  }
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
    return path.dirname(pathname)
  }
  return String(fallbackDirectory || '').trim()
}

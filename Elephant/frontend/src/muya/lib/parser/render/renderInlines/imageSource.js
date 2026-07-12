const isFileUrl = (value = '') => /^file:\/\//i.test(String(value || '').trim())
const isAbsoluteLocalPath = (value = '') => /^\//.test(value) || /^[a-zA-Z]:[\\/]/.test(value)
const removeQueryAndHash = (value = '') => String(value || '').split(/[?#]/)[0]

const safeDecodeUri = (value = '') => {
  try {
    return decodeURI(value)
  } catch {
    return value
  }
}

export const resolveLocalFilePath = (value = '') => {
  const raw = safeDecodeUri(removeQueryAndHash(String(value || '').trim()))
  if (!raw) return ''
  if (isFileUrl(raw)) {
    const withoutProtocol = raw.replace(/^file:\/\/\/?/i, '/')
    return withoutProtocol.replace(/^\/([a-zA-Z]:\/)/, '$1')
  }
  return isAbsoluteLocalPath(raw) ? raw : ''
}

const mimeFromPath = (pathname = '') => {
  const ext = String(pathname || '').split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'svg':
      return 'image/svg+xml'
    case 'avif':
      return 'image/avif'
    default:
      return 'image/png'
  }
}

const appendCacheBuster = (value = '', dispMsec) => {
  const separator = value.includes('?') ? '&' : '?'
  return `${value}${separator}msec=${dispMsec}`
}

export const createDomImageSrc = (src = '', dispMsec = Date.now()) => {
  const normalized = String(src || '').trim()
  if (!normalized) return ''
  if (isFileUrl(normalized)) return appendCacheBuster(normalized, dispMsec)
  if (isAbsoluteLocalPath(safeDecodeUri(normalized))) {
    return appendCacheBuster(`file://${normalized.replace(/ /g, '%20')}`, dispMsec)
  }
  return normalized.replace(/ /g, '%20')
}

const bytesToBase64 = (bytes) => {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}

export const readLocalImageDataUrl = async(pathname = '') => {
  if (!pathname) throw new Error('empty-local-image-path')
  if (!window.fileUtils?.pathExistsSync?.(pathname)) {
    throw new Error('local-file-not-found')
  }
  const data = await window.fileUtils.readFile(pathname)
  if (data instanceof Blob) {
    const buffer = new Uint8Array(await data.arrayBuffer())
    return `data:${mimeFromPath(pathname)};base64,${bytesToBase64(buffer)}`
  }
  if (data instanceof ArrayBuffer) {
    return `data:${mimeFromPath(pathname)};base64,${bytesToBase64(new Uint8Array(data))}`
  }
  if (ArrayBuffer.isView(data)) {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    return `data:${mimeFromPath(pathname)};base64,${bytesToBase64(bytes)}`
  }
  if (typeof data === 'string') {
    return `data:${mimeFromPath(pathname)};base64,${btoa(unescape(encodeURIComponent(data)))}`
  }
  return `data:${mimeFromPath(pathname)};base64,${bytesToBase64(new Uint8Array([]))}`
}

import { unescape } from './htmlEntities'
import { rtrim } from './stringTools'

const baseUrls = {}
const originIndependentUrl = /^$|^[a-z][a-z0-9+.-]*:|^[?#]/i

const resolveUrl = function resolveUrl(base, href) {
  if (!baseUrls[' ' + base]) {
    if (/^[^:]+:\/*[^/]*$/.test(base)) {
      baseUrls[' ' + base] = base + '/'
    } else {
      baseUrls[' ' + base] = rtrim(base, '/', true)
    }
  }
  base = baseUrls[' ' + base]
  const relativeBase = base.indexOf(':') === -1

  if (href.slice(0, 2) === '//') {
    if (relativeBase) return href
    return base.replace(/^([^:]+:)[\s\S]*$/, '$1') + href
  } else if (href.charAt(0) === '/') {
    if (relativeBase) return href
    return base.replace(/^([^:]+:\/*[^/]*)[\s\S]*$/, '$1') + href
  }
  return base + href
}

export const cleanUrl = function cleanUrl(sanitize, base, href) {
  if (sanitize) {
    let protocol = ''
    try {
      protocol = decodeURI(unescape(href))
        .replace(/[^\w:]/g, '')
        .toLowerCase()
    } catch (error) {
      return null
    }
    if (
      protocol.indexOf('javascript:') === 0 ||
      protocol.indexOf('vbscript:') === 0 ||
      protocol.indexOf('data:') === 0
    ) {
      return null
    }
  }
  if (base && !originIndependentUrl.test(href)) href = resolveUrl(base, href)
  try {
    href = encodeURI(href).replace(/%25/g, '%')
  } catch (error) {
    return null
  }
  return href
}

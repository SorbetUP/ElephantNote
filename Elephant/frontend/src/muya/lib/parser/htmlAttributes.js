export const WHITELIST_ATTRIBUTES = Object.freeze([
  'align', 'alt', 'checked', 'class', 'color', 'dir', 'disabled', 'for', 'height', 'hidden',
  'href', 'id', 'lang', 'lazyload', 'rel', 'spellcheck', 'src', 'srcset', 'start', 'style',
  'target', 'title', 'type', 'value', 'width', 'data-align'
])

const validWidthAndHeight = value => {
  if (!/^\d{1,}$/.test(value)) return ''
  value = parseInt(value)
  return value >= 0 ? value : ''
}

export const getAttributes = html => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const target = doc.querySelector('body').firstElementChild
  if (!target) return null

  const attrs = {}
  if (target.tagName === 'IMG') Object.assign(attrs, { title: '', src: '', alt: '' })
  for (const attr of target.getAttributeNames()) {
    if (!WHITELIST_ATTRIBUTES.includes(attr)) continue
    attrs[attr] = /width|height/.test(attr)
      ? validWidthAndHeight(target.getAttribute(attr))
      : target.getAttribute(attr)
  }
  return attrs
}

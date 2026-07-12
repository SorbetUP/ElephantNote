import { correctImageSrc } from '../utils/getImageInfo'

const renderHtmlImage = (attrs) => {
  let imageText = '<img '
  for (const attr of Object.keys(attrs)) {
    let value = attrs[attr]
    if (value && attr === 'src') value = correctImageSrc(value)
    imageText += `${attr}="${value}" `
  }
  return `${imageText.trim()}>`
}

export function updateImage({ imageId, key, token }, attrName, attrValue) {
  const block = this.getBlock(key)
  const { start, end } = token.range
  const oldText = block.text
  const attrs = Object.assign({}, token.attrs)
  attrs[attrName] = attrValue
  const imageText = renderHtmlImage(attrs)
  block.text = oldText.substring(0, start) + imageText + oldText.substring(end)

  this.singleRender(block, false)
  const image = document.querySelector(`#${imageId} img`)
  if (image) {
    this.cursor = { ...this.cursor, isEdit: true }
    image.click()
    return this.muya.dispatchChange()
  }
}

export function replaceImage({ key, token }, { alt = '', src = '', title = '' }) {
  const { type } = token
  const block = this.getBlock(key)
  const { start, end } = token.range
  const oldText = block.text
  let imageText = ''
  if (type === 'image') {
    imageText = '!['
    if (alt) imageText += alt
    imageText += ']('
    if (src) {
      imageText += src.replace(/ /g, encodeURI(' ')).replace(/#/g, encodeURIComponent('#'))
    }
    if (title) imageText += ` "${title}"`
    imageText += ')'
  } else if (type === 'html_tag') {
    const { attrs } = token
    Object.assign(attrs, { alt, src, title })
    imageText = renderHtmlImage(attrs)
  }

  block.text = oldText.substring(0, start) + imageText + oldText.substring(end)
  this.singleRender(block)
  this.cursor = { ...this.cursor, isEdit: true }
  return this.muya.dispatchChange()
}

export function deleteImage({ key, token }) {
  const block = this.getBlock(key)
  const oldText = block.text
  const { start, end } = token.range
  const { eventCenter } = this.muya
  block.text = oldText.substring(0, start) + oldText.substring(end)

  this.cursor = {
    start: { key, offset: start },
    end: { key, offset: start },
    isEdit: true
  }
  this.singleRender(block)
  eventCenter.dispatch('muya-transformer', { reference: null })
  eventCenter.dispatch('muya-image-toolbar', { reference: null })
  return this.muya.dispatchChange()
}

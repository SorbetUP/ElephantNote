import { cleanUrl, escape } from './utils'
import { getImageInfo } from '../../utils'

export const inlineRendererMethods = {
  inlineMath(math) {
    let output = ''
    if (this.options.mathRenderer) output = this.options.mathRenderer(math, false)
    return output || math
  },

  emoji(text, emoji) {
    return this.options.emojiRenderer ? this.options.emojiRenderer(emoji) : text
  },

  script(content, marker) {
    const tagName = marker === '^' ? 'sup' : 'sub'
    return `<${tagName}>${content}</${tagName}>`
  },

  strong(text) {
    return `<strong>${text}</strong>`
  },

  em(text) {
    return `<em>${text}</em>`
  },

  codespan(text) {
    return `<code>${text}</code>`
  },

  br() {
    return this.options.xhtml ? '<br/>' : '<br>'
  },

  del(text) {
    return `<del>${text}</del>`
  },

  link(href, title, text) {
    href = cleanUrl(this.options.sanitize, this.options.baseUrl, href)
    if (href === null) return text

    let output = `<a href="${escape(href)}"`
    if (title) output += ` title="${title}"`
    return `${output}>${text}</a>`
  },

  image(href, title, text) {
    if (!href) return text

    const result = getImageInfo(href)
    href = result.src.replace(/\\/g, '/')
    href = cleanUrl(this.options.sanitize, this.options.baseUrl, href)
    if (href === null) return text

    let output = `<img src="${href}" alt="${text.replace(/\*/g, '')}"`
    if (title) output += ` title="${title}"`
    output += this.options.xhtml ? '/>' : '>'
    return output
  },

  text(text) {
    return text
  },

  toc() {
    return this.options.tocRenderer ? this.options.tocRenderer() : ''
  }
}

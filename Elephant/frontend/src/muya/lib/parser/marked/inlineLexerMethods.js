import { escape } from './utils'

export const installInlineLexerMethods = InlineLexer => {
  InlineLexer.prototype.escapes = function(text) {
    return text ? text.replace(this.rules._escapes, '$1') : text
  }

  InlineLexer.prototype.outputLink = function(cap, link) {
    const href = link.href
    const title = link.title ? escape(link.title) : null
    const text = cap[1].replace(/\\([\[\]])/g, '$1')
    return cap[0].charAt(0) !== '!'
      ? this.renderer.link(href, title, this.output(text))
      : this.renderer.image(href, title, escape(text))
  }

  InlineLexer.prototype.smartypants = function(text) {
    /* eslint-disable no-useless-escape */
    if (!this.options.smartypants) return text
    return text
      .replace(/---/g, '\u2014')
      .replace(/--/g, '\u2013')
      .replace(/(^|[-\u2014/(\[{"\s])'/g, '$1\u2018')
      .replace(/'/g, '\u2019')
      .replace(/(^|[-\u2014/(\[{\u2018\s])"/g, '$1\u201c')
      .replace(/"/g, '\u201d')
      .replace(/\.{3}/g, '\u2026')
    /* eslint-enable no-useless-escape */
  }

  InlineLexer.prototype.mangle = function(text) {
    if (!this.options.mangle) return text
    const length = text.length
    let out = ''
    for (let index = 0; index < length; index++) {
      let char = text.charCodeAt(index)
      if (Math.random() > 0.5) char = 'x' + char.toString(16)
      out += '&#' + char + ';'
    }
    return out
  }
}

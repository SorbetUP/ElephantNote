import { escape } from './utils'

export const blockRendererMethods = {
  frontmatter(text) {
    return `<pre class="front-matter">\n${text}</pre>\n`
  },

  multiplemath(text) {
    let output = ''
    if (this.options.mathRenderer) output = this.options.mathRenderer(text, true)
    return output || `<pre class="multiple-math">\n${text}</pre>\n`
  },

  code(code, infostring, escaped, codeBlockStyle) {
    const lang = (infostring || '').match(/\S*/)[0]
    if (this.options.highlight) {
      const output = this.options.highlight(code, lang)
      if (output !== null && output !== code) {
        escaped = true
        code = output
      }
    }

    let className = codeBlockStyle === 'fenced' ? 'fenced-code-block' : 'indented-code-block'
    className = lang ? `${className} ${this.options.langPrefix}${escape(lang, true)}` : className
    return `<pre><code class="${className}">${escaped ? code : escape(code, true)}</code></pre>\n`
  },

  blockquote(quote) {
    return `<blockquote>\n${quote}</blockquote>\n`
  },

  html(html) {
    return html
  },

  heading(text, level, raw, slugger, headingStyle) {
    if (this.options.headerIds) {
      const id = this.options.headerPrefix + slugger.slug(raw)
      return `<h${level} id="${id}" class="${headingStyle}">${text}</h${level}>\n`
    }
    return `<h${level}>${text}</h${level}>\n`
  },

  hr() {
    return this.options.xhtml ? '<hr/>\n' : '<hr>\n'
  },

  list(body, ordered, start) {
    const type = ordered ? 'ol' : 'ul'
    const startAttribute = ordered && start !== 1 ? ` start="${start}"` : ''
    return `<${type}${startAttribute}>\n${body}</${type}>\n`
  },

  listitem(text, checked) {
    if (checked === undefined) return `<li>${text}</li>\n`
    return '<li class="task-list-item"><input type="checkbox"' +
      (checked ? ' checked=""' : '') +
      ' disabled=""' +
      (this.options.xhtml ? ' /' : '') +
      '> ' + text + '</li>\n'
  },

  paragraph(text) {
    return `<p>${text}</p>\n`
  },

  footnoteIdentifier(identifier, { footnoteId, footnoteIdentifierId, order }) {
    return `<a href="#${footnoteId ? `fn${footnoteId}` : ''}" class="footnote-ref" id="fnref${footnoteIdentifierId}" role="doc-noteref"><sup>${order || identifier}</sup></a>`
  },

  footnote(footnote) {
    return `<section class="footnotes" role="doc-endnotes">\n<hr />\n<ol>\n${footnote}</ol>\n</section>\n`
  },

  footnoteItem(content, { footnoteId, footnoteIdentifierId }) {
    const backlink = footnoteIdentifierId ? `fnref${footnoteIdentifierId}` : ''
    return `<li id="fn${footnoteId}" role="doc-endnote">${content}<a href="#${backlink}" class="footnote-back" role="doc-backlink">↩︎</a></li>`
  }
}

import marked from '../parser/marked'
import katex from 'katex'
import 'katex/dist/contrib/mhchem.min.js'
import { EXPORT_DOMPURIFY_CONFIG } from '../config'
import { sanitize } from '../utils'
import {
  renderExportDiagrams,
  renderExportMermaid
} from './exportHtmlDiagrams'
import renderExportHtml from './exportHtmlContent'
import generateExportDocument from './exportHtmlDocument'
import prepareExportHtml from './exportHtmlLayout'

export const getSanitizeHtml = (markdown, options) => {
  const html = marked(markdown, options)
  return sanitize(html, EXPORT_DOMPURIFY_CONFIG, false)
}

class ExportHtml {
  constructor(markdown, muya) {
    this.markdown = markdown
    this.muya = muya
    this.exportContainer = null
    this.mathRendererCalled = false
  }

  async renderMermaid() {
    return renderExportMermaid(this)
  }

  async renderDiagram() {
    return renderExportDiagrams(this)
  }

  mathRenderer = (math, displayMode) => {
    this.mathRendererCalled = true
    try {
      return katex.renderToString(math, { displayMode })
    } catch (err) {
      return displayMode
        ? `<pre class="multiple-math invalid">\n${math}</pre>\n`
        : `<span class="inline-math invalid" title="invalid math">${math}</span>`
    }
  }

  async renderHtml(toc) {
    return renderExportHtml(this, toc)
  }

  async generate(options) {
    return generateExportDocument(this, options)
  }

  _prepareHtml(html, options) {
    return prepareExportHtml(html, options)
  }
}

export default ExportHtml

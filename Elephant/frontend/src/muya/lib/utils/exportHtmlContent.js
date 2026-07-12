import marked from '../parser/marked'
import Prism from 'prismjs'
import { EXPORT_DOMPURIFY_CONFIG } from '../config'
import { sanitize } from '../utils'
import { validEmoji } from '../ui/emojis'

const DIAGRAM_TYPE = ['mermaid', 'flowchart', 'sequence', 'plantuml', 'vega-lite']

export default async function renderExportHtml(exporter, toc) {
  exporter.mathRendererCalled = false
  let html = marked(exporter.markdown, {
    superSubScript: exporter.muya ? exporter.muya.options.superSubScript : false,
    footnote: exporter.muya ? exporter.muya.options.footnote : false,
    isGitlabCompatibilityEnabled: exporter.muya
      ? exporter.muya.options.isGitlabCompatibilityEnabled
      : false,
    highlight(code, lang) {
      if (!lang) return code
      if (DIAGRAM_TYPE.includes(lang)) return code
      const grammar = Prism.languages[lang]
      if (!grammar) {
        console.warn(`Unable to find grammar for "${lang}".`)
        return code
      }
      return Prism.highlight(code, grammar, lang)
    },
    emojiRenderer(emoji) {
      const validate = validEmoji(emoji)
      return validate ? validate.emoji : `:${emoji}:`
    },
    mathRenderer: exporter.mathRenderer,
    tocRenderer() {
      return toc || ''
    }
  })

  html = sanitize(html, EXPORT_DOMPURIFY_CONFIG, false)
  const exportContainer = (exporter.exportContainer = document.createElement('div'))
  exportContainer.classList.add('ag-render-container')
  exportContainer.innerHTML = html
  document.body.appendChild(exportContainer)
  await exporter.renderMermaid()
  await exporter.renderDiagram()
  let result = exportContainer.innerHTML
  exportContainer.remove()

  const pathes = document.querySelectorAll('path[id^=raphael-marker-]')
  const def = '<defs style="-webkit-tap-highlight-color: rgba(0, 0, 0, 0);">'
  result = result.replace(def, () => {
    let str = ''
    for (const path of pathes) str += path.outerHTML
    return `${def}${str}`
  })

  exporter.exportContainer = null
  return result
}

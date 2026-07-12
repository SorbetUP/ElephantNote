import TurndownService, { usePluginAddRules } from './turndownService'

const turnSoftBreakToSpan = html => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(
    `<x-mt id="turn-root">${html}</x-mt>`,
    'text/html'
  )
  const root = doc.querySelector('#turn-root')
  const travel = childNodes => {
    for (const node of childNodes) {
      if (node.nodeType === 3 && node.parentNode.tagName !== 'CODE') {
        let startLen = 0
        let endLen = 0
        const text = node.nodeValue
          .replace(/^(\n+)/, (_, value) => {
            startLen = value.length
            return ''
          })
          .replace(/(\n+)$/, (_, value) => {
            endLen = value.length
            return ''
          })
        if (/\n/.test(text)) {
          const parts = text.split('\n')
          const replacements = []
          for (let index = 0; index < parts.length; index++) {
            let value = parts[index]
            if (index === 0 && startLen !== 0) {
              value = '\n'.repeat(startLen) + value
            } else if (index === parts.length - 1 && endLen !== 0) {
              value += '\n'.repeat(endLen)
            }
            replacements.push(document.createTextNode(value))
            if (index !== parts.length - 1) {
              const softBreak = document.createElement('span')
              softBreak.classList.add('ag-soft-line-break')
              replacements.push(softBreak)
            }
          }
          node.replaceWith(...replacements)
        }
      } else if (node.nodeType === 1) {
        travel(node.childNodes)
      }
    }
  }
  travel(root.childNodes)
  return root.innerHTML.trim()
}

const importHtml = ContentState => {
  ContentState.prototype.htmlToMarkdown = function(html, keeps = []) {
    const turndownService = new TurndownService(this.turndownConfig)
    usePluginAddRules(turndownService, keeps)
    html = html.replace(/<span>&nbsp;<\/span>/g, String.fromCharCode(160))
    html = turnSoftBreakToSpan(html)
    return turndownService.turndown(html)
  }

  ContentState.prototype.html2State = function(html) {
    const markdown = this.htmlToMarkdown(html, ['ruby', 'rt', 'u', 'br'])
    return this.markdownToState(markdown)
  }
}

export default importHtml

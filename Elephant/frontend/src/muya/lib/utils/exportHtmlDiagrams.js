import loadRenderer from '../renderers'
import { EXPORT_DOMPURIFY_CONFIG } from '../config'
import { sanitize, unescapeHTML } from '../utils'

export const renderExportMermaid = async exporter => {
  const codes = exporter.exportContainer.querySelectorAll('code.language-mermaid')
  for (const code of codes) {
    const preElement = code.parentNode
    const container = document.createElement('div')
    container.innerHTML = sanitize(
      unescapeHTML(code.innerHTML),
      EXPORT_DOMPURIFY_CONFIG,
      true
    )
    container.classList.add('mermaid')
    preElement.replaceWith(container)
  }
  const mermaid = await loadRenderer('mermaid')
  mermaid.initialize({ securityLevel: 'strict', theme: 'default' })
  mermaid.init(undefined, exporter.exportContainer.querySelectorAll('div.mermaid'))
  if (exporter.muya) {
    mermaid.initialize({
      securityLevel: 'strict',
      theme: exporter.muya.options.mermaidTheme
    })
  }
}

const getDiagramType = code => {
  if (/sequence/.test(code.className)) return 'sequence'
  if (/plantuml/.test(code.className)) return 'plantuml'
  if (/flowchart/.test(code.className)) return 'flowchart'
  return 'vega-lite'
}

export const renderExportDiagrams = async exporter => {
  const selector =
    'code.language-vega-lite, code.language-flowchart, code.language-sequence, code.language-plantuml'
  const renderMap = {
    flowchart: await loadRenderer('flowchart'),
    sequence: await loadRenderer('sequence'),
    plantuml: await loadRenderer('plantuml'),
    'vega-lite': await loadRenderer('vega-lite')
  }
  const codes = exporter.exportContainer.querySelectorAll(selector)
  for (const code of codes) {
    const rawCode = unescapeHTML(code.innerHTML)
    const functionType = getDiagramType(code)
    const render = renderMap[functionType]
    const preParent = code.parentNode
    const container = document.createElement('div')
    container.classList.add(functionType)
    preParent.replaceWith(container)
    const options = {}
    if (functionType === 'sequence') {
      Object.assign(options, { theme: exporter.muya.options.sequenceTheme })
    } else if (functionType === 'vega-lite') {
      Object.assign(options, {
        actions: false,
        tooltip: false,
        renderer: 'svg',
        theme: 'latimes'
      })
    }
    try {
      if (functionType === 'flowchart' || functionType === 'sequence') {
        const diagram = render.parse(rawCode)
        container.innerHTML = ''
        diagram.drawSVG(container, options)
      }
      if (functionType === 'plantuml') {
        const diagram = render.parse(rawCode)
        container.innerHTML = ''
        diagram.insertImgElement(container)
      }
      if (functionType === 'vega-lite') {
        await render(container, JSON.parse(rawCode), options)
      }
    } catch (err) {
      container.innerHTML = '< Invalid Diagram >'
    }
  }
}

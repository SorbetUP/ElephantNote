import katex from 'katex'
import 'katex/dist/contrib/mhchem.min.js'
import { CLASS_OR_ID, PREVIEW_DOMPURIFY_CONFIG } from '../../../config'
import { sanitize, getImageInfo } from '../../../utils'
import { htmlToVNode } from '../snabbdom'

export default function renderLeafPreview(renderer, block, data, selector, children, t) {
  if (block.type !== 'div') return { handled: false, selector, children }

  const code = renderer.codeCache.get(block.preSibling)
  const { functionType } = block
  switch (functionType) {
    case 'html': {
      selector += `.${CLASS_OR_ID.AG_HTML_PREVIEW}`
      Object.assign(data.attrs, { spellcheck: 'false' })
      const { disableHtml } = renderer.muya.options
      const htmlContent = sanitize(code, PREVIEW_DOMPURIFY_CONFIG, disableHtml)
      if (/^<([a-z][a-z\d]*)[^>]*?>(\s*)<\/\1>$/.test(htmlContent.trim())) {
        children = htmlToVNode(`<div class="ag-empty">${t('editor.emptyHtmlBlock')}</div>`)
      } else {
        const parser = new DOMParser()
        const doc = parser.parseFromString(htmlContent, 'text/html')
        const imgs = doc.documentElement.querySelectorAll('img')
        for (const img of imgs) {
          const src = img.getAttribute('src')
          const imageInfo = getImageInfo(src)
          img.setAttribute('src', imageInfo.src)
        }
        children = htmlToVNode(doc.documentElement.querySelector('body').innerHTML)
      }
      break
    }
    case 'multiplemath': {
      const key = `${code}_display_math`
      selector += `.${CLASS_OR_ID.AG_CONTAINER_PREVIEW}`
      Object.assign(data.attrs, { spellcheck: 'false' })
      if (code === '') {
        children = t('editor.emptyMathFormula')
        selector += `.${CLASS_OR_ID.AG_EMPTY}`
      } else if (renderer.loadMathMap.has(key)) {
        children = renderer.loadMathMap.get(key)
      } else {
        try {
          const html = katex.renderToString(code, { displayMode: true })
          children = htmlToVNode(html)
          renderer.loadMathMap.set(key, children)
        } catch (err) {
          children = t('editor.invalidMathFormula')
          selector += `.${CLASS_OR_ID.AG_MATH_ERROR}`
        }
      }
      break
    }
    case 'mermaid': {
      selector += `.${CLASS_OR_ID.AG_CONTAINER_PREVIEW}`
      Object.assign(data.attrs, { spellcheck: 'false' })
      if (code === '') {
        children = t('editor.emptyMermaidBlock')
        selector += `.${CLASS_OR_ID.AG_EMPTY}`
      } else {
        children = t('editor.loading')
        renderer.mermaidCache.set(`#${block.key}`, { code, functionType })
      }
      break
    }
    case 'flowchart':
    case 'sequence':
    case 'plantuml':
    case 'vega-lite': {
      selector += `.${CLASS_OR_ID.AG_CONTAINER_PREVIEW}`
      Object.assign(data.attrs, { spellcheck: 'false' })
      if (code === '') {
        children = t('editor.emptyDiagramBlock')
        selector += `.${CLASS_OR_ID.AG_EMPTY}`
      } else {
        children = t('editor.loading')
        renderer.diagramCache.set(`#${block.key}`, { code, functionType })
      }
      break
    }
  }

  return { handled: true, selector, children }
}

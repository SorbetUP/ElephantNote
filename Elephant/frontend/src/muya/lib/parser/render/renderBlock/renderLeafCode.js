import prism, { loadedLanguages, transformAliasToOrigin } from '../../../prism/'
import { PREVIEW_DOMPURIFY_CONFIG } from '../../../config'
import { sanitize } from '../../../utils'
import { htmlToVNode } from '../snabbdom'
import { getHighlightHtml, MARKER_HASK } from './renderLeafHighlights'

export default function renderLeafCode(block, highlights, selector, children) {
  const { type, functionType, text, lang } = block
  if (type === 'span' && functionType === 'codeContent') {
    const code = getHighlightHtml(text, highlights, true, true)
      .replace(new RegExp(MARKER_HASK['<'], 'g'), '<')
      .replace(new RegExp(MARKER_HASK['>'], 'g'), '>')
      .replace(new RegExp(MARKER_HASK['"'], 'g'), '"')
      .replace(new RegExp(MARKER_HASK["'"], 'g'), "'")
    const transformedLang = transformAliasToOrigin([lang])[0]
    if (transformedLang && /\S/.test(code) && loadedLanguages.has(transformedLang)) {
      const wrapper = document.createElement('div')
      wrapper.classList.add(`language-${transformedLang}`)
      wrapper.innerHTML = code
      prism.highlightElement(wrapper, false, function() {
        const highlightedCode = this.innerHTML
        selector += `.language-${transformedLang}`
        children = htmlToVNode(highlightedCode)
      })
    } else {
      children = htmlToVNode(code)
    }
    return { handled: true, selector, children }
  }

  if (type === 'span' && functionType === 'languageInput') {
    const escapedText = sanitize(text, PREVIEW_DOMPURIFY_CONFIG, true)
    const html = getHighlightHtml(escapedText, highlights, true)
    return { handled: true, selector, children: htmlToVNode(html) }
  }

  return { handled: false, selector, children }
}

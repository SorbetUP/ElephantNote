import { DEVICE_MEMORY, HAS_TEXT_BLOCK_REG } from '../../../config'
import { tokenizer } from '../../'
import { snakeToCamel, escapeHTML, getLongUniqueId } from '../../../utils'
import { h } from '../snabbdom'

export const MARKER_HASK = {
  '<': `%${getLongUniqueId()}%`,
  '>': `%${getLongUniqueId()}%`,
  '"': `%${getLongUniqueId()}%`,
  "'": `%${getLongUniqueId()}%`
}

export const getHighlightHtml = (
  text,
  highlights,
  escape = false,
  handleLineEnding = false
) => {
  let code = ''
  let pos = 0
  const getEscapeHTML = (className, content) => {
    return `${MARKER_HASK['<']}span class=${MARKER_HASK['"']}${className}${MARKER_HASK['"']}${MARKER_HASK['>']}${content}${MARKER_HASK['<']}/span${MARKER_HASK['>']}`
  }

  for (const highlight of highlights) {
    const { start, end, active } = highlight
    code += text.substring(pos, start)
    const className = active ? 'ag-highlight' : 'ag-selection'
    let highlightContent = text.substring(start, end)
    if (handleLineEnding && text.endsWith('\n') && end === text.length) {
      highlightContent =
        highlightContent.substring(start, end - 1) +
        (escape
          ? getEscapeHTML('ag-line-end', '\n')
          : '<span class="ag-line-end">\n</span>')
    }
    code += escape
      ? getEscapeHTML(className, highlightContent)
      : `<span class="${className}">${highlightContent}</span>`
    pos = end
  }
  if (pos !== text.length) {
    if (handleLineEnding && text.endsWith('\n')) {
      code +=
        text.substring(pos, text.length - 1) +
        (escape
          ? getEscapeHTML('ag-line-end', '\n')
          : '<span class="ag-line-end">\n</span>')
    } else {
      code += text.substring(pos)
    }
  }
  return escapeHTML(code)
}

const hasReferenceToken = tokens => {
  let result = false
  const travel = items => {
    for (const token of items) {
      if (/reference_image|reference_link/.test(token.type)) {
        result = true
        break
      }
      if (Array.isArray(token.children) && token.children.length) travel(token.children)
    }
  }
  travel(tokens)
  return result
}

export const renderTextChildren = (renderer, block, highlights, useCache, cursor) => {
  const { text, type, functionType } = block
  if (!text) return ''

  let tokens = []
  if (highlights.length === 0 && renderer.tokenCache.has(text)) {
    tokens = renderer.tokenCache.get(text)
  } else if (
    HAS_TEXT_BLOCK_REG.test(type) &&
    functionType !== 'codeContent' &&
    functionType !== 'languageInput'
  ) {
    const hasBeginRules = /paragraphContent|atxLine/.test(functionType)
    tokens = tokenizer(text, {
      highlights,
      hasBeginRules,
      labels: renderer.labels,
      options: renderer.muya.options
    })
    if (
      highlights.length === 0 &&
      useCache &&
      DEVICE_MEMORY >= 4 &&
      !hasReferenceToken(tokens)
    ) {
      renderer.tokenCache.set(text, tokens)
    }
  }

  return tokens.reduce(
    (acc, token) => [
      ...acc,
      ...renderer[snakeToCamel(token.type)](h, cursor, block, token)
    ],
    []
  )
}

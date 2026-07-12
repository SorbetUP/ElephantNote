import { HAS_TEXT_BLOCK_REG, CLASS_OR_ID } from '../config'

const dispatchLinkFormat = (eventCenter, event, inlineNode) => {
  let parentNode = inlineNode
  while (parentNode !== null && parentNode.classList.contains(CLASS_OR_ID.AG_INLINE_RULE)) {
    if (parentNode.tagName === 'A') {
      eventCenter.dispatch('format-click', {
        event,
        formatType: 'link',
        data: {
          text: inlineNode.textContent,
          href: parentNode.getAttribute('href') || ''
        }
      })
      break
    }
    parentNode = parentNode.parentNode
  }
}

const getInlineFormat = (inlineNode) => {
  switch (inlineNode.tagName) {
    case 'SPAN':
      if (inlineNode.hasAttribute('data-emoji')) {
        return { formatType: 'emoji', data: inlineNode.getAttribute('data-emoji') }
      }
      if (inlineNode.classList.contains('ag-math-text')) {
        return { formatType: 'inline_math', data: inlineNode.textContent }
      }
      break
    case 'STRONG':
      return { formatType: 'strong', data: inlineNode.textContent }
    case 'EM':
      return { formatType: 'em', data: inlineNode.textContent }
    case 'DEL':
      return { formatType: 'del', data: inlineNode.textContent }
    case 'CODE':
      return { formatType: 'inline_code', data: inlineNode.textContent }
  }
  return { formatType: null, data: null }
}

export const dispatchClickedFormats = (contentState, event, node) => {
  const { eventCenter } = contentState.muya
  const inlineNode = node ? node.closest('.ag-inline-rule') : null
  if (!inlineNode) return

  dispatchLinkFormat(eventCenter, event, inlineNode)
  const { formatType, data } = getInlineFormat(inlineNode)
  if (formatType) {
    eventCenter.dispatch('format-click', {
      event,
      formatType,
      data
    })
  }
}

export const showSelectionFormatPicker = (contentState, start, end, block) => {
  if (
    start.key === end.key &&
    start.offset !== end.offset &&
    HAS_TEXT_BLOCK_REG.test(block.type) &&
    block.functionType !== 'codeContent' &&
    block.functionType !== 'languageInput'
  ) {
    const reference = contentState.getPositionReference()
    const { formats } = contentState.selectionFormats()
    contentState.muya.eventCenter.dispatch('muya-format-picker', { reference, formats })
  }
}

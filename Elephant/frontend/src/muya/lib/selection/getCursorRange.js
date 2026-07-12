import Cursor from './cursor'
import { CLASS_OR_ID } from '../config'
import {
  findNearestParagraph,
  getOffsetOfParagraph,
  getTextContent
} from './dom'

const ignoredRenderers = [
  CLASS_OR_ID.AG_MATH_RENDER,
  CLASS_OR_ID.AG_RUBY_RENDER
]

const offsetBeforeImage = (imageWrapper, paragraph) => {
  const previous = imageWrapper.previousElementSibling
  let offset = 0
  if (previous) {
    offset += getOffsetOfParagraph(previous, paragraph)
    offset += getTextContent(previous, ignoredRenderers).length
  }
  return offset
}

const adjustImageOffsets = (
  anchorNode,
  anchorOffset,
  focusNode,
  focusOffset,
  anchorParagraph,
  anchorValue,
  focusValue
) => {
  let anchorResult = anchorValue
  let focusResult = focusValue
  if (
    anchorNode === focusNode &&
    anchorOffset === focusOffset &&
    anchorNode?.parentNode?.classList.contains('ag-image-container') &&
    anchorNode.previousElementSibling?.nodeName === 'IMG'
  ) {
    const imageWrapper = anchorNode.parentNode.parentNode
    anchorResult = offsetBeforeImage(imageWrapper, anchorParagraph)
    anchorResult += getTextContent(imageWrapper, ignoredRenderers).length
    focusResult = anchorResult
  }

  if (
    anchorNode === focusNode &&
    anchorNode?.nodeType === 1 &&
    anchorNode.classList.contains('ag-image-container') &&
    anchorNode.parentNode
  ) {
    const imageWrapper = anchorNode.parentNode
    anchorResult = offsetBeforeImage(imageWrapper, anchorParagraph)
    if (anchorOffset === 1) {
      anchorResult += getTextContent(imageWrapper, ignoredRenderers).length
    }
    focusResult = anchorResult
  }
  return { anchorValue: anchorResult, focusValue: focusResult }
}

export const isValidCursorNode = node => {
  if (!node) return false
  if (node.nodeType === 3) node = node.parentNode
  return node.closest('span.ag-paragraph')
}

export default function getCursorRange(selection) {
  let { anchorNode, anchorOffset, focusNode, focusOffset } = selection.doc.getSelection()
  const isAnchorValid = isValidCursorNode(anchorNode)
  const isFocusValid = isValidCursorNode(focusNode)
  let needFix = false

  if (!isAnchorValid && isFocusValid) {
    needFix = true
    anchorNode = focusNode
    anchorOffset = focusOffset
  } else if (isAnchorValid && !isFocusValid) {
    needFix = true
    focusNode = anchorNode
    focusOffset = anchorOffset
  } else if (!isAnchorValid && !isFocusValid) {
    const editorElement = selection.doc.querySelector('#ag-editor-id')
    if (editorElement?.parentNode) editorElement.parentNode.blur()
    return new Cursor({
      start: null,
      end: null,
      anchor: null,
      focus: null
    })
  }

  if (
    anchorNode === focusNode &&
    anchorOffset === focusOffset &&
    anchorNode.textContent === '\n' &&
    focusOffset === 0
  ) {
    focusOffset = anchorOffset = 1
  }

  const anchorParagraph = findNearestParagraph(anchorNode)
  const focusParagraph = findNearestParagraph(focusNode)
  let anchorValue = getOffsetOfParagraph(anchorNode, anchorParagraph) + anchorOffset
  let focusValue = getOffsetOfParagraph(focusNode, focusParagraph) + focusOffset
  ;({ anchorValue, focusValue } = adjustImageOffsets(
    anchorNode,
    anchorOffset,
    focusNode,
    focusOffset,
    anchorParagraph,
    anchorValue,
    focusValue
  ))

  const anchor = { key: anchorParagraph.id, offset: anchorValue }
  const focus = { key: focusParagraph.id, offset: focusValue }
  const result = new Cursor({ anchor, focus })
  if (needFix) selection.setCursorRange(result)
  return result
}

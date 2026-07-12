import Cursor from './cursor'
import { findNearestParagraph, getOffsetOfParagraph } from './dom'
import { adjustImageOffsets } from './cursorImageOffsets'
import { isValidCursorNode } from './cursorNodeValidation'

export { isValidCursorNode }

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
    return new Cursor({ start: null, end: null, anchor: null, focus: null })
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

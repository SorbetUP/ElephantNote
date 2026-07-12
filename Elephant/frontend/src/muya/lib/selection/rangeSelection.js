import { getCursorPositionWithinMarkedText } from './dom'

export const getSelectionHtml = selection => {
  const nativeSelection = selection.doc.getSelection()
  let html = ''
  if (nativeSelection.rangeCount) {
    const container = selection.doc.createElement('div')
    for (let index = 0; index < nativeSelection.rangeCount; index++) {
      container.appendChild(nativeSelection.getRangeAt(index).cloneContents())
    }
    html = container.innerHTML
  }
  return html
}

export const chopHtmlByCursor = (selection, root) => {
  const { left } = selection.getCaretOffsets(root)
  const markedText = root.textContent
  const { type, info } = getCursorPositionWithinMarkedText(markedText, left)
  const pre = markedText.slice(0, left)
  const post = markedText.slice(left)
  switch (type) {
    case 'OUT':
      return { pre, post }
    case 'IN':
      return { pre: `${pre}${info}`, post: `${info}${post}` }
    case 'LEFT':
      return {
        pre: markedText.slice(0, left - info),
        post: markedText.slice(left - info)
      }
    case 'RIGHT':
      return {
        pre: markedText.slice(0, left + info),
        post: markedText.slice(left + info)
      }
  }
}

export const getCaretOffsets = (selection, element, range) => {
  if (!range) range = selection.doc.getSelection().getRangeAt(0)
  const preCaretRange = range.cloneRange()
  const postCaretRange = range.cloneRange()
  preCaretRange.selectNodeContents(element)
  preCaretRange.setEnd(range.endContainer, range.endOffset)
  postCaretRange.selectNodeContents(element)
  postCaretRange.setStart(range.endContainer, range.endOffset)
  return {
    left: preCaretRange.toString().length,
    right: postCaretRange.toString().length
  }
}

export const selectNode = (selection, node) => {
  const range = selection.doc.createRange()
  range.selectNodeContents(node)
  selection.selectRange(range)
}

export const select = (
  selection,
  startNode,
  startOffset,
  endNode,
  endOffset
) => {
  const range = selection.doc.createRange()
  range.setStart(startNode, startOffset)
  if (endNode) range.setEnd(endNode, endOffset)
  else range.collapse(true)
  selection.selectRange(range)
  return range
}

export const setFocus = (selection, focusNode, focusOffset) => {
  selection.doc.getSelection().extend(focusNode, focusOffset)
}

export const clearSelection = (selection, moveCursorToStart) => {
  const nativeSelection = selection.doc.getSelection()
  if (!nativeSelection.rangeCount) return
  if (moveCursorToStart) nativeSelection.collapseToStart()
  else nativeSelection.collapseToEnd()
}

export const getSelectionRange = selection => {
  const nativeSelection = selection.doc.getSelection()
  if (nativeSelection.rangeCount === 0) return null
  return nativeSelection.getRangeAt(0)
}

export const selectRange = (selection, range) => {
  const nativeSelection = selection.doc.getSelection()
  nativeSelection.removeAllRanges()
  nativeSelection.addRange(range)
}

export const getSelectionStart = selection => {
  const node = selection.doc.getSelection().anchorNode
  return node && node.nodeType === 3 ? node.parentNode : node
}

export const getSelectionEnd = selection => {
  const node = selection.doc.getSelection().focusNode
  return node && node.nodeType === 3 ? node.parentNode : node
}

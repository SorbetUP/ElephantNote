import { importSelectionMoveCursorPastAnchor } from './importSelectionAnchors'
import { importSelectionMoveCursorPastBlocks } from './importSelectionBlocks'

const locateSelectionRange = (selection, selectionState, root, favorLaterSelectionAnchor) => {
  const range = selection.doc.createRange()
  range.setStart(root, 0)
  range.collapse(true)
  let node = root
  const nodeStack = []
  let charIndex = 0
  let foundStart = false
  let foundEnd = false
  let trailingImageCount = 0
  let stop = false
  let lastTextNode = null
  const allowEndStart = favorLaterSelectionAnchor ||
    selectionState.startsWithImage ||
    typeof selectionState.emptyBlocksIndex !== 'undefined'

  while (!stop && node) {
    if (node.nodeType > 3) {
      node = nodeStack.pop()
      continue
    }
    if (node.nodeType === 3 && !foundEnd) {
      const nextCharIndex = charIndex + node.length
      if (!foundStart && selectionState.start >= charIndex && selectionState.start <= nextCharIndex) {
        if (allowEndStart || selectionState.start < nextCharIndex) {
          range.setStart(node, selectionState.start - charIndex)
          foundStart = true
        } else lastTextNode = node
      }
      if (foundStart && selectionState.end >= charIndex && selectionState.end <= nextCharIndex) {
        if (!selectionState.trailingImageCount) {
          range.setEnd(node, selectionState.end - charIndex)
          stop = true
        } else foundEnd = true
      }
      charIndex = nextCharIndex
    } else {
      if (selectionState.trailingImageCount && foundEnd) {
        if (node.nodeName.toLowerCase() === 'img') trailingImageCount++
        if (trailingImageCount === selectionState.trailingImageCount) {
          let endIndex = 0
          if (node && node.parentNode) {
            while (node.parentNode.childNodes[endIndex] !== node) endIndex++
            range.setEnd(node.parentNode, endIndex + 1)
          }
          stop = true
        }
      }
      if (!stop && node.nodeType === 1) {
        let index = node.childNodes.length - 1
        while (index >= 0) nodeStack.push(node.childNodes[index--])
      }
    }
    if (!stop) node = nodeStack.pop()
  }

  if (!foundStart && lastTextNode) {
    range.setStart(lastTextNode, lastTextNode.length)
    range.setEnd(lastTextNode, lastTextNode.length)
  }
  return range
}

export const importSelection = (selection, selectionState, root, favorLaterSelectionAnchor) => {
  if (!selectionState || !root) {
    throw new Error('your must provide a [selectionState] and a [root] element')
  }

  let range = locateSelectionRange(selection, selectionState, root, favorLaterSelectionAnchor)
  if (typeof selectionState.emptyBlocksIndex !== 'undefined') {
    range = importSelectionMoveCursorPastBlocks(
      selection,
      root,
      selectionState.emptyBlocksIndex,
      range
    )
  }
  if (favorLaterSelectionAnchor) {
    range = importSelectionMoveCursorPastAnchor(selection, selectionState, range)
  }
  selection.selectRange(range)
}

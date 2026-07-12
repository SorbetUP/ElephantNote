import { traverseUp } from './dom'

export const findMatchingSelectionParent = (
  selection,
  testElementFunction,
  contentWindow
) => {
  const nativeSelection = contentWindow.getSelection()
  if (nativeSelection.rangeCount === 0) return false
  const range = nativeSelection.getRangeAt(0)
  return traverseUp(range.commonAncestorContainer, testElementFunction)
}

export const importSelectionMoveCursorPastAnchor = (
  selection,
  selectionState,
  range
) => {
  const insideAnchor = node => node.nodeName.toLowerCase() === 'a'
  if (
    selectionState.start !== selectionState.end ||
    range.startContainer.nodeType !== 3 ||
    range.startOffset !== range.startContainer.nodeValue.length ||
    !traverseUp(range.startContainer, insideAnchor)
  ) return range

  let previousNode = range.startContainer
  let currentNode = range.startContainer.parentNode
  while (currentNode !== null && currentNode.nodeName.toLowerCase() !== 'a') {
    if (currentNode.childNodes[currentNode.childNodes.length - 1] !== previousNode) {
      currentNode = null
    } else {
      previousNode = currentNode
      currentNode = currentNode.parentNode
    }
  }
  if (!currentNode || currentNode.nodeName.toLowerCase() !== 'a' || !currentNode.parentNode) {
    return range
  }

  let currentNodeIndex = null
  for (let index = 0; currentNodeIndex === null && index < currentNode.parentNode.childNodes.length; index++) {
    if (currentNode.parentNode.childNodes[index] === currentNode) currentNodeIndex = index
  }
  range.setStart(currentNode.parentNode, currentNodeIndex + 1)
  range.collapse(true)
  return range
}

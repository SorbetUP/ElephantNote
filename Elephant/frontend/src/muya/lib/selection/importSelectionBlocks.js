import {
  getClosestBlockContainer,
  getFirstSelectableLeafNode,
  isBlockContainer
} from './dom'

const filterOnlyParentElements = node => {
  return isBlockContainer(node)
    ? NodeFilter.FILTER_ACCEPT
    : NodeFilter.FILTER_SKIP
}

export const importSelectionMoveCursorPastBlocks = (
  selection,
  root,
  index = 1,
  range
) => {
  const treeWalker = selection.doc.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    filterOnlyParentElements,
    false
  )
  const startContainer = range.startContainer
  const startBlock = startContainer.nodeType === 3 && isBlockContainer(startContainer.previousSibling)
    ? startContainer.previousSibling
    : getClosestBlockContainer(startContainer)
  let targetNode
  let currentIndex = 0

  while (treeWalker.nextNode()) {
    if (!targetNode) {
      if (startBlock === treeWalker.currentNode) targetNode = treeWalker.currentNode
    } else {
      targetNode = treeWalker.currentNode
      currentIndex++
      if (currentIndex === index || targetNode.textContent.length > 0) break
    }
  }
  if (!targetNode) targetNode = startBlock
  range.setStart(getFirstSelectableLeafNode(targetNode), 0)
  return range
}

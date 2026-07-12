import {
  getClosestBlockContainer,
  getFirstSelectableLeafNode,
  isBlockContainer,
  traverseUp
} from './dom'

const filterOnlyParentElements = node => {
  return isBlockContainer(node)
    ? NodeFilter.FILTER_ACCEPT
    : NodeFilter.FILTER_SKIP
}

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
    selectionState.start === selectionState.end &&
    range.startContainer.nodeType === 3 &&
    range.startOffset === range.startContainer.nodeValue.length &&
    traverseUp(range.startContainer, insideAnchor)
  ) {
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
    if (
      currentNode !== null &&
      currentNode.nodeName.toLowerCase() === 'a' &&
      currentNode.parentNode
    ) {
      let currentNodeIndex = null
      for (
        let index = 0;
        currentNodeIndex === null && index < currentNode.parentNode.childNodes.length;
        index++
      ) {
        if (currentNode.parentNode.childNodes[index] === currentNode) {
          currentNodeIndex = index
        }
      }
      range.setStart(currentNode.parentNode, currentNodeIndex + 1)
      range.collapse(true)
    }
  }
  return range
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
  const startBlock =
    startContainer.nodeType === 3 && isBlockContainer(startContainer.previousSibling)
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

export const importSelection = (
  selection,
  selectionState,
  root,
  favorLaterSelectionAnchor
) => {
  if (!selectionState || !root) {
    throw new Error('your must provide a [selectionState] and a [root] element')
  }

  let range = selection.doc.createRange()
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
  const allowRangeToStartAtEndOfNode =
    favorLaterSelectionAnchor ||
    selectionState.startsWithImage ||
    typeof selectionState.emptyBlocksIndex !== 'undefined'

  while (!stop && node) {
    if (node.nodeType > 3) {
      node = nodeStack.pop()
      continue
    }
    if (node.nodeType === 3 && !foundEnd) {
      const nextCharIndex = charIndex + node.length
      if (
        !foundStart &&
        selectionState.start >= charIndex &&
        selectionState.start <= nextCharIndex
      ) {
        if (allowRangeToStartAtEndOfNode || selectionState.start < nextCharIndex) {
          range.setStart(node, selectionState.start - charIndex)
          foundStart = true
        } else {
          lastTextNode = node
        }
      }
      if (
        foundStart &&
        selectionState.end >= charIndex &&
        selectionState.end <= nextCharIndex
      ) {
        if (!selectionState.trailingImageCount) {
          range.setEnd(node, selectionState.end - charIndex)
          stop = true
        } else {
          foundEnd = true
        }
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
        while (index >= 0) {
          nodeStack.push(node.childNodes[index])
          index--
        }
      }
    }
    if (!stop) node = nodeStack.pop()
  }

  if (!foundStart && lastTextNode) {
    range.setStart(lastTextNode, lastTextNode.length)
    range.setEnd(lastTextNode, lastTextNode.length)
  }
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

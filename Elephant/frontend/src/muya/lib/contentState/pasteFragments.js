import { HAS_TEXT_BLOCK_REG } from '../config'
import { LIST_REG } from './pasteChecks'

const getLastBlock = blocks => {
  const lastBlock = blocks[blocks.length - 1]
  if (
    lastBlock.children.length === 0 &&
    HAS_TEXT_BLOCK_REG.test(lastBlock.type)
  ) {
    return lastBlock
  }
  if (lastBlock.editable === false) {
    return getLastBlock(blocks[blocks.length - 2].children)
  }
  return getLastBlock(lastBlock.children)
}

const normalizeListLooseness = (originList, fragment) => {
  const targetLoose = fragment.children[0].isLooseListItem
  const originLoose = originList.children[0].isLooseListItem
  if (targetLoose !== originLoose) {
    if (!targetLoose) {
      fragment.children.forEach(item => (item.isLooseListItem = true))
    } else {
      originList.children.forEach(item => (item.isLooseListItem = true))
    }
  }
}

const mergeListFragment = (
  contentState,
  firstFragment,
  tailFragments,
  startBlock,
  parent
) => {
  const listItems = firstFragment.children
  const firstListItem = listItems[0]
  const itemChildren = firstListItem.children
  const originListItem = contentState.getParent(parent)
  const originList = contentState.getParent(originListItem)
  normalizeListLooseness(originList, firstFragment)

  if (itemChildren[0].type === 'p') {
    startBlock.text += itemChildren[0].children[0].text
    const tail = itemChildren.slice(1)
    if (tail.length) {
      tail.forEach(child => contentState.appendChild(originListItem, child))
    }
    const listTail = listItems.slice(1)
    if (listTail.length) {
      listTail.forEach(item => contentState.appendChild(originList, item))
    }
  } else {
    listItems.forEach(item => contentState.appendChild(originList, item))
  }

  let target = originList
  tailFragments.forEach(block => {
    contentState.insertAfter(block, target)
    target = block
  })
}

const mergeTextFragment = (
  contentState,
  firstFragment,
  tailFragments,
  startBlock,
  parent
) => {
  const text = firstFragment.children[0].text
  const lines = text.split('\n')
  let target = parent
  if (parent.headingStyle === 'atx') {
    startBlock.text += lines[0]
    if (lines.length > 1) {
      const paragraph = contentState.createBlockP(lines.slice(1).join('\n'))
      contentState.insertAfter(paragraph, parent)
      target = paragraph
    }
  } else {
    startBlock.text += text
  }
  tailFragments.forEach(block => {
    contentState.insertAfter(block, target)
    target = block
  })
}

const insertFragments = (
  contentState,
  pasteType,
  stateFragments,
  startBlock,
  parent
) => {
  const firstFragment = stateFragments[0]
  const tailFragments = stateFragments.slice(1)
  switch (pasteType) {
    case 'MERGE':
      if (LIST_REG.test(firstFragment.type)) {
        mergeListFragment(
          contentState,
          firstFragment,
          tailFragments,
          startBlock,
          parent
        )
      } else if (
        firstFragment.type === 'p' ||
        /^h\d/.test(firstFragment.type)
      ) {
        mergeTextFragment(
          contentState,
          firstFragment,
          tailFragments,
          startBlock,
          parent
        )
      }
      break
    case 'NEWLINE': {
      let target = parent
      stateFragments.forEach(block => {
        contentState.insertAfter(block, target)
        target = block
      })
      if (startBlock.text.length === 0) contentState.removeBlock(parent)
      break
    }
    default:
      throw new Error('unknown paste type')
  }
}

export default function pasteFragments(
  contentState,
  stateFragments,
  start,
  end,
  startBlock,
  endBlock,
  parent
) {
  const cacheText = endBlock.text.substring(end.offset)
  startBlock.text = startBlock.text.substring(0, start.offset)
  const firstFragment = stateFragments[0]
  const pasteType = contentState.checkPasteType(startBlock, firstFragment)
  const lastBlock = getLastBlock(stateFragments)
  let key = lastBlock.key
  let offset = lastBlock.text.length
  lastBlock.text += cacheText

  insertFragments(
    contentState,
    pasteType,
    stateFragments,
    startBlock,
    parent
  )

  let cursorBlock = contentState.getBlock(key)
  if (!cursorBlock) {
    key = startBlock.key
    offset = startBlock.text.length - cacheText.length
    cursorBlock = startBlock
  }
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  contentState.checkInlineUpdate(cursorBlock)
  contentState.partialRender()
  contentState.muya.dispatchSelectionChange()
  contentState.muya.dispatchSelectionFormats()
  return contentState.muya.dispatchChange()
}

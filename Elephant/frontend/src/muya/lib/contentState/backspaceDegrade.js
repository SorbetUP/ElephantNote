const appendFollowingItems = (contentState, block, parent, target) => {
  if (!block.nextSibling) return
  const nestedList =
    parent.type === 'ul'
      ? contentState.createBlock('ul', { listType: 'bullet' })
      : contentState.createBlock('ol', { listType: 'order' })
  let probe = contentState.getBlock(block.nextSibling)
  const addedChildKeys = []
  while (probe && probe.parent && probe.parent === parent.key) {
    const nextSibling = probe.nextSibling
    contentState.appendChild(nestedList, probe)
    addedChildKeys.push(probe.key)
    probe = contentState.getBlock(nextSibling)
  }
  if (nestedList.children.length > 0) {
    parent.children = parent.children.filter(
      child => !addedChildKeys.includes(child.key)
    )
    target(nestedList)
  }
}

const degradeListItem = (contentState, context) => {
  let { block, parent, key } = context
  block = contentState.getParent(block)
  parent = contentState.getBlock(block.parent)
  const grandpa = contentState.getParent(parent)
  const greatGrandpa = contentState.getParent(grandpa)
  let newBlock

  if (greatGrandpa && (greatGrandpa.type === 'ul' || greatGrandpa.type === 'ol')) {
    if (block.listItemType === 'task') {
      const { checked } = parent.children[0]
      newBlock = contentState.createTaskItemBlock(null, checked)
      newBlock.children[1].children[0].text += block.children[1].children[0].text
      key = newBlock.children[1].key
    } else {
      newBlock = contentState.createBlockLi()
      newBlock.listItemType = parent.listItemType
      newBlock.bulletMarkerOrDelimiter = parent.bulletMarkerOrDelimiter
      newBlock.children[0].children[0].text += block.children[0].children[0].text
      key = newBlock.children[0].key
    }
    contentState.insertAfter(newBlock, grandpa)
    block.children.forEach(child => {
      if (child.type === 'ul' || child.type === 'ol') {
        contentState.appendChild(newBlock, child)
      }
    })
    appendFollowingItems(contentState, block, parent, nestedList => {
      contentState.appendChild(newBlock, nestedList)
    })
    contentState.removeBlock(block, contentState.blocks, true)
  } else {
    newBlock = contentState.createBlockP()
    if (block.listItemType === 'task') {
      newBlock.children[0].text += block.children[1].children[0].text
    } else {
      newBlock.children[0].text += block.children[0].children[0].text
    }
    key = newBlock.children[0].key
    contentState.insertAfter(newBlock, parent)
    let previous = newBlock
    block.children.forEach(child => {
      if (child.type === 'ul' || child.type === 'ol') {
        contentState.insertAfter(child, previous)
        previous = child
      }
    })
    appendFollowingItems(contentState, block, parent, nestedList => {
      contentState.insertAfter(nestedList, previous)
    })
    contentState.removeBlock(block)
  }
  if (parent.children.length === 0) contentState.removeBlock(parent)
  return { key, block, parent }
}

export default function handleBackspaceDegrade(contentState, event, context) {
  const { inlineDegrade } = context
  if (!inlineDegrade) return { handled: false, context }
  event.preventDefault()
  let { block, parent } = context
  if (block.type === 'span') {
    block = contentState.getParent(block)
    parent = contentState.getParent(parent)
  }

  let key = block.type === 'p' ? block.children[0].key : block.key
  const offset = 0
  switch (inlineDegrade.type) {
    case 'STOP':
      break
    case 'OL':
    case 'LI':
      ;({ key, block, parent } = degradeListItem(contentState, {
        block,
        parent,
        key
      }))
      break
    case 'BLOCKQUOTE':
      if (inlineDegrade.info === 'REPLACEMENT') {
        contentState.insertBefore(block, parent)
        contentState.removeBlock(parent)
      } else if (inlineDegrade.info === 'INSERT_BEFORE') {
        contentState.removeBlock(block)
        contentState.insertBefore(block, parent)
      }
      break
  }

  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  if (inlineDegrade.type !== 'STOP') contentState.partialRender()
  return { handled: true, value: undefined }
}

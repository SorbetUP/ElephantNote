const moveFollowingListItems = (contentState, block, parent, target) => {
  if (!block.nextSibling) return
  const list = parent.type === 'ul'
    ? contentState.createBlock('ul')
    : contentState.createBlock('ol')
  let probe = contentState.getBlock(block.nextSibling)
  const movedKeys = []
  while (probe && probe.parent && probe.parent === parent.key) {
    const nextSibling = probe.nextSibling
    contentState.appendChild(list, probe)
    movedKeys.push(probe.key)
    probe = contentState.getBlock(nextSibling)
  }
  if (list.children.length > 0) {
    parent.children = parent.children.filter(
      child => !movedKeys.includes(child.key)
    )
    target(list)
  }
}

const exitNestedList = (contentState, block, parent) => {
  const grandParent = contentState.getParent(parent)
  const greatGrandParent = contentState.getParent(grandParent)
  let newBlock
  if (
    greatGrandParent &&
    (greatGrandParent.type === 'ul' || greatGrandParent.type === 'ol')
  ) {
    if (block.listItemType === 'task') {
      const { checked } = parent.children[0]
      newBlock = contentState.createTaskItemBlock(null, checked)
    } else {
      newBlock = contentState.createBlockLi()
      newBlock.listItemType = parent.listItemType
      newBlock.bulletMarkerOrDelimiter = parent.bulletMarkerOrDelimiter
    }
    newBlock.isLooseListItem = parent.isLooseListItem
    contentState.insertAfter(newBlock, grandParent)
    block.children.forEach(child => {
      if (child.type === 'ul' || child.type === 'ol') {
        contentState.appendChild(newBlock, child)
      }
    })
    moveFollowingListItems(contentState, block, parent, list => {
      contentState.appendChild(newBlock, list)
    })
    contentState.removeBlock(block, contentState.blocks, true)
    return newBlock.listItemType === 'task'
      ? newBlock.children[1]
      : newBlock.children[0]
  }

  newBlock = contentState.createBlockP()
  contentState.insertAfter(newBlock, parent)
  let previous = newBlock
  block.children.forEach(child => {
    if (child.type === 'ul' || child.type === 'ol') {
      contentState.insertAfter(child, previous)
      previous = child
    }
  })
  moveFollowingListItems(contentState, block, parent, list => {
    contentState.insertAfter(list, previous)
  })
  contentState.removeBlock(block, contentState.blocks, true)
  return newBlock
}

const enterEmptyParagraph = ContentState => {
  ContentState.prototype.enterInEmptyParagraph = function(block) {
    if (block.type === 'span') block = this.getParent(block)
    const parent = this.getParent(block)
    let newBlock = null

    if (parent && /blockquote/.test(parent.type)) {
      newBlock = this.createBlockP()
      if (this.isOnlyChild(block)) {
        this.insertAfter(newBlock, parent)
        this.removeBlock(parent)
      } else if (this.isFirstChild(block)) {
        this.insertBefore(newBlock, parent)
      } else if (this.isLastChild(block)) {
        this.insertAfter(newBlock, parent)
      } else {
        this.chopBlock(block)
        this.insertAfter(newBlock, parent)
      }
      this.removeBlock(block)
    } else if (parent && (parent.type === 'ul' || parent.type === 'ol')) {
      newBlock = exitNestedList(this, block, parent)
      if (parent.children.length === 0) this.removeBlock(parent)
    } else {
      newBlock = this.createBlockP()
      if (block.type === 'li') {
        this.insertAfter(newBlock, parent)
        this.removeBlock(block)
      } else {
        this.insertAfter(newBlock, block)
      }
    }

    const { key } = newBlock.children[0]
    const offset = 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    return this.partialRender()
  }
}

export default enterEmptyParagraph

const convertExistingList = (
  contentState,
  listBlock,
  blockType,
  listType
) => {
  const {
    orderListDelimiter,
    bulletListMarker
  } = contentState.muya.options
  if (listType === listBlock.listType) {
    const listItems = listBlock.children
    listItems.forEach(listItem => {
      listItem.children.forEach(itemParagraph => {
        if (itemParagraph.type !== 'input') {
          contentState.insertBefore(itemParagraph, listBlock)
        }
      })
    })
    contentState.removeBlock(listBlock)
    return true
  }

  if (listBlock.listType === 'task') {
    listBlock.children.forEach(item => {
      const inputBlock = item.children[0]
      if (inputBlock) contentState.removeBlock(inputBlock)
    })
  }
  const oldListType = listBlock.listType
  listBlock.type = blockType
  listBlock.listType = listType
  listBlock.children.forEach(block => (block.listItemType = listType))

  if (listType === 'order') {
    listBlock.start = listBlock.start || 1
    listBlock.children.forEach(block => {
      block.bulletMarkerOrDelimiter = orderListDelimiter
    })
  }
  if (
    (listType === 'bullet' && oldListType === 'order') ||
    (listType === 'task' && oldListType === 'order')
  ) {
    delete listBlock.start
    listBlock.children.forEach(block => {
      block.bulletMarkerOrDelimiter = bulletListMarker
    })
  }
  if (listType === 'task') {
    listBlock.children.forEach(item => {
      const checkbox = contentState.createBlock('input')
      checkbox.checked = false
      contentState.insertBefore(checkbox, item.children[0])
    })
  }
  return false
}

const wrapSelectedBlocks = (
  contentState,
  listType,
  parent,
  startIndex,
  endIndex
) => {
  const children = parent ? parent.children : contentState.blocks
  const referBlock = children[endIndex]
  const listWrapper = contentState.createBlock(
    listType === 'order' ? 'ol' : 'ul'
  )
  listWrapper.listType = listType
  if (listType === 'order') listWrapper.start = 1

  children.slice(startIndex, endIndex + 1).forEach(child => {
    if (child !== referBlock) {
      contentState.removeBlock(child, children)
    } else {
      contentState.insertAfter(listWrapper, child)
      contentState.removeBlock(child, children)
    }
    const listItem = contentState.createBlock('li')
    listItem.listItemType = listType
    listItem.isLooseListItem = contentState.muya.options.preferLooseListItem
    contentState.appendChild(listWrapper, listItem)
    if (listType === 'task') {
      const checkbox = contentState.createBlock('input')
      checkbox.checked = false
      contentState.appendChild(listItem, checkbox)
    }
    contentState.appendChild(listItem, child)
  })
}

const paragraphLists = ContentState => {
  ContentState.prototype.handleListMenu = function(paraType, insertMode) {
    const { start, end, affiliation } = this.selectionChange(this.cursor)
    const [blockType, listType] = paraType.split('-')
    const isListed = affiliation
      .slice(0, 3)
      .filter(block => /ul|ol/.test(block.type))

    if (isListed.length && !insertMode) {
      if (convertExistingList(this, isListed[0], blockType, listType)) {
        return
      }
    } else if (
      start.key === end.key ||
      (start.block.parent && start.block.parent === end.block.parent)
    ) {
      const block = this.getBlock(start.key)
      const paragraph = this.getBlock(block.parent)
      if (listType === 'task') {
        const listItemParagraph = this.updateList(
          paragraph,
          'bullet',
          undefined,
          block
        )
        setTimeout(() => {
          this.updateTaskListItem(listItemParagraph, listType)
          this.partialRender()
          this.muya.dispatchSelectionChange()
          this.muya.dispatchSelectionFormats()
          this.muya.dispatchChange()
        })
        return false
      }
      this.updateList(paragraph, listType, undefined, block)
    } else {
      const { parent, startIndex, endIndex } = this.getCommonParent()
      wrapSelectedBlocks(this, listType, parent, startIndex, endIndex)
    }
    return true
  }

  ContentState.prototype.handleLooseListItem = function() {
    const { affiliation } = this.selectionChange(this.cursor)
    let listContainer = []
    if (affiliation.length >= 1 && /ul|ol/.test(affiliation[0].type)) {
      listContainer = affiliation[0].children
    } else if (affiliation.length >= 3 && affiliation[1].type === 'li') {
      listContainer = affiliation[2].children
    }
    if (listContainer.length > 0) {
      for (const block of listContainer) {
        block.isLooseListItem = !block.isLooseListItem
      }
      this.partialRender()
    }
  }
}

export default paragraphLists

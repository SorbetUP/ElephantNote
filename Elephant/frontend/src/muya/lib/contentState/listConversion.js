export const convertExistingList = (
  contentState,
  listBlock,
  blockType,
  listType
) => {
  const { orderListDelimiter, bulletListMarker } = contentState.muya.options
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

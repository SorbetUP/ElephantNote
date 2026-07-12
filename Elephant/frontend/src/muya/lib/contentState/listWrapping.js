export const wrapSelectedBlocks = (
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

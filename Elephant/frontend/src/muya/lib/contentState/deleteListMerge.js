const preserveListRemainder = (contentState, parent, listBlock) => {
  let insertAfterThis = listBlock
  parent.children.forEach(child => {
    if (/ul|ol/.test(child.type)) {
      contentState.insertAfter(child, insertAfterThis)
      insertAfterThis = child
    }
  })

  let probe = contentState.getBlock(parent.nextSibling)
  const listItemToBeSaved = []
  while (probe && probe.type === 'li') {
    listItemToBeSaved.push(probe)
    probe = contentState.getBlock(probe.nextSibling)
  }
  if (listItemToBeSaved.length > 0) {
    const newULBlock = contentState.createBlock('ul')
    listItemToBeSaved.forEach(li => contentState.appendChild(newULBlock, li))
    contentState.insertAfter(newULBlock, insertAfterThis)
  }
  contentState.removeBlock(listBlock)
}

export const removeMergedBlocks = (contentState, blocks) => {
  blocks.forEach(block => {
    const parent = contentState.getParent(block)
    if (parent && parent.type === 'li') {
      preserveListRemainder(contentState, parent, contentState.getParent(parent))
    } else {
      contentState.removeBlock(block)
    }
  })
}

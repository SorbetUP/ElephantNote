export const editTableColumn = (
  contentState,
  { location, action, block, cellBlock, currentRow, thead, tbody, columnIndex }
) => {
  let cursorBlock
  const rows = [
    ...(thead ? thead.children : []),
    ...(tbody ? tbody.children : [])
  ]

  if (action === 'insert') {
    rows.forEach(tableRow => {
      const targetCell = tableRow.children[columnIndex]
      const cell = contentState.createBlock(targetCell.type, { align: '' })
      const cellContent = contentState.createBlock('span', {
        functionType: 'cellContent'
      })
      contentState.appendChild(cell, cellContent)
      if (location === 'left') contentState.insertBefore(cell, targetCell)
      else contentState.insertAfter(cell, targetCell)
      tableRow.children.forEach((child, index) => {
        child.column = index
      })
    })
    cursorBlock = location === 'left'
      ? contentState.getPreSibling(cellBlock).children[0]
      : contentState.getNextSibling(cellBlock).children[0]
  } else {
    if (currentRow.children.length <= 1) return { stopped: true }
    rows.forEach(tableRow => {
      const targetCell = tableRow.children[columnIndex]
      const removeCell =
        location === 'left'
          ? contentState.getPreSibling(targetCell)
          : location === 'current'
            ? targetCell
            : contentState.getNextSibling(targetCell)
      if (removeCell === cellBlock) {
        cursorBlock =
          columnIndex === currentRow.children.length - 1
            ? contentState.findPreBlockInLocation(block)
            : contentState.findNextBlockInLocation(block)
      }
      if (removeCell) contentState.removeBlock(removeCell)
      tableRow.children.forEach((child, index) => {
        child.column = index
      })
    })
  }

  return { cursorBlock, stopped: false }
}

export const editTableRow = (
  contentState,
  { location, action, cellBlock, currentRow, table, thead, tbody, columnIndex }
) => {
  let cursorBlock
  if (action === 'insert') {
    const newRow =
      location === 'previous' && cellBlock.type === 'th'
        ? contentState.createRow(currentRow, true)
        : contentState.createRow(currentRow, false)
    if (location === 'previous') {
      contentState.insertBefore(newRow, currentRow)
      if (cellBlock.type === 'th') {
        contentState.removeBlock(currentRow)
        currentRow.children.forEach(cell => (cell.type = 'td'))
        const firstRow = tbody.children[0]
        contentState.insertBefore(currentRow, firstRow)
      }
    } else if (cellBlock.type === 'th') {
      const firstRow = tbody.children[0]
      contentState.insertBefore(newRow, firstRow)
    } else {
      contentState.insertAfter(newRow, currentRow)
    }
    cursorBlock = newRow.children[columnIndex].children[0]
  } else if (location === 'previous') {
    if (cellBlock.type === 'th') return { stopped: true }
    if (!currentRow.preSibling) {
      const headRow = thead.children[0]
      if (!currentRow.nextSibling) return { stopped: true }
      contentState.removeBlock(headRow)
      contentState.removeBlock(currentRow)
      currentRow.children.forEach(cell => (cell.type = 'th'))
      contentState.appendChild(thead, currentRow)
    } else {
      contentState.removeBlock(contentState.getPreSibling(currentRow))
    }
  } else if (location === 'current') {
    if (tbody.children.length <= 0) return { stopped: true }
    if (cellBlock.type === 'th') {
      const firstRow = tbody.children[0]
      contentState.removeBlock(currentRow)
      contentState.removeBlock(firstRow)
      contentState.appendChild(thead, firstRow)
      firstRow.children.forEach(cell => (cell.type = 'th'))
      cursorBlock = firstRow.children[columnIndex].children[0]
    }
    if (cellBlock.type === 'td') {
      const nextOrPreviousRow =
        contentState.getNextSibling(currentRow) || contentState.getPreSibling(currentRow)
      cursorBlock = nextOrPreviousRow
        ? nextOrPreviousRow.children[columnIndex].children[0]
        : thead.children[0].children[columnIndex].children[0]
      contentState.removeBlock(currentRow)
    }
  } else if (cellBlock.type === 'th') {
    if (tbody && tbody.children.length >= 2) {
      contentState.removeBlock(tbody.children[0])
    } else {
      return { stopped: true }
    }
  } else {
    const nextRow = contentState.getNextSibling(currentRow)
    if (nextRow) contentState.removeBlock(nextRow)
  }

  return { cursorBlock, stopped: false }
}

export function findNextRowCell(cell) {
  if (cell.functionType !== 'cellContent') {
    throw new Error(`block with type ${cell && cell.type} is not a table cell`)
  }
  const thOrTd = this.getParent(cell)
  const row = this.closest(cell, 'tr')
  const rowContainer = this.closest(row, /thead|tbody/)
  const column = row.children.indexOf(thOrTd)
  if (rowContainer.type === 'thead') {
    const tbody = this.getNextSibling(rowContainer)
    if (tbody && tbody.children.length) {
      return tbody.children[0].children[column].children[0]
    }
  } else if (rowContainer.type === 'tbody') {
    const nextRow = this.getNextSibling(row)
    if (nextRow) {
      return nextRow.children[column].children[0]
    }
  }
  return null
}

export function findPrevRowCell(cell) {
  if (cell.functionType !== 'cellContent') {
    throw new Error(`block with type ${cell && cell.type} is not a table cell`)
  }
  const thOrTd = this.getParent(cell)
  const row = this.closest(cell, 'tr')
  const rowContainer = this.getParent(row)
  const rowIndex = rowContainer.children.indexOf(row)
  const column = row.children.indexOf(thOrTd)
  if (rowContainer.type === 'tbody') {
    if (rowIndex === 0 && rowContainer.preSibling) {
      const thead = this.getPreSibling(rowContainer)
      return thead.children[0].children[column].children[0]
    } else if (rowIndex > 0) {
      return this.getPreSibling(row).children[column].children[0]
    }
    return null
  }
  return null
}

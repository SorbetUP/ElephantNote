const tableCellSelectionMutations = ContentState => {
  ContentState.prototype.deleteSelectedTableCells = function(isCut = false) {
    const { tableId, cells } = this.selectedTableCells
    const tableBlock = this.getBlock(tableId)
    const { row, column } = tableBlock
    const rows = new Set()
    let lastColumn = null
    let isSameColumn = true
    let hasContent = false

    for (const cell of cells) {
      const cellBlock = this.getBlock(cell.key)
      const rowBlock = this.getParent(cellBlock)
      const { column: cellColumn } = cellBlock
      rows.add(rowBlock)
      if (cellBlock.children[0].text) hasContent = true
      if (typeof lastColumn === 'object') {
        lastColumn = cellColumn
      } else if (cellColumn !== lastColumn) {
        isSameColumn = false
      }
      cellBlock.children[0].text = ''
    }

    const isOneColumnSelected = rows.size === +row + 1 && isSameColumn
    const isOneRowSelected = cells.length === +column + 1 && rows.size === 1
    const isWholeTableSelected =
      rows.size === +row + 1 && cells.length === (+row + 1) * (+column + 1)

    if (isCut && isWholeTableSelected) {
      this.selectedTableCells = null
      return this.deleteParagraph(tableId)
    }

    if (hasContent) {
      this.singleRender(tableBlock, false)
      return this.muya.dispatchChange()
    }

    const cellKey = cells[0].key
    const cellBlock = this.getBlock(cellKey)
    const cellContentKey = cellBlock.children[0].key
    this.selectedTableCells = null
    if (isOneColumnSelected) {
      return this.editTable(
        { location: 'current', action: 'remove', target: 'column' },
        cellContentKey
      )
    } else if (isOneRowSelected) {
      return this.editTable(
        { location: 'current', action: 'remove', target: 'row' },
        cellContentKey
      )
    } else if (isWholeTableSelected) {
      return this.deleteParagraph(tableId)
    }
  }

  ContentState.prototype.isSingleCellSelected = function() {
    const { selectedTableCells } = this
    if (selectedTableCells && selectedTableCells.cells.length === 1) {
      return this.getBlock(selectedTableCells.cells[0].key)
    }
    return null
  }

  ContentState.prototype.isWholeTableSelected = function() {
    const { selectedTableCells } = this
    const table = selectedTableCells ? this.getBlock(selectedTableCells.tableId) : {}
    const { row, column } = table
    if (
      selectedTableCells &&
      table &&
      selectedTableCells.cells.length === (+row + 1) * (+column + 1)
    ) {
      return table
    }
    return null
  }
}

export default tableCellSelectionMutations

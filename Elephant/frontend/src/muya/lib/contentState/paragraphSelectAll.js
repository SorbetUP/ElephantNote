const selectSingleTableCell = (contentState, block) => {
  const table = contentState.closest(block, 'table')
  const cellBlock = contentState.closest(block, /th|td/)
  contentState.selectedTableCells = {
    tableId: table.key,
    row: 1,
    column: 1,
    cells: [
      {
        key: cellBlock.key,
        text: cellBlock.children[0].text,
        top: true,
        right: true,
        bottom: true,
        left: true
      }
    ]
  }
  contentState.singleRender(table, false)
  return contentState.muya.eventCenter.dispatch('muya-format-picker', {
    reference: null
  })
}

const paragraphSelectAll = ContentState => {
  ContentState.prototype.isSelectAll = function() {
    const firstTextBlock = this.getFirstBlock()
    const lastTextBlock = this.getLastBlock()
    const { start, end } = this.cursor
    return (
      firstTextBlock.key === start.key &&
      start.offset === 0 &&
      lastTextBlock.key === end.key &&
      end.offset === lastTextBlock.text.length &&
      !this.muya.keyboard.isComposed
    )
  }

  ContentState.prototype.selectAllContent = function() {
    const firstTextBlock = this.getFirstBlock()
    const lastTextBlock = this.getLastBlock()
    this.cursor = {
      start: { key: firstTextBlock.key, offset: 0 },
      end: {
        key: lastTextBlock.key,
        offset: lastTextBlock.text.length
      },
      isEdit: false
    }
    return this.render()
  }

  ContentState.prototype.selectAll = function() {
    const mayBeCell = this.isSingleCellSelected()
    const mayBeTable = this.isWholeTableSelected()
    if (mayBeTable) {
      this.selectedTableCells = null
      return this.selectAllContent()
    }
    if (mayBeCell) {
      const table = this.closest(mayBeCell, 'table')
      if (table) return this.selectTable(table)
    }

    const { start, end } = this.cursor
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    if (
      startBlock.functionType === 'cellContent' &&
      endBlock.functionType === 'cellContent'
    ) {
      if (start.key === end.key) {
        return selectSingleTableCell(this, startBlock)
      }
      const startTable = this.closest(startBlock, 'table')
      const endTable = this.closest(endBlock, 'table')
      if (!startTable || !endTable) {
        console.error('No table found or invalid type.')
        return
      }
      if (startTable.key !== endTable.key) return
      return this.selectTable(startTable)
    }

    if (
      startBlock.type === 'span' &&
      startBlock.functionType === 'codeContent'
    ) {
      const { key } = startBlock
      this.cursor = {
        start: { key, offset: 0 },
        end: { key, offset: startBlock.text.length },
        isEdit: false
      }
      return this.partialRender()
    }
    if (
      startBlock.type === 'span' &&
      startBlock.functionType === 'languageInput'
    ) {
      const { key } = startBlock
      this.cursor = {
        start: { key, offset: 0 },
        end: { key, offset: startBlock.text.length },
        isEdit: false
      }
      return this.partialRender()
    }
    return this.selectAllContent()
  }
}

export default paragraphSelectAll

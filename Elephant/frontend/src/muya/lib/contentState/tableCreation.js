const tableCreation = ContentState => {
  ContentState.prototype.createTableInFigure = function(
    { rows, columns },
    tableContents = []
  ) {
    const table = this.createBlock('table', {
      row: rows - 1,
      column: columns - 1
    })
    const tHead = this.createBlock('thead')
    const tBody = this.createBlock('tbody')

    for (let i = 0; i < rows; i++) {
      const rowBlock = this.createBlock('tr')
      i === 0 ? this.appendChild(tHead, rowBlock) : this.appendChild(tBody, rowBlock)
      const rowContents = tableContents[i]
      for (let j = 0; j < columns; j++) {
        const cell = this.createBlock(i === 0 ? 'th' : 'td', {
          align: rowContents ? rowContents[j].align : '',
          column: j
        })
        const cellContent = this.createBlock('span', {
          text: rowContents ? rowContents[j].text : '',
          functionType: 'cellContent'
        })
        this.appendChild(cell, cellContent)
        this.appendChild(rowBlock, cell)
      }
    }

    this.appendChild(table, tHead)
    if (tBody.children.length) this.appendChild(table, tBody)
    return table
  }

  ContentState.prototype.createFigure = function({ rows, columns }) {
    const { end } = this.cursor
    const table = this.createTableInFigure({ rows, columns })
    const figureBlock = this.createBlock('figure', { functionType: 'table' })
    const endBlock = this.getBlock(end.key)
    const anchor = this.getAnchor(endBlock)
    if (!anchor) return

    this.insertAfter(figureBlock, anchor)
    if (/p|h\d/.test(anchor.type) && !endBlock.text) this.removeBlock(anchor)
    this.appendChild(figureBlock, table)
    const { key } = this.firstInDescendant(table)
    const offset = 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    this.partialRender()
  }

  ContentState.prototype.createTable = function(tableChecker) {
    this.createFigure(tableChecker)
    this.muya.dispatchSelectionChange()
    this.muya.dispatchSelectionFormats()
    this.muya.dispatchChange()
  }

  ContentState.prototype.initTable = function(block) {
    const { text } = block.children[0]
    const rowHeader = []
    const len = text.length
    for (let i = 0; i < len; i++) {
      const char = text[i]
      if (/^[^|]$/.test(char)) rowHeader[rowHeader.length - 1] += char
      if (/\\/.test(char)) rowHeader[rowHeader.length - 1] += text[++i]
      if (/\|/.test(char) && i !== len - 1) rowHeader.push('')
    }

    const table = this.createTableInFigure(
      { rows: 2, columns: rowHeader.length },
      [rowHeader.map(text => ({ text, align: '' }))]
    )
    block.type = 'figure'
    block.text = ''
    block.children = []
    block.functionType = 'table'
    this.appendChild(block, table)
    return this.firstInDescendant(table.children[1])
  }
}

export default tableCreation

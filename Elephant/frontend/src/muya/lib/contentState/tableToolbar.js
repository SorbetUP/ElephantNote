import { getParagraphReference } from '../utils'

const resizeTable = (contentState, table, row, column) => {
  const { row: oldRow, column: oldColumn } = table
  let tBody = table.children[1]
  const tHead = table.children[0]
  const headerRow = tHead.children[0]
  const bodyRows = tBody ? tBody.children : []

  if (column > oldColumn) {
    for (let i = oldColumn + 1; i <= column; i++) {
      const th = contentState.createBlock('th', { column: i, align: '' })
      const thContent = contentState.createBlock('span', {
        functionType: 'cellContent'
      })
      contentState.appendChild(th, thContent)
      contentState.appendChild(headerRow, th)
      bodyRows.forEach(bodyRow => {
        const td = contentState.createBlock('td', { column: i, align: '' })
        const tdContent = contentState.createBlock('span', {
          functionType: 'cellContent'
        })
        contentState.appendChild(td, tdContent)
        contentState.appendChild(bodyRow, td)
      })
    }
  } else if (column < oldColumn) {
    const rows = [headerRow, ...bodyRows]
    rows.forEach(rowBlock => {
      while (rowBlock.children.length > column + 1) {
        contentState.removeBlock(rowBlock.children[rowBlock.children.length - 1])
      }
    })
  }

  if (row < oldRow && tBody) {
    while (tBody.children.length > row) {
      contentState.removeBlock(tBody.children[tBody.children.length - 1])
    }
    if (tBody.children.length === 0) contentState.removeBlock(tBody)
  } else if (row > oldRow) {
    if (!tBody) {
      tBody = contentState.createBlock('tbody')
      contentState.appendChild(table, tBody)
    }
    const oneHeaderRow = tHead.children[0]
    for (let i = oldRow + 1; i <= row; i++) {
      contentState.appendChild(tBody, contentState.createRow(oneHeaderRow, false))
    }
  }

  Object.assign(table, { row, column })
  const cursorBlock = contentState.firstInDescendant(headerRow)
  const key = cursorBlock.key
  const offset = cursorBlock.text.length
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  contentState.muya.eventCenter.dispatch('stateChange')
  contentState.partialRender()
}

const tableToolbar = ContentState => {
  ContentState.prototype.tableToolBarClick = function(type) {
    const { start: { key } } = this.cursor
    const block = this.getBlock(key)
    const parentBlock = this.getParent(block)
    if (block.functionType !== 'cellContent') throw new Error('table is not active')

    const { column, align } = parentBlock
    const table = this.closest(block, 'table')
    const figure = this.getBlock(table.parent)
    switch (type) {
      case 'left':
      case 'center':
      case 'right': {
        const newAlign = align === type ? '' : type
        table.children.forEach(rowContainer => {
          rowContainer.children.forEach(row => {
            row.children[column].align = newAlign
          })
        })
        this.muya.eventCenter.dispatch('stateChange')
        this.partialRender()
        break
      }
      case 'delete': {
        const newLine = this.createBlock('span')
        figure.children = []
        this.appendChild(figure, newLine)
        figure.type = 'p'
        figure.text = ''
        const key = newLine.key
        const offset = 0
        this.cursor = {
          start: { key, offset },
          end: { key, offset },
          isEdit: true
        }
        this.muya.eventCenter.dispatch('stateChange')
        this.partialRender()
        break
      }
      case 'table': {
        const { eventCenter } = this.muya
        const tableElement = document.querySelector(`#${figure.key} [data-label=table]`)
        const { row = 1, column = 1 } = table
        const reference = getParagraphReference(tableElement, tableElement.id)
        eventCenter.dispatch(
          'muya-table-picker',
          { row, column },
          reference,
          (nextRow, nextColumn) => resizeTable(this, table, nextRow, nextColumn)
        )
      }
    }
  }
}

export default tableToolbar

import { editTableColumn } from './tableEditColumns'
import { editTableRow } from './tableEditRows'

const tableEdit = ContentState => {
  ContentState.prototype.editTable = function(
    { location, action, target },
    cellContentKey
  ) {
    let block
    let start
    let end
    if (cellContentKey) {
      block = this.getBlock(cellContentKey)
    } else {
      ;({ start, end } = this.cursor)
      if (start.key !== end.key) {
        throw new Error('Cursor is not in one block, can not editTable')
      }
      block = this.getBlock(start.key)
    }

    if (block.functionType !== 'cellContent') {
      throw new Error('Cursor is not in table block, so you can not insert/edit row/column')
    }

    const cellBlock = this.getParent(block)
    const currentRow = this.getParent(cellBlock)
    const table = this.closest(block, 'table')
    const thead = table.children[0]
    const tbody = table.children[1]
    const columnIndex = currentRow.children.indexOf(cellBlock)
    let result

    if (target === 'row') {
      result = editTableRow(this, {
        location,
        action,
        cellBlock,
        currentRow,
        table,
        thead,
        tbody,
        columnIndex
      })
    } else if (target === 'column') {
      result = editTableColumn(this, {
        location,
        action,
        block,
        cellBlock,
        currentRow,
        thead,
        tbody,
        columnIndex
      })
    }

    if (result?.stopped) return
    const cursorBlock = result?.cursorBlock
    const newColumn = thead.children[0].children.length - 1
    const newRow = thead.children.length + (tbody ? tbody.children.length - 1 : 0)
    Object.assign(table, { row: newRow, column: newColumn })

    if (cursorBlock) {
      const { key } = cursorBlock
      const offset = 0
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
    } else {
      this.cursor = { start, end, isEdit: true }
    }

    this.partialRender()
    this.muya.eventCenter.dispatch('stateChange')
  }
}

export default tableEdit

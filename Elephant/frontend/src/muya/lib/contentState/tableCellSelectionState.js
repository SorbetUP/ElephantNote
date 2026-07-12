import { getAllTableCells, getIndex } from './tableDragBarCtrl'

const tableCellSelectionState = ContentState => {
  ContentState.prototype.handleCellMouseDown = function(event) {
    if (event.buttons === 2) return
    const { eventCenter } = this.muya
    const { target } = event
    const cell = target.closest('th') || target.closest('td')
    const tableId = target.closest('table').id
    const row = getIndex('left', cell)
    const column = getIndex('bottom', cell)
    this.cellSelectInfo = {
      tableId,
      anchor: { key: cell.id, row, column },
      focus: null,
      isStartSelect: false,
      cells: getAllTableCells(tableId),
      selectedCells: []
    }

    const mouseMoveId = eventCenter.attachDOMEvent(
      document.body,
      'mousemove',
      this.handleCellMouseMove.bind(this)
    )
    const mouseUpId = eventCenter.attachDOMEvent(
      document.body,
      'mouseup',
      this.handleCellMouseUp.bind(this)
    )
    this.cellSelectEventIds.push(mouseMoveId, mouseUpId)
  }

  ContentState.prototype.handleCellMouseMove = function(event) {
    const { target } = event
    const cell = target.closest('th') || target.closest('td')
    const table = target.closest('table')
    const isOverSameTableCell = cell && table && table.id === this.cellSelectInfo.tableId
    if (isOverSameTableCell && cell.id !== this.cellSelectInfo.anchor.key) {
      this.cellSelectInfo.isStartSelect = true
      this.muya.blur(true)
    }
    if (isOverSameTableCell && this.cellSelectInfo.isStartSelect) {
      this.cellSelectInfo.focus = {
        key: cell.key,
        row: getIndex('left', cell),
        column: getIndex('bottom', cell)
      }
    } else {
      this.cellSelectInfo.focus = null
    }

    this.calculateSelectedCells()
    this.setSelectedCellsStyle()
  }

  ContentState.prototype.handleCellMouseUp = function(event) {
    const { eventCenter } = this.muya
    for (const id of this.cellSelectEventIds) eventCenter.detachDOMEvent(id)
    this.cellSelectEventIds = []
    if (this.cellSelectInfo && this.cellSelectInfo.isStartSelect) {
      event.preventDefault()
      const { tableId, selectedCells, anchor, focus } = this.cellSelectInfo
      if (!focus) return
      setTimeout(() => {
        this.selectedTableCells = {
          tableId,
          row: Math.abs(anchor.row - focus.row) + 1,
          column: Math.abs(anchor.column - focus.column) + 1,
          cells: selectedCells.map(c => {
            delete c.ele
            return c
          })
        }
        this.cellSelectInfo = null
        const table = this.getBlock(tableId)
        return this.singleRender(table, false)
      })
    }
  }

  ContentState.prototype.calculateSelectedCells = function() {
    const { anchor, focus, cells } = this.cellSelectInfo
    this.cellSelectInfo.selectedCells = []
    if (!focus) return

    const startRowIndex = Math.min(anchor.row, focus.row)
    const endRowIndex = Math.max(anchor.row, focus.row)
    const startColIndex = Math.min(anchor.column, focus.column)
    const endColIndex = Math.max(anchor.column, focus.column)
    for (let i = startRowIndex; i <= endRowIndex; i++) {
      const row = cells[i]
      for (let j = startColIndex; j <= endColIndex; j++) {
        const cell = row[j]
        const cellBlock = this.getBlock(cell.id)
        this.cellSelectInfo.selectedCells.push({
          ele: cell,
          key: cell.id,
          text: cellBlock.children[0].text,
          align: cellBlock.align,
          top: i === startRowIndex,
          right: j === endColIndex,
          bottom: i === endRowIndex,
          left: j === startColIndex
        })
      }
    }
  }

  ContentState.prototype.setSelectedCellsStyle = function() {
    const { selectedCells, cells } = this.cellSelectInfo
    for (const row of cells) {
      for (const cell of row) {
        cell.classList.remove('ag-cell-selected')
        cell.classList.remove('ag-cell-border-top')
        cell.classList.remove('ag-cell-border-right')
        cell.classList.remove('ag-cell-border-bottom')
        cell.classList.remove('ag-cell-border-left')
      }
    }

    for (const cell of selectedCells) {
      const { ele, top, right, bottom, left } = cell
      ele.classList.add('ag-cell-selected')
      if (top) ele.classList.add('ag-cell-border-top')
      if (right) ele.classList.add('ag-cell-border-right')
      if (bottom) ele.classList.add('ag-cell-border-bottom')
      if (left) ele.classList.add('ag-cell-border-left')
    }
  }

  ContentState.prototype.selectTable = function(table) {
    this.cellSelectInfo = {
      anchor: { row: 0, column: 0 },
      focus: { row: table.row, column: table.column },
      cells: getAllTableCells(table.key)
    }
    this.calculateSelectedCells()
    this.selectedTableCells = {
      tableId: table.key,
      row: table.row + 1,
      column: table.column + 1,
      cells: this.cellSelectInfo.selectedCells.map(c => {
        delete c.ele
        return c
      })
    }
    this.cellSelectInfo = null
    this.muya.blur()
    return this.singleRender(table, false)
  }
}

export default tableCellSelectionState

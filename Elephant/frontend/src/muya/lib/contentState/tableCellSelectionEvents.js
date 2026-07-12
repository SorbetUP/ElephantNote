import { getAllTableCells, getIndex } from './tableDragBarCtrl'

export function handleCellMouseDown(event) {
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

export function handleCellMouseMove(event) {
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

export function handleCellMouseUp(event) {
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
        cells: selectedCells.map(cell => {
          delete cell.ele
          return cell
        })
      }
      this.cellSelectInfo = null
      const table = this.getBlock(tableId)
      return this.singleRender(table, false)
    })
  }
}

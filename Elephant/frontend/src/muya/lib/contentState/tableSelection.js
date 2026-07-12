import { getAllTableCells } from './tableDragBarCtrl'

export function selectTable(table) {
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
    cells: this.cellSelectInfo.selectedCells.map(cell => {
      delete cell.ele
      return cell
    })
  }
  this.cellSelectInfo = null
  this.muya.blur()
  return this.singleRender(table, false)
}

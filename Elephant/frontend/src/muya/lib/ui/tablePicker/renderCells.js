import { h } from '../../parser/render/snabbdom'

export const renderPickerRows = picker => {
  const { row, column } = picker.checkerCount
  const { row: currentRow, column: currentColumn } = picker.current
  const { row: selectedRow, column: selectedColumn } = picker.select
  const tableRows = []

  for (let rowIndex = 0; rowIndex < row; rowIndex++) {
    const cells = []
    for (let columnIndex = 0; columnIndex < column; columnIndex++) {
      let selector = 'span.ag-table-picker-cell'
      if (rowIndex <= currentRow && columnIndex <= currentColumn) {
        selector += '.current'
      }
      if (rowIndex <= selectedRow && columnIndex <= selectedColumn) {
        selector += '.selected'
      }
      cells.push(h(selector, {
        key: columnIndex.toString(),
        dataset: {
          row: rowIndex.toString(),
          column: columnIndex.toString()
        },
        on: {
          mouseenter: event => {
            const { target } = event
            const row = target.getAttribute('data-row')
            const column = target.getAttribute('data-column')
            picker.select = { row, column }
            picker.render()
          },
          click: _ => picker.selectItem()
        }
      }))
    }
    tableRows.push(h('div.ag-table-picker-row', cells))
  }
  return tableRows
}

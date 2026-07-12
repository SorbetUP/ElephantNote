export function setSelectedCellsStyle() {
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

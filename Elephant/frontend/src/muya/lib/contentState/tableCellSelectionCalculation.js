export function calculateSelectedCells() {
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

import { renderLeftBar, renderBottomBar } from './renderTableDargBar'

export const renderContainerTableCell = (
  renderer,
  parent,
  block,
  activeBlocks,
  selector,
  data,
  children
) => {
  const { key, align, column } = block
  const { cells } = renderer.muya.contentState.selectedTableCells || {}
  if (align) Object.assign(data.attrs, { style: `text-align:${align}` })
  if (typeof column === 'number') Object.assign(data.dataset, { column })

  if (cells && cells.length) {
    const cell = cells.find(candidate => candidate.key === key)
    if (!cell) return selector
    selector += '.ag-cell-selected'
    if (cell.top) selector += '.ag-cell-border-top'
    if (cell.right) selector += '.ag-cell-border-right'
    if (cell.bottom) selector += '.ag-cell-border-bottom'
    if (cell.left) selector += '.ag-cell-border-left'
    return selector
  }

  const { renderingTable, renderingRowContainer } = renderer
  const findTable = renderingTable
    ? activeBlocks.find(candidate => candidate.key === renderingTable.key)
    : null
  if (!findTable || !renderingRowContainer) return selector

  const { row: tableRow, column: tableColumn } = findTable
  const isLastRow = renderingRowContainer.type === 'thead'
    ? tableRow === 0
    : !parent.nextSibling
  if (block.parent === activeBlocks[1].parent && !block.preSibling && tableRow > 0) {
    children.unshift(renderLeftBar())
  }
  if (column === activeBlocks[1].column && isLastRow && tableColumn > 0) {
    children.push(renderBottomBar())
  }
  return selector
}

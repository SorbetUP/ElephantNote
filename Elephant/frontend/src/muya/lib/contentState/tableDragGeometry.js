export const calculateAspects = (tableId, barType) => {
  if (!tableId) return []
  const table = document.querySelector(`#${tableId}`)
  if (!table) return []
  if (barType === 'bottom') {
    const firstRow = table.querySelector('tr')
    return Array.from(firstRow.children).map(cell => cell.clientWidth)
  }
  return Array.from(table.querySelectorAll('tr')).map(row => row.clientHeight)
}

export const getAllTableCells = tableId => {
  if (!tableId) return []
  const table = document.querySelector(`#${tableId}`)
  if (!table) return []
  const cells = []
  for (const row of Array.from(table.querySelectorAll('tr'))) {
    cells.push(Array.from(row.children))
  }
  return cells
}

export const getIndex = (barType, cell) => {
  if (cell.tagName === 'SPAN') cell = cell.parentNode
  const row = cell.parentNode
  if (barType === 'bottom') return Array.from(row.children).indexOf(cell)
  const rowContainer = row.parentNode
  if (rowContainer.tagName === 'THEAD') return 0
  return Array.from(rowContainer.children).indexOf(row) + 1
}

export const getDragCells = (tableId, barType, index) => {
  if (!tableId) return []
  const table = document.querySelector(`#${tableId}`)
  if (!table) return []
  const dragCells = []
  if (barType === 'left') {
    if (index === 0) dragCells.push(...table.querySelectorAll('th'))
    else dragCells.push(...table.querySelector('tbody').children[index - 1].children)
  } else {
    const rows = Array.from(table.querySelectorAll('tr'))
    for (let i = 0; i < rows.length; i++) dragCells.push(rows[i].children[index])
  }
  return dragCells
}

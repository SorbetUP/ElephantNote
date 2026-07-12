export const splitCells = function splitCells(tableRow, count) {
  const row = tableRow.replace(/\|/g, function(match, offset, value) {
    let escaped = false
    let current = offset
    while (--current >= 0 && value[current] === '\\') escaped = !escaped
    return escaped ? '|' : ' |'
  })
  const cells = row.split(/ \|/)

  if (cells.length > count) {
    cells.splice(count)
  } else {
    while (cells.length < count) cells.push('')
  }

  for (let index = 0; index < cells.length; index += 1) {
    cells[index] = cells[index].trim().replace(/\\\|/g, '|')
  }
  return cells
}

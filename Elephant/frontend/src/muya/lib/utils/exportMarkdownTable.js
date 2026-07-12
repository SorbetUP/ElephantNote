export default function normalizeMarkdownTable(table, indent) {
  const result = []
  const tableData = []
  const header = table.children[0]
  const body = table.children[1]
  const escapeText = value => value.replace(/([^\\])\|/g, '$1\\|')

  tableData.push(
    header.children[0].children.map(cell => escapeText(cell.children[0].text).trim())
  )
  if (body) {
    body.children.forEach(row => {
      tableData.push(row.children.map(cell => escapeText(cell.children[0].text).trim()))
    })
  }

  const columnWidth = header.children[0].children.map(cell => ({
    width: 5,
    align: cell.align
  }))
  for (let row = 0; row < tableData.length; row++) {
    for (let column = 0; column < Math.min(tableData[row].length, columnWidth.length); column++) {
      columnWidth[column].width = Math.max(
        columnWidth[column].width,
        tableData[row][column].length + 2
      )
    }
  }

  tableData.forEach((row, rowIndex) => {
    const rowString =
      indent +
      '|' +
      row
        .slice(0, columnWidth.length)
        .map((cell, column) => {
          const raw = ` ${cell + ' '.repeat(columnWidth[column].width)}`
          return raw.substring(0, columnWidth[column].width)
        })
        .join('|') +
      '|'
    result.push(rowString)
    if (rowIndex === 0) {
      const separator =
        indent +
        '|' +
        columnWidth
          .map(({ width, align }) => {
            let raw = '-'.repeat(width - 2)
            switch (align) {
              case 'left':
                raw = `:${raw} `
                break
              case 'center':
                raw = `:${raw}:`
                break
              case 'right':
                raw = ` ${raw}:`
                break
              default:
                raw = ` ${raw} `
                break
            }
            return raw
          })
          .join('|') +
        '|'
      result.push(separator)
    }
  })
  return result.join('\n') + '\n'
}

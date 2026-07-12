import ExportMarkdown from '../utils/exportMarkdown'

export default function docCopyHandler(event) {
  const { selectedTableCells } = this
  if (!selectedTableCells) return

  event.preventDefault()
  const { row, column, cells } = selectedTableCells
  const tableContents = []
  for (let i = 0; i < row; i++) {
    const rowWrapper = []
    for (let j = 0; j < column; j++) {
      const cell = cells[i * column + j]
      rowWrapper.push({ text: cell.text, align: cell.align })
    }
    tableContents.push(rowWrapper)
  }

  if (row === 1 && column === 1) {
    if (tableContents[0][0].text.length > 0) {
      event.clipboardData.setData('text/html', '')
      event.clipboardData.setData('text/plain', tableContents[0][0].text)
    }
    return
  }

  const figureBlock = this.createBlock('figure', { functionType: 'table' })
  const table = this.createTableInFigure({ rows: row, columns: column }, tableContents)
  this.appendChild(figureBlock, table)
  const { isGitlabCompatibilityEnabled, listIndentation } = this
  const markdown = new ExportMarkdown(
    [figureBlock],
    listIndentation,
    isGitlabCompatibilityEnabled
  ).generate()
  if (markdown.length > 0) {
    event.clipboardData.setData('text/html', '')
    event.clipboardData.setData('text/plain', markdown)
  }
}

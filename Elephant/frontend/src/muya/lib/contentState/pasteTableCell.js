export const pasteTableCell = (contentState, startBlock, start, end, text) => {
  let oneCellSelected = false
  if (contentState.selectedTableCells) {
    const selected = contentState.selectedTableCells
    if (selected.row === 1 && selected.column === 1) oneCellSelected = true
    else return contentState.partialRender()
  }
  const key = startBlock.key
  const pendingText = text.trim().replace(/\n/g, '<br/>')
  let offset = pendingText.length
  if (oneCellSelected) {
    startBlock.text = pendingText
    contentState.selectedTableCells = null
  } else {
    offset += start.offset
    startBlock.text = startBlock.text.substring(0, start.offset) +
      pendingText +
      startBlock.text.substring(end.offset)
  }
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  return contentState.partialRender()
}

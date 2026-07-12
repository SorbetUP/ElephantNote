import { isOsx } from '../config'

const getFirstBlockInNextRow = (contentState, row) => {
  let nextSibling = contentState.getBlock(row.nextSibling)
  if (!nextSibling) {
    const rowContainer = contentState.getBlock(row.parent)
    const table = contentState.getBlock(rowContainer.parent)
    const figure = contentState.getBlock(table.parent)
    if (rowContainer.type === 'thead' && table.children[1]) {
      nextSibling = table.children[1]
    } else if (figure.nextSibling) {
      nextSibling = contentState.getBlock(figure.nextSibling)
    } else {
      nextSibling = contentState.createBlockP()
      contentState.insertAfter(nextSibling, figure)
    }
  }
  return contentState.firstInDescendant(nextSibling)
}

export default function handleEnterTable(contentState, event, context) {
  const { block } = context
  if (block.functionType !== 'cellContent') {
    return { handled: false, context }
  }

  const row = contentState.closest(block, 'tr')
  const rowContainer = contentState.getBlock(row.parent)
  const table = contentState.closest(rowContainer, 'table')
  if ((isOsx && event.metaKey) || (!isOsx && event.ctrlKey)) {
    const nextRow = contentState.createRow(row, false)
    if (rowContainer.type === 'thead') {
      let body = contentState.getBlock(rowContainer.nextSibling)
      if (!body) {
        body = contentState.createBlock('tbody')
        contentState.appendChild(table, body)
      }
      if (body.children.length) {
        contentState.insertBefore(nextRow, body.children[0])
      } else {
        contentState.appendChild(body, nextRow)
      }
    } else {
      contentState.insertAfter(nextRow, row)
    }
    table.row++
  }

  const { key } = getFirstBlockInNextRow(contentState, row)
  const offset = 0
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  return { handled: true, value: contentState.partialRender() }
}

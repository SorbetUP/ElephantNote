export const normalizeList = (exporter, block, indent, listIndent) => {
  return exporter.translateBlocks2Markdown(block.children, indent, listIndent)
}

export const normalizeListItem = (exporter, block, indent) => {
  const result = []
  const listInfo = exporter.listType[exporter.listType.length - 1]
  const isUnorderedList = listInfo.type === 'ul'
  let { children, bulletMarkerOrDelimiter } = block
  let itemMarker

  if (isUnorderedList) {
    itemMarker = bulletMarkerOrDelimiter ? `${bulletMarkerOrDelimiter} ` : '- '
  } else {
    let count = listInfo.listCount
    if ((exporter.listIndentation === 'dfm' && count > 99) || count > 999999999) {
      count = 1
    }
    listInfo.listCount++
    const delimiter = bulletMarkerOrDelimiter || '.'
    itemMarker = `${count}${delimiter} `
  }

  const newIndent = indent + ' '.repeat(itemMarker.length)
  let listIndent = ''
  if (exporter.listIndentation === 'dfm') {
    listIndent = ' '.repeat(4 - itemMarker.length)
  } else if (exporter.listIndentation === 'number') {
    listIndent = ' '.repeat(exporter.listIndentationCount - 1)
  }

  if (isUnorderedList && block.listItemType === 'task') {
    const firstChild = children[0]
    itemMarker += firstChild.checked ? '[x] ' : '[ ] '
    children = children.slice(1)
  }

  result.push(`${indent}${itemMarker}`)
  result.push(
    exporter
      .translateBlocks2Markdown(children, newIndent, listIndent)
      .substring(newIndent.length)
  )
  return result.join('')
}

export const normalizeFootnote = (exporter, block, indent) => {
  const result = []
  const identifier = block.children[0].text
  result.push(`${indent}[^${identifier}]:`)
  const hasMultipleBlocks = block.children.length > 2 || block.children[1].type !== 'p'
  if (hasMultipleBlocks) {
    result.push('\n')
    result.push(
      exporter.translateBlocks2Markdown(block.children.slice(1), indent + ' '.repeat(4))
    )
  } else {
    result.push(' ')
    result.push(exporter.normalizeParagraphText(block.children[1].children[0], indent))
  }
  return result.join('')
}

const moveColumn = (rows, index, curIndex, offset, start) => {
  let key = null
  for (const row of rows) {
    const isCursorCell = row.children[index].children[0].key === start.key
    const { text } = row.children[index].children[0]
    const { align } = row.children[index]
    if (offset > 0) {
      for (let i = index; i < curIndex; i++) {
        row.children[i].children[0].text = row.children[i + 1].children[0].text
        row.children[i].align = row.children[i + 1].align
      }
    } else {
      for (let i = index; i > curIndex; i--) {
        row.children[i].children[0].text = row.children[i - 1].children[0].text
        row.children[i].align = row.children[i - 1].align
      }
    }
    row.children[curIndex].children[0].text = text
    row.children[curIndex].align = align
    if (isCursorCell) key = row.children[curIndex].children[0].key
  }
  return key
}

const moveRow = (rows, index, curIndex, offset, start) => {
  let column = null
  let key = null
  const temp = rows[index].children.map((cell, i) => {
    if (cell.children[0].key === start.key) column = i
    return cell.children[0].text
  })
  if (offset > 0) {
    for (let i = index; i < curIndex; i++) {
      rows[i].children.forEach((cell, ii) => {
        cell.children[0].text = rows[i + 1].children[ii].children[0].text
      })
    }
  } else {
    for (let i = index; i > curIndex; i--) {
      rows[i].children.forEach((cell, ii) => {
        cell.children[0].text = rows[i - 1].children[ii].children[0].text
      })
    }
  }
  rows[curIndex].children.forEach((cell, i) => {
    if (i === column) key = cell.children[0].key
    cell.children[0].text = temp[i]
  })
  return key
}

const tableDragData = ContentState => {
  ContentState.prototype.switchTableData = function() {
    const { barType, index, curIndex, tableId, offset } = this.dragInfo
    const table = this.getBlock(tableId)
    const tHead = table.children[0]
    const tBody = table.children[1]
    const rows = [tHead.children[0], ...(tBody ? tBody.children : [])]

    if (index !== curIndex) {
      const { start, end } = this.cursor
      const key = barType === 'bottom'
        ? moveColumn(rows, index, curIndex, offset, start)
        : moveRow(rows, index, curIndex, offset, start)
      if (key) {
        this.cursor = {
          start: { key, offset: start.offset },
          end: { key, offset: end.offset },
          isEdit: true
        }
        return this.singleRender(table)
      }
      return this.partialRender()
    }
  }
}

export default tableDragData

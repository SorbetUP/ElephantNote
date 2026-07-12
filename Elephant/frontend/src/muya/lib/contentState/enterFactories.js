const enterFactories = ContentState => {
  ContentState.prototype.createRow = function(row, isHeader = false) {
    const tr = this.createBlock('tr')
    const len = row.children.length
    for (let index = 0; index < len; index++) {
      const cell = this.createBlock(isHeader ? 'th' : 'td', {
        align: row.children[index].align,
        column: index
      })
      const cellContent = this.createBlock('span', {
        functionType: 'cellContent'
      })
      this.appendChild(cell, cellContent)
      this.appendChild(tr, cell)
    }
    return tr
  }

  ContentState.prototype.createBlockLi = function(paragraphInListItem) {
    const listItem = this.createBlock('li')
    if (!paragraphInListItem) paragraphInListItem = this.createBlockP()
    this.appendChild(listItem, paragraphInListItem)
    return listItem
  }

  ContentState.prototype.createTaskItemBlock = function(
    paragraphInListItem,
    checked = false
  ) {
    const listItem = this.createBlock('li')
    const checkbox = this.createBlock('input')
    listItem.listItemType = 'task'
    checkbox.checked = checked
    if (!paragraphInListItem) paragraphInListItem = this.createBlockP()
    this.appendChild(listItem, checkbox)
    this.appendChild(listItem, paragraphInListItem)
    return listItem
  }
}

export default enterFactories

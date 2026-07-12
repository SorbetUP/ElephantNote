const paragraphContainers = ContentState => {
  ContentState.prototype.insertContainerBlock = function(functionType, block) {
    const anchor = this.getAnchor(block)
    if (!anchor) {
      console.error('Can not find the anchor paragraph to insert paragraph')
      return
    }
    const value =
      anchor.type === 'p'
        ? anchor.children.map(child => child.text).join('\n').trim()
        : ''
    const containerBlock = this.createContainerBlock(functionType, value)
    this.insertAfter(containerBlock, anchor)
    if (anchor.type === 'p') this.removeBlock(anchor)

    const cursorBlock = containerBlock.children[0].children[0].children[0]
    const { key } = cursorBlock
    const offset = 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
  }

  ContentState.prototype.showTablePicker = function() {
    const { eventCenter } = this.muya
    const reference = this.getPositionReference()
    const handler = (rows, columns) => {
      this.createTable({ rows: rows + 1, columns: columns + 1 })
    }
    eventCenter.dispatch(
      'muya-table-picker',
      { row: -1, column: -1 },
      reference,
      handler.bind(this)
    )
  }

  ContentState.prototype.insertHtmlBlock = function(block) {
    if (block.type === 'span') block = this.getParent(block)
    const preBlock = this.initHtmlBlock(block)
    const cursorBlock = this.firstInDescendant(preBlock)
    const { key, text } = cursorBlock
    const match = /^[^\n]+\n[^\n]*/.exec(text)
    const offset = match && match[0] ? match[0].length : 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
  }
}

export default paragraphContainers

const enterHandler = ContentState => {
  ContentState.prototype.enterHandler = function(event) {
    event.preventDefault()
    event.stopPropagation()
    const { start, end } = this.cursor
    const block = this.getBlock(start.key)
    if (!block || !end) return

    const parent = this.getParent(block)
    const { type, functionType } = block
    const { text } = block
    const isCursorAtEnd = this.checkCursorAtEndParagraph(block)

    if (
      type === 'span' &&
      functionType === 'languageInput'
    ) {
      const codeBlock = this.getParent(parent)
      const codeContent = codeBlock.children[1].children[0]
      const key = codeContent.key
      const offset = 0
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: false
      }
      return this.singleRender(codeBlock)
    }

    if (type === 'span' && functionType === 'codeContent') {
      return this.enterInCodeBlock(block, event)
    }

    if (
      type === 'span' &&
      functionType === 'footnoteInput'
    ) {
      const footnote = this.getParent(block)
      const footnoteContent = footnote.children[1]
      const cursorBlock = this.firstInDescendant(footnoteContent)
      const key = cursorBlock.key
      const offset = 0
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: false
      }
      return this.singleRender(footnote)
    }

    if (
      type === 'span' &&
      functionType === 'cellContent'
    ) {
      const table = this.closest(block, 'table')
      if (!table) return
      const nextCell = this.findNextCell(block)
      if (nextCell) {
        const key = nextCell.key
        const offset = 0
        this.cursor = {
          start: { key, offset },
          end: { key, offset },
          isEdit: false
        }
        return this.singleRender(table)
      }
      const outMostBlock = this.findOutMostBlock(table)
      const nextBlock = this.findNextBlockInLocation(outMostBlock)
      let cursorBlock
      if (nextBlock) {
        cursorBlock = nextBlock
      } else {
        const newBlock = this.createBlockP()
        this.insertAfter(newBlock, outMostBlock)
        cursorBlock = newBlock.children[0]
      }
      const key = cursorBlock.key
      const offset = cursorBlock.text.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
      return this.partialRender()
    }

    if (this.enterInEmptyBlock(block, event)) return

    if (parent.type === 'li') {
      return this.enterInListItem(block, event)
    }

    if (/^h\d$/.test(parent.type)) {
      return this.enterInHeading(block)
    }

    if (isCursorAtEnd && event.shiftKey) {
      block.text += '\n'
      const key = block.key
      const offset = block.text.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
      return this.partialRender()
    }

    const preText = text.substring(0, start.offset)
    const postText = text.substring(end.offset)
    block.text = preText
    const paragraph = this.getParent(block)
    const newParagraph = this.createBlockP(postText)
    this.insertAfter(newParagraph, paragraph)
    const cursorBlock = newParagraph.children[0]
    const key = cursorBlock.key
    const offset = 0
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    return this.partialRender()
  }
}

export default enterHandler

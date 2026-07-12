const enterHeading = ContentState => {
  ContentState.prototype.enterInHeading = function(block) {
    const { start, end } = this.cursor
    const parent = this.getParent(block)
    const { text } = block
    const preText = text.substring(0, start.offset)
    const postText = text.substring(end.offset)
    if (start.offset === 0) {
      const newBlock = this.createBlockP()
      this.insertBefore(newBlock, parent)
      const cursorBlock = newBlock.children[0]
      const cursorKey = cursorBlock.key
      const offset = 0
      this.cursor = {
        start: { key: cursorKey, offset },
        end: { key: cursorKey, offset },
        isEdit: true
      }
    } else if (end.offset === text.length) {
      const newBlock = this.createBlockP()
      this.insertAfter(newBlock, parent)
      const cursorBlock = newBlock.children[0]
      const cursorKey = cursorBlock.key
      const offset = 0
      this.cursor = {
        start: { key: cursorKey, offset },
        end: { key: cursorKey, offset },
        isEdit: true
      }
    } else {
      block.text = preText
      const newBlock = this.createBlockP(postText)
      this.insertAfter(newBlock, parent)
      const cursorBlock = newBlock.children[0]
      const cursorKey = cursorBlock.key
      const offset = 0
      this.cursor = {
        start: { key: cursorKey, offset },
        end: { key: cursorKey, offset },
        isEdit: true
      }
    }
    return this.partialRender()
  }
}

export default enterHeading

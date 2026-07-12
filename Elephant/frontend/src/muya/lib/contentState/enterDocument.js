import selection from '../selection'

const enterDocument = ContentState => {
  ContentState.prototype.docEnterHandler = function(event) {
    const { selectedImage } = this
    if (selectedImage) {
      event.preventDefault()
      event.stopPropagation()
      const { key, token } = selectedImage
      const { end } = token.range
      const block = this.getBlock(key)
      const outMostBlock = this.findOutMostBlock(block)
      const nextBlock = this.findNextBlockInLocation(outMostBlock)
      let cursorBlock
      if (nextBlock) {
        cursorBlock = nextBlock
      } else {
        cursorBlock = this.createBlockP()
        this.insertAfter(cursorBlock, outMostBlock)
      }
      const cursorTextBlock = this.firstInDescendant(cursorBlock)
      const cursorKey = cursorTextBlock.key
      const offset = cursorTextBlock.text.length
      this.cursor = {
        start: { key: cursorKey, offset },
        end: { key: cursorKey, offset },
        isEdit: true
      }
      this.selectedImage = null
      return this.partialRender()
    }
  }

  ContentState.prototype.checkCursorAtEndParagraph = function(block) {
    const cursor = selection.getCursorRange()
    if (!cursor.start || !cursor.end) return false
    const { start, end } = cursor
    return (
      start.key === end.key &&
      start.key === block.key &&
      start.offset === end.offset &&
      start.offset === block.text.length
    )
  }
}

export default enterDocument

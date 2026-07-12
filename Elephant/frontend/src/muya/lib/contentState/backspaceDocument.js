
const backspaceDocument = ContentState => {
  ContentState.prototype.docDeleteHandler = function(event) {
    const { selectedImage } = this
    if (selectedImage) {
      event.preventDefault()
      event.stopPropagation()
      const { key, token } = selectedImage
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
      return this.deleteImage({ key, token })
    }
  }

  ContentState.prototype.docBackspaceHandler = function(event) {
    const { selectedImage } = this
    if (selectedImage) {
      event.preventDefault()
      event.stopPropagation()
      const { key, token } = selectedImage
      const block = this.getBlock(key)
      const outMostBlock = this.findOutMostBlock(block)
      const preBlock = this.findPreBlockInLocation(outMostBlock)
      let cursorBlock
      if (preBlock) {
        cursorBlock = preBlock
      } else {
        cursorBlock = this.createBlockP()
        this.insertBefore(cursorBlock, outMostBlock)
      }
      const cursorTextBlock = this.lastInDescendant(cursorBlock)
      const cursorKey = cursorTextBlock.key
      const offset = cursorTextBlock.text.length
      this.cursor = {
        start: { key: cursorKey, offset },
        end: { key: cursorKey, offset },
        isEdit: true
      }
      this.selectedImage = null
      return this.deleteImage({ key, token })
    }
  }
}

export default backspaceDocument

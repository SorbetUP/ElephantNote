import selection from '../selection'

export function docCutHandler(event) {
  if (this.selectedTableCells) {
    event.preventDefault()
    return this.deleteSelectedTableCells(true)
  }
}

export function cutHandler() {
  if (this.selectedTableCells) return
  const { selectedImage } = this
  if (selectedImage) {
    const { key, token } = selectedImage
    this.deleteImage({ key, token })
    this.selectedImage = null
    return
  }

  const { start, end } = selection.getCursorRange()
  if (!start || !end) return
  const startBlock = this.getBlock(start.key)
  const endBlock = this.getBlock(end.key)
  startBlock.text =
    startBlock.text.substring(0, start.offset) + endBlock.text.substring(end.offset)
  if (start.key !== end.key) this.removeBlocks(startBlock, endBlock)
  this.cursor = { start, end: start, isEdit: true }
  this.checkInlineUpdate(startBlock)
  this.partialRender()
  this.muya.dispatchChange()
}

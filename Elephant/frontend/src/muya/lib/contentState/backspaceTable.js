
const backspaceTable = ContentState => {
  ContentState.prototype.deleteInTable = function(block, event) {
    const { start, end } = this.cursor
    const { text } = block
    if (start.key !== end.key || start.offset !== end.offset) return

    if (event.key === 'Delete') {
      const nextBlock = this.findNextBlockInLocation(block)
      if (!nextBlock) return
      if (start.offset !== text.length) return
      block.text += nextBlock.text
      this.cursor = {
        start: { key: start.key, offset: start.offset },
        end: { key: start.key, offset: start.offset },
        isEdit: true
      }
      this.removeBlock(nextBlock)
    } else if (event.key === 'Backspace') {
      const preBlock = this.findPreBlockInLocation(block)
      if (!preBlock) return
      if (start.offset !== 0) return
      const offset = preBlock.text.length
      preBlock.text += text
      this.cursor = {
        start: { key: preBlock.key, offset },
        end: { key: preBlock.key, offset },
        isEdit: true
      }
      this.removeBlock(block)
    }
    return this.partialRender()
  }
}

export default backspaceTable

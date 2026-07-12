
const backspaceMerge = ContentState => {
  ContentState.prototype.mergeBlock = function(block, event) {
    const { start, end } = this.cursor
    if (start.key !== end.key || start.offset !== end.offset) return
    const { text } = block
    let targetBlock
    let offset

    if (event.key === 'Backspace') {
      if (start.offset !== 0) return
      targetBlock = this.findPreBlockInLocation(block)
      if (!targetBlock) return
      offset = targetBlock.text.length
      targetBlock.text += text
      this.removeBlock(this.getAnchor(block))
      this.cursor = {
        start: { key: targetBlock.key, offset },
        end: { key: targetBlock.key, offset },
        isEdit: true
      }
    } else if (event.key === 'Delete') {
      if (end.offset !== text.length) return
      targetBlock = this.findNextBlockInLocation(block)
      if (!targetBlock) return
      offset = text.length
      block.text += targetBlock.text
      this.removeBlock(this.getAnchor(targetBlock))
      this.cursor = {
        start: { key: block.key, offset },
        end: { key: block.key, offset },
        isEdit: true
      }
    }
    return this.partialRender()
  }
}

export default backspaceMerge


const backspaceCode = ContentState => {
  ContentState.prototype.backspaceInCodeBlock = function(block) {
    const { start, end } = this.cursor
    if (
      start.key !== end.key ||
      start.offset !== end.offset ||
      start.offset !== 0
    ) {
      return
    }
    const code = this.getParent(block)
    const pre = this.getParent(code)
    const previousBlock = this.findPreBlockInLocation(pre)
    if (!previousBlock) return
    const offset = previousBlock.text.length
    previousBlock.text += block.text
    this.removeBlock(pre)
    this.cursor = {
      start: { key: previousBlock.key, offset },
      end: { key: previousBlock.key, offset },
      isEdit: true
    }
    return this.partialRender()
  }
}

export default backspaceCode

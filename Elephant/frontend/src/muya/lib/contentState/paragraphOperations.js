const paragraphOperations = ContentState => {
  ContentState.prototype.insertParagraph = function(
    location,
    text = '',
    outMost = false
  ) {
    const { start, end } = this.cursor
    if (start.key !== end.key) return
    const block = this.getBlock(start.key)
    const anchor = outMost
      ? this.findOutMostBlock(block)
      : this.getAnchor(block)
    if (
      !anchor ||
      (anchor.functionType === 'frontmatter' && location === 'before')
    ) {
      return
    }

    const newBlock = this.createBlockP(text)
    if (location === 'before') this.insertBefore(newBlock, anchor)
    else this.insertAfter(newBlock, anchor)
    const { key } = newBlock.children[0]
    const offset = text.length
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    this.partialRender()
    this.muya.eventCenter.dispatch('stateChange')
  }

  ContentState.prototype.duplicate = function() {
    const { start, end } = this.cursor
    const startOutmostBlock = this.findOutMostBlock(
      this.getBlock(start.key)
    )
    const endOutmostBlock = this.findOutMostBlock(
      this.getBlock(end.key)
    )
    if (startOutmostBlock !== endOutmostBlock) return

    const copiedBlock = this.copyBlock(startOutmostBlock)
    this.insertAfter(copiedBlock, startOutmostBlock)
    const cursorBlock = this.firstInDescendant(copiedBlock)
    const { key, text } = cursorBlock
    const offset = text.length
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    this.partialRender()
    return this.muya.eventCenter.dispatch('stateChange')
  }

  ContentState.prototype.deleteParagraph = function(blockKey) {
    let startOutmostBlock
    if (blockKey) {
      const block = this.getBlock(blockKey)
      const firstEditableBlock = this.firstInDescendant(block)
      startOutmostBlock = this.getAnchor(firstEditableBlock)
    } else {
      const { start, end } = this.cursor
      startOutmostBlock = this.findOutMostBlock(
        this.getBlock(start.key)
      )
      const endOutmostBlock = this.findOutMostBlock(
        this.getBlock(end.key)
      )
      if (startOutmostBlock !== endOutmostBlock) return
    }

    const preBlock = this.getBlock(startOutmostBlock.preSibling)
    const nextBlock = this.getBlock(startOutmostBlock.nextSibling)
    let cursorBlock
    if (nextBlock) {
      cursorBlock = this.firstInDescendant(nextBlock)
    } else if (preBlock) {
      cursorBlock = this.lastInDescendant(preBlock)
    } else {
      const newBlock = this.createBlockP()
      this.insertAfter(newBlock, startOutmostBlock)
      cursorBlock = this.firstInDescendant(newBlock)
    }
    this.removeBlock(startOutmostBlock)
    const { key, text } = cursorBlock
    const offset = text.length
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    this.partialRender()
    return this.muya.eventCenter.dispatch('stateChange')
  }
}

export default paragraphOperations

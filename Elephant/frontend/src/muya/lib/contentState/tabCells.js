const tabCells = ContentState => {
  ContentState.prototype.findNextCell = function(block) {
    if (block.functionType !== 'cellContent') {
      throw new Error('only th and td can have next cell')
    }
    const cellBlock = this.getParent(block)
    const nextSibling = this.getBlock(cellBlock.nextSibling)
    const rowBlock = this.getBlock(cellBlock.parent)
    const tableSection = this.getBlock(rowBlock.parent)
    if (nextSibling) return this.firstInDescendant(nextSibling)
    if (rowBlock.nextSibling) {
      return this.firstInDescendant(this.getBlock(rowBlock.nextSibling))
    }
    if (tableSection.type === 'thead') {
      const body = this.getBlock(tableSection.nextSibling)
      if (body && body.children.length) return this.firstInDescendant(body)
    }
    return false
  }

  ContentState.prototype.findPreviousCell = function(block) {
    if (block.functionType !== 'cellContent') {
      throw new Error('only th and td can have previous cell')
    }
    const cellBlock = this.getParent(block)
    const previousSibling = this.getBlock(cellBlock.preSibling)
    const rowBlock = this.getBlock(cellBlock.parent)
    const tableSection = this.getBlock(rowBlock.parent)
    if (previousSibling) return this.firstInDescendant(previousSibling)
    if (rowBlock.preSibling) {
      return this.lastInDescendant(this.getBlock(rowBlock.preSibling))
    }
    if (tableSection.type === 'tbody') {
      const head = this.getBlock(tableSection.preSibling)
      if (head && head.children.length) return this.lastInDescendant(head)
    }
    return block
  }
}

export default tabCells

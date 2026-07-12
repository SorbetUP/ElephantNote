const enterBlockChop = ContentState => {
  ContentState.prototype.chopBlockByCursor = function(block, key, offset) {
    const newBlock = this.createBlock('p')
    const { children } = block
    const index = children.findIndex(child => child.key === key)
    const activeLine = this.getBlock(key)
    const { text } = activeLine
    newBlock.children = children.splice(index + 1)
    newBlock.children.forEach(child => (child.parent = newBlock.key))
    children[index].nextSibling = null
    if (newBlock.children.length) newBlock.children[0].preSibling = null
    if (offset === 0) {
      this.removeBlock(activeLine, children)
      this.prependChild(newBlock, activeLine)
    } else if (offset < text.length) {
      activeLine.text = text.substring(0, offset)
      const newLine = this.createBlock('span', {
        text: text.substring(offset)
      })
      this.prependChild(newBlock, newLine)
    }
    return newBlock
  }

  ContentState.prototype.chopBlock = function(block) {
    const parent = this.getParent(block)
    const container = this.createBlock(parent.type)
    const index = this.findIndex(parent.children, block)
    const partChildren = parent.children.splice(index + 1)
    block.nextSibling = null
    partChildren.forEach(child => this.appendChild(container, child))
    this.insertAfter(container, parent)
    return container
  }
}

export default enterBlockChop

export default (ContentState) => {
  Object.assign(ContentState.prototype, {
    insertAfter(newBlock, oldBlock) {
      const siblings = oldBlock.parent ? this.getBlock(oldBlock.parent).children : this.blocks
      const oldNextSibling = this.getBlock(oldBlock.nextSibling)
      const index = this.findIndex(siblings, oldBlock)
      siblings.splice(index + 1, 0, newBlock)
      oldBlock.nextSibling = newBlock.key
      newBlock.parent = oldBlock.parent
      newBlock.preSibling = oldBlock.key
      if (oldNextSibling) {
        newBlock.nextSibling = oldNextSibling.key
        oldNextSibling.preSibling = newBlock.key
      }
    },

    insertBefore(newBlock, oldBlock) {
      const siblings = oldBlock.parent ? this.getBlock(oldBlock.parent).children : this.blocks
      const oldPreSibling = this.getBlock(oldBlock.preSibling)
      const index = this.findIndex(siblings, oldBlock)
      siblings.splice(index, 0, newBlock)
      oldBlock.preSibling = newBlock.key
      newBlock.parent = oldBlock.parent
      newBlock.nextSibling = oldBlock.key
      newBlock.preSibling = null
      if (oldPreSibling) {
        oldPreSibling.nextSibling = newBlock.key
        newBlock.preSibling = oldPreSibling.key
      }
    },

    prependChild(parent, block) {
      block.parent = parent.key
      block.preSibling = null
      if (parent.children.length) block.nextSibling = parent.children[0].key
      parent.children.unshift(block)
    },

    appendChild(parent, block) {
      const len = parent.children.length
      const lastChild = parent.children[len - 1]
      parent.children.push(block)
      block.parent = parent.key
      if (lastChild) {
        lastChild.nextSibling = block.key
        block.preSibling = lastChild.key
      } else {
        block.preSibling = null
      }
      block.nextSibling = null
    },

    replaceBlock(newBlock, oldBlock) {
      const blockList = oldBlock.parent ? this.getParent(oldBlock).children : this.blocks
      const index = this.findIndex(blockList, oldBlock)
      blockList.splice(index, 1, newBlock)
      newBlock.parent = oldBlock.parent
      newBlock.preSibling = oldBlock.preSibling
      newBlock.nextSibling = oldBlock.nextSibling
    }
  })
}

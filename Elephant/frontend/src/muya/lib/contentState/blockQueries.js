export default (ContentState) => {
  Object.assign(ContentState.prototype, {
    getBlock(key) {
      if (!key) return null
      let result = null
      const travel = (blocks) => {
        for (const block of blocks) {
          if (block.key === key) {
            result = block
            return
          }
          if (block.children.length) travel(block.children)
        }
      }
      travel(this.blocks)
      return result
    },

    getParent(block) {
      return block && block.parent ? this.getBlock(block.parent) : null
    },

    getParents(block) {
      const result = [block]
      let parent = this.getParent(block)
      while (parent) {
        result.push(parent)
        parent = this.getParent(parent)
      }
      return result
    },

    getPreSibling(block) {
      return block.preSibling ? this.getBlock(block.preSibling) : null
    },

    getNextSibling(block) {
      return block.nextSibling ? this.getBlock(block.nextSibling) : null
    },

    isInclude(parent, target) {
      const { children } = parent
      if (children.length === 0) return false
      if (children.some((child) => child.key === target.key)) return true
      return children.some((child) => this.isInclude(child, target))
    },

    getActiveBlocks() {
      const result = []
      if (!this.cursor || !this.cursor.start) return result
      let block = this.getBlock(this.cursor.start.key)
      if (block) result.push(block)
      while (block && block.parent) {
        block = this.getBlock(block.parent)
        result.push(block)
      }
      return result
    },

    findOutMostBlock(block) {
      if (!block) return null
      const parent = this.getBlock(block.parent)
      return parent ? this.findOutMostBlock(parent) : block
    },

    findIndex(children, block) {
      return children.findIndex((child) => child.key === block.key)
    },

    closest(block, type) {
      if (!block) return null
      if (type instanceof RegExp ? type.test(block.type) : block.type === type) return block
      return this.closest(this.getParent(block), type)
    },

    getAnchor(block) {
      const { type, functionType } = block
      if (type !== 'span') return null
      if (functionType === 'codeContent' || functionType === 'cellContent') {
        return this.closest(block, 'figure') || this.closest(block, 'pre')
      }
      return this.getParent(block)
    }
  })
}

export default (ContentState) => {
  Object.assign(ContentState.prototype, {
    removeTextOrBlock(block) {
      if (block.functionType === 'languageInput') return

      const checkerIn = (candidate) => {
        if (this.exemption.has(candidate.key)) return true
        const parent = this.getBlock(candidate.parent)
        return parent ? checkerIn(parent) : false
      }

      const checkerOut = (candidate) => {
        const { children } = candidate
        if (!children.length) return false
        if (children.some((child) => this.exemption.has(child.key))) return true
        return children.some((child) => checkerOut(child))
      }

      if (checkerIn(block) || checkerOut(block)) {
        block.text = ''
        if (block.children.length) {
          block.children.forEach((child) => this.removeTextOrBlock(child))
        }
      } else if (block.editable) {
        this.removeBlock(block)
      }
    },

    removeBlocks(before, after, isRemoveAfter = true, isRecursion = false) {
      if (!isRecursion) {
        if (/td|th/.test(before.type)) this.exemption.add(this.closest(before, 'figure'))
        if (/td|th/.test(after.type)) this.exemption.add(this.closest(after, 'figure'))
      }

      let nextSibling = this.getBlock(before.nextSibling)
      let beforeEnd = false
      while (nextSibling) {
        if (nextSibling.key === after.key || this.isInclude(nextSibling, after)) {
          beforeEnd = true
          break
        }
        this.removeTextOrBlock(nextSibling)
        nextSibling = this.getBlock(nextSibling.nextSibling)
      }
      if (!beforeEnd) {
        const parent = this.getParent(before)
        if (parent) this.removeBlocks(parent, after, false, true)
      }

      let preSibling = this.getBlock(after.preSibling)
      let afterEnd = false
      while (preSibling) {
        if (preSibling.key === before.key || this.isInclude(preSibling, before)) {
          afterEnd = true
          break
        }
        this.removeTextOrBlock(preSibling)
        preSibling = this.getBlock(preSibling.preSibling)
      }
      if (!afterEnd) {
        const parent = this.getParent(after)
        if (parent) {
          const removeAfter = isRemoveAfter && this.isOnlyRemoveableChild(after)
          this.removeBlocks(before, parent, removeAfter, true)
        }
      }

      if (isRemoveAfter) this.removeTextOrBlock(after)
      if (!isRecursion) this.exemption.clear()
    },

    removeBlock(block, fromBlocks = this.blocks, breakLinkedList = false) {
      const remove = (blocks, candidate) => {
        const len = blocks.length
        for (let index = 0; index < len; index += 1) {
          if (blocks[index].key === candidate.key) {
            const preSibling = this.getBlock(candidate.preSibling)
            const nextSibling = this.getBlock(candidate.nextSibling)
            if (preSibling) {
              preSibling.nextSibling = nextSibling && !breakLinkedList ? nextSibling.key : null
            }
            if (nextSibling) {
              nextSibling.preSibling = preSibling && !breakLinkedList ? preSibling.key : null
            }
            return blocks.splice(index, 1)
          }
          if (blocks[index].children.length) remove(blocks[index].children, candidate)
        }
      }

      remove(Array.isArray(fromBlocks) ? fromBlocks : fromBlocks.children, block)
    }
  })
}

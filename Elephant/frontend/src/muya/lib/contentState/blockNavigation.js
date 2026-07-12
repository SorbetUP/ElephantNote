import { HAS_TEXT_BLOCK_REG } from '../config'
import selection from '../selection'

export default (ContentState) => {
  Object.assign(ContentState.prototype, {
    canInserFrontMatter(block) {
      if (!block) return true
      const parent = this.getParent(block)
      return block.type === 'span' && !block.preSibling && !parent.preSibling && !parent.parent
    },

    isFirstChild(block) {
      return !block.preSibling
    },

    isLastChild(block) {
      return !block.nextSibling
    },

    isOnlyChild(block) {
      return !block.nextSibling && !block.preSibling
    },

    isOnlyRemoveableChild(block) {
      if (block.editable === false) return false
      const parent = this.getParent(block)
      return (
        (parent ? parent.children : this.blocks).filter(
          (child) => child.editable && child.functionType !== 'languageInput'
        ).length === 1
      )
    },

    getLastChild(block) {
      if (block) {
        const len = block.children.length
        if (len) return block.children[len - 1]
      }
      return null
    },

    firstInDescendant(block) {
      const { children } = block
      if (children.length === 0 && HAS_TEXT_BLOCK_REG.test(block.type)) return block
      if (children.length) {
        if (
          children[0].type === 'input' ||
          (children[0].type === 'div' && children[0].editable === false)
        ) {
          return this.firstInDescendant(children[1])
        }
        return this.firstInDescendant(children[0])
      }
    },

    lastInDescendant(block) {
      if (block.children.length === 0 && HAS_TEXT_BLOCK_REG.test(block.type)) return block
      if (block.children.length) {
        const { children } = block
        let lastChild = children[children.length - 1]
        while (lastChild.editable === false) lastChild = this.getPreSibling(lastChild)
        return this.lastInDescendant(lastChild)
      }
    },

    findPreBlockInLocation(block) {
      const parent = this.getParent(block)
      const preBlock = this.getPreSibling(block)
      if (
        block.preSibling &&
        preBlock.type !== 'input' &&
        preBlock.type !== 'div' &&
        preBlock.editable !== false
      ) {
        return this.lastInDescendant(preBlock)
      }
      if (parent) return this.findPreBlockInLocation(parent)
      return null
    },

    findNextBlockInLocation(block) {
      const parent = this.getParent(block)
      const nextBlock = this.getNextSibling(block)
      if (nextBlock && nextBlock.editable !== false) return this.firstInDescendant(nextBlock)
      if (parent) return this.findNextBlockInLocation(parent)
      return null
    },

    getPositionReference() {
      const { fontSize, lineHeight } = this.muya.options
      const { start } = this.cursor
      const block = this.getBlock(start.key)
      const { x, y, width } = selection.getCursorCoords()
      const height = fontSize * lineHeight
      const bottom = y + height
      const right = x + width
      const left = x
      const top = y
      return {
        getBoundingClientRect() {
          return { x, y, top, left, right, bottom, height, width }
        },
        clientWidth: width,
        clientHeight: height,
        id: block ? block.key : null
      }
    },

    getFirstBlock() {
      return this.firstInDescendant(this.blocks[0])
    },

    getLastBlock() {
      const { blocks } = this
      return this.lastInDescendant(blocks[blocks.length - 1])
    }
  })
}

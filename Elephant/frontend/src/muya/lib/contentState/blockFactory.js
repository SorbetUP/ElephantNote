import { getUniqueId, deepCopy } from '../utils'
import escapeCharactersMap, { escapeCharacters } from '../parser/escapeCharacter'

export default (ContentState) => {
  Object.assign(ContentState.prototype, {
    createBlock(type = 'span', extras = {}) {
      const key = getUniqueId()
      const blockData = {
        key,
        text: '',
        type,
        editable: true,
        parent: null,
        preSibling: null,
        nextSibling: null,
        children: []
      }

      if (type === 'span' && !extras.functionType) {
        blockData.functionType = 'paragraphContent'
      }

      if (extras.functionType === 'codeContent' && extras.text) {
        const CHAR_REG = new RegExp(`(${escapeCharacters.join('|')})`, 'gi')
        extras.text = extras.text.replace(CHAR_REG, (_, value) => escapeCharactersMap[value])
      }

      Object.assign(blockData, extras)
      return blockData
    },

    createBlockP(text = '') {
      const pBlock = this.createBlock('p')
      const contentBlock = this.createBlock('span', { text })
      this.appendChild(pBlock, contentBlock)
      return pBlock
    },

    isCollapse(cursor = this.cursor) {
      const { start, end } = cursor
      return start.key === end.key && start.offset === end.offset
    },

    setBlocks(blocks) {
      this.blocks = blocks
    },

    getBlocks() {
      return this.blocks
    },

    getCursor() {
      return this.cursor
    },

    copyBlock(origin) {
      const copiedBlock = deepCopy(origin)
      const travel = (block, parent, preBlock, nextBlock) => {
        block.key = getUniqueId()
        block.parent = parent ? parent.key : null
        block.preSibling = preBlock ? preBlock.key : null
        block.nextSibling = nextBlock ? nextBlock.key : null
        const { children } = block
        const len = children.length
        if (children && len) {
          for (let index = 0; index < len; index += 1) {
            const child = children[index]
            const previous = index >= 1 ? children[index - 1] : null
            const next = index < len - 1 ? children[index + 1] : null
            travel(child, block, previous, next)
          }
        }
      }

      travel(copiedBlock, null, null, null)
      return copiedBlock
    }
  })
}

import selection from '../selection'
import { findNearestParagraph, findOutMostParagraph } from '../selection/dom'

const backspaceCase = ContentState => {
  ContentState.prototype.checkBackspaceCase = function() {
    const node = selection.getSelectionStart()
    const paragraph = findNearestParagraph(node)
    const outMostParagraph = findOutMostParagraph(node)
    let block = this.getBlock(paragraph.id)
    if (block.type === 'span' && block.preSibling) return false
    if (block.type === 'span') block = this.getParent(block)
    const preBlock = this.getPreSibling(block)
    const outBlock = this.findOutMostBlock(block)
    const parent = this.getParent(block)
    const { left: outLeft } = selection.getCaretOffsets(outMostParagraph)
    const { left: inLeft } = selection.getCaretOffsets(paragraph)

    if (
      (parent && parent.type === 'li' && inLeft === 0 && this.isFirstChild(block)) ||
      (parent &&
        parent.type === 'li' &&
        inLeft === 0 &&
        parent.listItemType === 'task' &&
        preBlock.type === 'input')
    ) {
      if (this.isOnlyChild(parent)) {
        return { type: 'LI', info: 'REPLACEMENT' }
      }
      if (this.isFirstChild(parent)) {
        return { type: 'LI', info: 'REMOVE_INSERT_BEFORE' }
      }
      return { type: 'LI', info: 'INSERT_PRE_LIST_ITEM' }
    }
    if (parent && parent.type === 'blockquote' && inLeft === 0) {
      if (this.isOnlyChild(block)) {
        return { type: 'BLOCKQUOTE', info: 'REPLACEMENT' }
      }
      if (this.isFirstChild(block)) {
        return { type: 'BLOCKQUOTE', info: 'INSERT_BEFORE' }
      }
    }
    if (!outBlock.preSibling && outLeft === 0) return { type: 'STOP' }
  }
}

export default backspaceCase

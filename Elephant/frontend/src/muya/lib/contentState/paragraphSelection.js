import selection from '../selection'
import { PARAGRAPH_TYPES } from '../config'

const paragraphSelection = ContentState => {
  ContentState.prototype.selectionChange = function(cursor) {
    const selectionCursor = cursor || selection.getCursorRange()
    const resolvedCursor =
      selectionCursor && selectionCursor.start && selectionCursor.end
        ? selectionCursor
        : this.cursor
    const { start, end } = resolvedCursor || {}
    if (!start || !end) {
      throw new Error('selectionChange: expected cursor but cursor is null.')
    }
    const cursorCoords = selection.getCursorCoords()
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    if (!startBlock || !endBlock) {
      start.type = startBlock?.type || ''
      start.block = startBlock || { text: '', type: '' }
      end.type = endBlock?.type || ''
      end.block = endBlock || { text: '', type: '' }
      return {
        start,
        end,
        affiliation: [],
        cursorCoords
      }
    }
    const startParents = this.getParents(startBlock)
    const endParents = this.getParents(endBlock)
    const affiliation = startParents
      .filter(parent => endParents.includes(parent))
      .filter(parent => PARAGRAPH_TYPES.includes(parent.type))

    start.type = startBlock.type
    start.block = startBlock
    end.type = endBlock.type
    end.block = endBlock

    return {
      start,
      end,
      affiliation,
      cursorCoords
    }
  }

  ContentState.prototype.getCommonParent = function() {
    const { start, end, affiliation } = this.selectionChange()
    const parent = affiliation.length ? affiliation[0] : null
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    const startParentKeys = this.getParents(startBlock).map(block => block.key)
    const endParentKeys = this.getParents(endBlock).map(block => block.key)
    const children = parent ? parent.children : this.blocks
    let startIndex
    let endIndex
    for (const child of children) {
      if (startParentKeys.includes(child.key)) {
        startIndex = children.indexOf(child)
      }
      if (endParentKeys.includes(child.key)) {
        endIndex = children.indexOf(child)
      }
    }
    return { parent, startIndex, endIndex }
  }
}

export default paragraphSelection

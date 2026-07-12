import selection from '../selection'
import { HAS_TEXT_BLOCK_REG } from '../config'
import { completeHtmlSelector } from './tabSelector'

const tabHandler = ContentState => {
  ContentState.prototype.tabHandler = function(event) {
    event.preventDefault()
    if (event.isComposing) return

    const { start, end } = selection.getCursorRange()
    if (!start || !end) return
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)

    if (event.shiftKey && startBlock.functionType !== 'cellContent') {
      const unindentType = this.isUnindentableListItem(startBlock)
      if (unindentType) {
        this.unindentListItem(startBlock, unindentType)
        return
      }
    }

    if (
      start.key === end.key &&
      start.offset === end.offset &&
      HAS_TEXT_BLOCK_REG.test(startBlock.type) &&
      startBlock.functionType !== 'codeContent' &&
      startBlock.functionType !== 'languageInput'
    ) {
      const { text, key } = startBlock
      const { offset } = start
      const atEnd = this.checkCursorAtEndFormat(text, offset)
      if (atEnd) {
        this.cursor = {
          start: { key, offset: offset + atEnd.offset },
          end: { key, offset: offset + atEnd.offset },
          isEdit: false
        }
        return this.partialRender()
      }
    }

    if (
      start.key === end.key &&
      start.offset === end.offset &&
      startBlock.type === 'span' &&
      (!startBlock.functionType ||
        (startBlock.functionType === 'codeContent' &&
          /markup|html|xml|svg|mathml/.test(startBlock.lang)))
    ) {
      const completion = completeHtmlSelector(startBlock, { start, end })
      if (completion) {
        startBlock.text = completion.text
        const key = startBlock.key
        this.cursor = {
          start: { key, offset: completion.startOffset },
          end: { key, offset: completion.endOffset },
          isEdit: false
        }
        return this.partialRender()
      }
    }

    let nextCell
    if (start.key === end.key && startBlock.functionType === 'cellContent') {
      nextCell = event.shiftKey
        ? this.findPreviousCell(startBlock)
        : this.findNextCell(startBlock)
    } else if (endBlock.functionType === 'cellContent') {
      nextCell = endBlock
    }
    if (nextCell) {
      const { key } = nextCell
      const offset = 0
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: false
      }
      return this.singleRender(this.closest(nextCell, 'figure'))
    }

    if (this.isIndentableListItem()) return this.indentListItem()
    return this.insertTab(event)
  }
}

export default tabHandler

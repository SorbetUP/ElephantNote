import selection from '../selection'

const backspaceHandler = ContentState => {
  ContentState.prototype.backspaceHandler = function(event) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) return
    this.cursor = { start, end, isEdit: true }
    const block = this.getBlock(start.key)
    if (!block) return
    const { functionType } = block

    if (functionType === 'cellContent') {
      return this.deleteInTable(block, event)
    }
    if (functionType === 'codeContent') {
      return this.backspaceInCodeBlock(block)
    }
    if (functionType === 'languageInput') return

    if (this.backspaceInEmptyParagraph(block)) return
    const parent = this.getParent(block)
    if (parent && parent.type === 'li') {
      if (this.backspaceInListItem(block)) return
    }

    const { text } = block
    const isCollapsed = start.key === end.key && start.offset === end.offset
    if (!isCollapsed) {
      const startBlock = this.getBlock(start.key)
      const endBlock = this.getBlock(end.key)
      startBlock.text =
        startBlock.text.substring(0, start.offset) +
        endBlock.text.substring(end.offset)
      if (start.key !== end.key) this.removeBlocks(startBlock, endBlock)
      this.cursor = { start, end: start, isEdit: true }
      this.checkInlineUpdate(startBlock)
      this.partialRender()
      return this.muya.dispatchChange()
    }

    if (
      event.key === 'Backspace' &&
      start.offset > 0
    ) {
      block.text =
        text.substring(0, start.offset - 1) +
        text.substring(start.offset)
      const offset = start.offset - 1
      this.cursor = {
        start: { key: start.key, offset },
        end: { key: start.key, offset },
        isEdit: true
      }
      this.checkInlineUpdate(block)
      return this.partialRender()
    }

    if (
      event.key === 'Delete' &&
      start.offset < text.length
    ) {
      block.text =
        text.substring(0, start.offset) +
        text.substring(start.offset + 1)
      const offset = start.offset
      this.cursor = {
        start: { key: start.key, offset },
        end: { key: start.key, offset },
        isEdit: true
      }
      this.checkInlineUpdate(block)
      return this.partialRender()
    }

    return this.mergeBlock(block, event)
  }
}

export default backspaceHandler

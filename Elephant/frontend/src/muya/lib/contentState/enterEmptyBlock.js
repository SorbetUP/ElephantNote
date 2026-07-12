import { isOsx } from '../config'
import selection from '../selection'

const enterEmptyBlock = ContentState => {
  ContentState.prototype.enterInEmptyBlock = function(block, event) {
    const { start, end } = this.cursor
    const parent = this.getParent(block)
    const { key } = block
    if (parent.type === 'p' && parent.parent) {
      const parentOfParagraph = this.getParent(parent)
      if (parentOfParagraph.type === 'li') {
        return this.enterInListItem(block, event)
      }
    }

    if (
      parent.type === 'pre' &&
      parent.functionType === 'frontmatter'
    ) {
      const newParagraph = this.createBlockP()
      this.insertAfter(newParagraph, parent)
      const cursorBlock = newParagraph.children[0]
      const cursorKey = cursorBlock.key
      const offset = 0
      this.cursor = {
        start: { key: cursorKey, offset },
        end: { key: cursorKey, offset },
        isEdit: true
      }
      return this.partialRender()
    }

    if (
      block.type === 'span' &&
      block.functionType === 'paragraphContent' &&
      start.key === end.key &&
      start.offset === end.offset &&
      start.offset === 0
    ) {
      const anchor = this.getAnchor(block)
      if (!anchor.parent) {
        const newParagraph = this.createBlockP()
        this.insertAfter(newParagraph, anchor)
        const cursorBlock = newParagraph.children[0]
        const cursorKey = cursorBlock.key
        const offset = 0
        this.cursor = {
          start: { key: cursorKey, offset },
          end: { key: cursorKey, offset },
          isEdit: true
        }
        return this.partialRender()
      }
    }

    const nativeSelection = selection.getSelectionRange()
    if (
      nativeSelection &&
      nativeSelection.startContainer &&
      nativeSelection.startContainer.nodeType === 3 &&
      nativeSelection.startContainer.parentNode &&
      nativeSelection.startContainer.parentNode.classList.contains('ag-soft-line-break')
    ) {
      event.preventDefault()
      const lineBreak = nativeSelection.startContainer.parentNode
      const paragraph = lineBreak.closest('.ag-paragraph')
      const range = document.createRange()
      const index = Array.from(paragraph.childNodes).indexOf(lineBreak)
      if (event.shiftKey || (isOsx && event.ctrlKey)) {
        range.setStart(paragraph, index + 1)
      } else {
        range.setStart(paragraph, index)
      }
      range.collapse(true)
      selection.selectRange(range)
    }

    const paragraph = this.getParent(block)
    if (/^h\d$/.test(paragraph.type)) {
      return this.enterInHeading(block)
    }
    return false
  }
}

export default enterEmptyBlock

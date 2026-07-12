
const backspaceEmpty = ContentState => {
  ContentState.prototype.backspaceInEmptyParagraph = function(block) {
    const { start, end } = this.cursor
    if (
      start.key !== end.key ||
      start.offset !== end.offset ||
      start.offset !== 0 ||
      block.text
    ) {
      return
    }

    const paragraph = this.getParent(block)
    const parent = this.getParent(paragraph)
    if (!parent) return

    if (parent.type === 'li') {
      return this.backspaceInListItem(block)
    }

    if (
      paragraph.type === 'p' &&
      parent.type === 'blockquote' &&
      parent.children.length === 1
    ) {
      this.removeBlock(paragraph)
      this.insertBefore(paragraph, parent)
      this.removeBlock(parent)
      this.cursor = {
        start: { key: block.key, offset: 0 },
        end: { key: block.key, offset: 0 },
        isEdit: true
      }
      return this.partialRender()
    }

    if (
      paragraph.type === 'p' &&
      parent.type === 'figure' &&
      parent.functionType === 'footnote'
    ) {
      const previousBlock = this.findPreBlockInLocation(parent)
      if (previousBlock) {
        const offset = previousBlock.text.length
        this.removeBlock(parent)
        this.cursor = {
          start: { key: previousBlock.key, offset },
          end: { key: previousBlock.key, offset },
          isEdit: true
        }
        return this.partialRender()
      }
    }

    const previousBlock = this.findPreBlockInLocation(paragraph)
    if (!previousBlock) return
    const previousAnchor = this.getAnchor(previousBlock)
    if (!previousAnchor) return

    if (
      previousAnchor.type === 'hr' ||
      previousAnchor.type === 'figure'
    ) {
      const offset = previousBlock.text.length
      this.removeBlock(paragraph)
      this.cursor = {
        start: { key: previousBlock.key, offset },
        end: { key: previousBlock.key, offset },
        isEdit: true
      }
      return this.partialRender()
    }

    const offset = previousBlock.text.length
    previousBlock.text += block.text
    this.removeBlock(paragraph)
    this.cursor = {
      start: { key: previousBlock.key, offset },
      end: { key: previousBlock.key, offset },
      isEdit: true
    }
    return this.partialRender()
  }
}

export default backspaceEmpty

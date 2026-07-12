
const backspaceList = ContentState => {
  ContentState.prototype.backspaceInListItem = function(block) {
    const { start, end } = this.cursor
    if (start.key !== end.key || start.offset !== end.offset || start.offset !== 0) {
      return
    }
    const paragraph = this.getParent(block)
    const listItem = this.getParent(paragraph)
    const list = this.getParent(listItem)
    const previousListItem = this.getPreSibling(listItem)
    const previousBlock = this.findPreBlockInLocation(block)

    if (previousListItem) {
      const target = this.lastInDescendant(previousListItem)
      const offset = target.text.length
      target.text += block.text
      const childrenToMove = []
      let sibling = this.getNextSibling(paragraph)
      while (sibling) {
        childrenToMove.push(sibling)
        sibling = this.getNextSibling(sibling)
      }
      for (const child of childrenToMove) {
        this.removeBlock(child)
        this.appendChild(previousListItem, child)
      }
      this.removeBlock(listItem)
      this.cursor = {
        start: { key: target.key, offset },
        end: { key: target.key, offset },
        isEdit: true
      }
      return this.partialRender()
    }

    const parent = this.getParent(list)
    if (parent && parent.type === 'li') {
      const anchor = this.getParent(parent)
      this.removeBlock(listItem)
      this.insertAfter(listItem, anchor)
      if (!list.children.length) this.removeBlock(list)
      this.cursor = {
        start: { key: block.key, offset: 0 },
        end: { key: block.key, offset: 0 },
        isEdit: true
      }
      return this.partialRender()
    }

    if (previousBlock) {
      const anchor = this.getAnchor(previousBlock)
      this.removeBlock(listItem)
      this.insertAfter(paragraph, anchor)
      if (!list.children.length) this.removeBlock(list)
      this.cursor = {
        start: { key: block.key, offset: 0 },
        end: { key: block.key, offset: 0 },
        isEdit: true
      }
      return this.partialRender()
    }

    this.removeBlock(listItem)
    this.insertBefore(paragraph, list)
    if (!list.children.length) this.removeBlock(list)
    this.cursor = {
      start: { key: block.key, offset: 0 },
      end: { key: block.key, offset: 0 },
      isEdit: true
    }
    return this.partialRender()
  }
}

export default backspaceList

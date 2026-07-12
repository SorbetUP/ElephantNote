const tabLists = ContentState => {
  ContentState.prototype.isUnindentableListItem = function(block) {
    const parent = this.getParent(block)
    const listItem = this.getParent(parent)
    const list = this.getParent(listItem)
    const listParent = this.getParent(list)
    if (!this.isCollapse()) return false
    if (listParent && listParent.type === 'li') {
      return !list.preSibling ? 'REPLACEMENT' : 'INDENT'
    }
    return false
  }

  ContentState.prototype.isIndentableListItem = function() {
    const { start, end } = this.cursor
    const startBlock = this.getBlock(start.key)
    const parent = this.getParent(startBlock)
    if (parent.type !== 'p' || !parent.parent) return false
    const listItem = this.getParent(parent)
    if (listItem.type !== 'li' || start.key !== end.key || start.offset !== end.offset) {
      return false
    }
    const list = this.getParent(listItem)
    return list && /ol|ul/.test(list.type) && listItem.preSibling
  }

  ContentState.prototype.unindentListItem = function(block, type) {
    const pBlock = this.getParent(block)
    const listItem = this.getParent(pBlock)
    const list = this.getParent(listItem)
    const listParent = this.getParent(list)
    if (type === 'REPLACEMENT') {
      this.insertBefore(pBlock, list)
      if (this.isOnlyChild(listItem)) this.removeBlock(list)
      else this.removeBlock(listItem)
    } else if (type === 'INDENT') {
      if (list.children.length === 1) {
        this.removeBlock(list)
      } else {
        const newList = this.createBlock(list.type)
        let target = this.getNextSibling(listItem)
        while (target) {
          this.appendChild(newList, target)
          const temp = target
          target = this.getNextSibling(target)
          this.removeBlock(temp, list)
        }
        if (newList.children.length) this.appendChild(listItem, newList)
        this.removeBlock(listItem, list)
        if (!list.children.length) this.removeBlock(list)
      }
      this.insertAfter(listItem, listParent)
      let target = this.getNextSibling(list)
      while (target) {
        this.appendChild(listItem, target)
        this.removeBlock(target, listParent)
        target = this.getNextSibling(target)
      }
    }
    return this.partialRender()
  }

  ContentState.prototype.indentListItem = function() {
    const { start } = this.cursor
    const startBlock = this.getBlock(start.key)
    const parent = this.getParent(startBlock)
    const listItem = this.getParent(parent)
    const list = this.getParent(listItem)
    const previousListItem = this.getPreSibling(listItem)
    this.removeBlock(listItem)

    let newList = this.getLastChild(previousListItem)
    if (!newList || !/ol|ul/.test(newList.type)) {
      newList = this.createBlock(list.type, { listType: list.listType })
      this.appendChild(previousListItem, newList)
    }
    if (newList.children.length !== 0) {
      listItem.isLooseListItem = newList.children[0].isLooseListItem
    }
    this.appendChild(newList, listItem)
    return this.partialRender()
  }
}

export default tabLists

const updateTaskList = ContentState => {
  ContentState.prototype.updateTaskListItem = function(
    block,
    type,
    marker = ''
  ) {
    const { preferLooseListItem } = this.muya.options
    const parent = this.getParent(block)
    const grandparent = this.getParent(parent)
    const checkbox = this.createBlock('input', {
      checked: /\[x\]\s/i.test(marker)
    })
    const { start, end } = this.cursor

    this.insertBefore(checkbox, block)
    block.children[0].text = block.children[0].text.substring(marker.length)
    parent.listItemType = 'task'
    parent.isLooseListItem = preferLooseListItem

    let taskListWrapper
    if (this.isOnlyChild(parent)) {
      grandparent.listType = 'task'
    } else if (this.isFirstChild(parent) || this.isLastChild(parent)) {
      taskListWrapper = this.createBlock('ul', { listType: 'task' })
      this.isFirstChild(parent)
        ? this.insertBefore(taskListWrapper, grandparent)
        : this.insertAfter(taskListWrapper, grandparent)
      this.removeBlock(parent)
      this.appendChild(taskListWrapper, parent)
    } else {
      taskListWrapper = this.createBlock('ul', { listType: 'task' })
      const bulletListWrapper = this.createBlock('ul', {
        listType: 'bullet'
      })
      let previous = this.getPreSibling(parent)
      while (previous) {
        this.removeBlock(previous)
        if (bulletListWrapper.children.length) {
          this.insertBefore(previous, bulletListWrapper.children[0])
        } else {
          this.appendChild(bulletListWrapper, previous)
        }
        previous = this.getPreSibling(previous)
      }
      this.removeBlock(parent)
      this.appendChild(taskListWrapper, parent)
      this.insertBefore(taskListWrapper, grandparent)
      this.insertBefore(bulletListWrapper, taskListWrapper)
    }

    this.cursor = {
      start: {
        key: start.key,
        offset: Math.max(0, start.offset - marker.length)
      },
      end: {
        key: end.key,
        offset: Math.max(0, end.offset - marker.length)
      },
      isEdit: true
    }
    return taskListWrapper || grandparent
  }
}

export default updateTaskList

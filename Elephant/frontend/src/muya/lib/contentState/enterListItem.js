import selection from '../selection'

const FOOTNOTE_REG = /^\[\^([^\^\[\]\s]+?)(?<!\\)\]:$/

const checkAutoIndent = (text, offset) => {
  return /^(?: *)(?:(?:[-*+] |\d+[.)] )|(?:> ))/.exec(text.substring(0, offset))
}

const getCodeblockIndentSpace = text => {
  const whitespace = /^ +/.exec(text)
  return whitespace ? whitespace[0] : ''
}

const enterListItem = ContentState => {
  ContentState.prototype.enterInListItem = function(block, event) {
    const { start, end } = this.cursor
    const parent = this.getParent(block)
    const listItem = this.getParent(parent)
    const list = this.getParent(listItem)
    const { key } = block
    const { text } = block
    const preText = text.substring(0, start.offset)
    const postText = text.substring(end.offset)
    const isEmptyItem = !text
    const isAtLineEnd = end.offset === text.length
    const newItem = this.createBlock('li', {
      listItemType: listItem.listItemType,
      isLooseListItem: listItem.isLooseListItem,
      bulletMarkerOrDelimiter: listItem.bulletMarkerOrDelimiter
    })
    let newParagraph
    let cursorBlock
    let offset = 0

    if (isEmptyItem) {
      const nextListItem = this.getNextSibling(listItem)
      const nextBlock = nextListItem
        ? this.firstInDescendant(nextListItem)
        : this.findNextBlockInLocation(list)
      if (nextBlock) {
        cursorBlock = nextBlock
      } else {
        newParagraph = this.createBlockP()
        this.insertAfter(newParagraph, list)
        cursorBlock = newParagraph.children[0]
      }
      this.removeBlock(listItem)
      if (!list.children.length) this.removeBlock(list)
    } else if (event.shiftKey) {
      const lineEnd = preText.lastIndexOf('\n') + 1
      const lineStart = preText.substring(0, lineEnd)
      const lineContent = preText.substring(lineEnd)
      const indent = getCodeblockIndentSpace(lineContent)
      block.text = `${lineStart}${lineContent}\n${indent}${postText}`
      cursorBlock = block
      offset = start.offset + indent.length + 1
    } else if (
      parent.type === 'p' &&
      block.functionType === 'paragraphContent' &&
      FOOTNOTE_REG.test(preText.trim()) &&
      listItem.listItemType !== 'task'
    ) {
      const footnote = this.createBlock('figure', { functionType: 'footnote' })
      const identifier = this.createBlock('span', {
        functionType: 'footnoteInput',
        text: preText.trim().slice(2, -2)
      })
      const paragraph = this.createBlockP(postText)
      this.appendChild(footnote, identifier)
      this.appendChild(footnote, paragraph)
      this.insertBefore(footnote, list)
      this.removeBlock(listItem)
      if (!list.children.length) this.removeBlock(list)
      cursorBlock = paragraph.children[0]
    } else if (isAtLineEnd) {
      if (listItem.listItemType === 'task') {
        const checkbox = this.createBlock('input', { checked: false })
        this.appendChild(newItem, checkbox)
      }
      newParagraph = this.createBlockP()
      this.appendChild(newItem, newParagraph)
      this.insertAfter(newItem, listItem)
      cursorBlock = newParagraph.children[0]
    } else {
      block.text = preText
      if (listItem.listItemType === 'task') {
        const checkbox = this.createBlock('input', { checked: false })
        this.appendChild(newItem, checkbox)
      }
      newParagraph = this.createBlockP(postText)
      this.appendChild(newItem, newParagraph)
      const childrenToMove = []
      let sibling = this.getNextSibling(parent)
      while (sibling) {
        childrenToMove.push(sibling)
        sibling = this.getNextSibling(sibling)
      }
      for (const child of childrenToMove) {
        this.removeBlock(child)
        this.appendChild(newItem, child)
      }
      this.insertAfter(newItem, listItem)
      cursorBlock = newParagraph.children[0]
    }

    const cursorKey = cursorBlock.key
    this.cursor = {
      start: { key: cursorKey, offset },
      end: { key: cursorKey, offset },
      isEdit: true
    }
    return this.partialRender()
  }
}

export default enterListItem

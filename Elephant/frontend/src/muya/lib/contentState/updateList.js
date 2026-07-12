import { INLINE_UPDATE_REG } from './updateChecks'

const mergeWithAdjacentLists = (
  contentState,
  block,
  listItem,
  markerOrDelimiter,
  wrapperTag,
  type,
  cleanMarker
) => {
  const previous = contentState.getPreSibling(block)
  const next = contentState.getNextSibling(block)
  if (
    previous &&
    contentState.checkSameMarkerOrDelimiter(previous, markerOrDelimiter) &&
    next &&
    contentState.checkSameMarkerOrDelimiter(next, markerOrDelimiter)
  ) {
    contentState.appendChild(previous, listItem)
    const children = next.children.splice(0)
    children.forEach(child => contentState.appendChild(previous, child))
    contentState.removeBlock(next)
    contentState.removeBlock(block)
    const loose = previous.children.some(child => child.isLooseListItem)
    previous.children.forEach(child => (child.isLooseListItem = loose))
  } else if (
    previous &&
    contentState.checkSameMarkerOrDelimiter(previous, markerOrDelimiter)
  ) {
    contentState.appendChild(previous, listItem)
    contentState.removeBlock(block)
    const loose = previous.children.some(child => child.isLooseListItem)
    previous.children.forEach(child => (child.isLooseListItem = loose))
  } else if (
    next &&
    contentState.checkSameMarkerOrDelimiter(next, markerOrDelimiter)
  ) {
    contentState.insertBefore(listItem, next.children[0])
    contentState.removeBlock(block)
    const loose = next.children.some(child => child.isLooseListItem)
    next.children.forEach(child => (child.isLooseListItem = loose))
  } else {
    const list = contentState.createBlock(wrapperTag, { listType: type })
    if (wrapperTag === 'ol') {
      const start = cleanMarker ? cleanMarker.slice(0, -1) : 1
      list.start = /^\d+$/.test(start) ? start : 1
    }
    contentState.appendChild(list, listItem)
    contentState.insertBefore(list, block)
    contentState.removeBlock(block)
  }
}

const updateList = ContentState => {
  ContentState.prototype.updateList = function(block, type, marker = '', line) {
    const cleanMarker = marker ? marker.trim() : null
    const { preferLooseListItem } = this.muya.options
    const wrapperTag = type === 'order' ? 'ol' : 'ul'
    const { start, end } = this.cursor
    const startOffset = start.offset
    const endOffset = end.offset
    const listItem = this.createBlock('li')
    const listItemReg = /^ {0,3}(?:[*+-]|\d{1,9}(?:\.|\))) {0,4}/
    const lines = line.text.split('\n')
    const preParagraphLines = []
    let listItemLines = []
    let foundListItem = false

    if (marker) {
      for (const currentLine of lines) {
        if (listItemReg.test(currentLine) && !foundListItem) {
          listItemLines.push(currentLine.replace(listItemReg, ''))
          foundListItem = true
        } else if (!foundListItem) {
          preParagraphLines.push(currentLine)
        } else {
          listItemLines.push(currentLine)
        }
      }
    } else {
      listItemLines = lines
    }

    const paragraph = this.createBlockP(listItemLines.join('\n'))
    this.insertBefore(paragraph, block)
    if (preParagraphLines.length > 0) {
      this.insertBefore(
        this.createBlockP(preParagraphLines.join('\n')),
        paragraph
      )
    }
    this.removeBlock(block)
    block = paragraph

    listItem.listItemType = type
    listItem.isLooseListItem = preferLooseListItem
    let markerOrDelimiter
    if (type === 'order') {
      markerOrDelimiter = cleanMarker && cleanMarker.length >= 2
        ? cleanMarker.slice(-1)
        : '.'
    } else {
      markerOrDelimiter = marker
        ? marker.charAt(0)
        : this.muya.options.bulletListMarker
    }
    listItem.bulletMarkerOrDelimiter = markerOrDelimiter
    mergeWithAdjacentLists(
      this,
      block,
      listItem,
      markerOrDelimiter,
      wrapperTag,
      type,
      cleanMarker
    )

    this.appendChild(listItem, block)
    const taskListReg = /^\[[x ]\] {1,4}/i
    const listItemText = block.children[0].text
    const { key } = block.children[0]
    const delta = marker.length + preParagraphLines.join('\n').length + 1
    this.cursor = {
      start: { key, offset: Math.max(0, startOffset - delta) },
      end: { key, offset: Math.max(0, endOffset - delta) },
      isEdit: true
    }
    if (taskListReg.test(listItemText)) {
      const [, , tasklist, , , ,] = listItemText.match(INLINE_UPDATE_REG) || []
      return this.updateTaskListItem(block, 'tasklist', tasklist)
    }
    return block
  }
}

export default updateList

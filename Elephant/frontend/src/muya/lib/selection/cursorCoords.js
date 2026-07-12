export const getCursorCoords = selection => {
  const nativeSelection = selection.doc.getSelection()
  let x = 0
  let y = 0
  let width = 0

  if (nativeSelection.rangeCount) {
    const range = nativeSelection.getRangeAt(0).cloneRange()
    if (range.getClientRects) {
      let rects = range.getClientRects()
      if (
        rects.length === 0 &&
        range.startContainer &&
        (range.startContainer.nodeType === Node.ELEMENT_NODE ||
          range.startContainer.nodeType === Node.TEXT_NODE)
      ) {
        rects = range.startContainer.parentElement.getClientRects()
        if (rects.length) rects[0].y += 1
      }
      if (rects.length) {
        const {
          left,
          top,
          x: rectX,
          y: rectY,
          width: rectWidth
        } = rects[0]
        x = rectX || left
        y = rectY || top
        width = rectWidth
      }
    }
  }
  return { x, y, width }
}

export const getCursorYOffset = (selection, paragraph) => {
  const { y } = selection.getCursorCoords()
  const { height, top } = paragraph.getBoundingClientRect()
  const lineHeight = parseFloat(getComputedStyle(paragraph).lineHeight)
  return {
    topOffset: Math.round((y - top) / lineHeight),
    bottomOffset: Math.round((top + height - lineHeight - y) / lineHeight)
  }
}

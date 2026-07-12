import selection from '../selection'

export const updateClickCursorState = (contentState, start, end, block) => {
  let needRender = false

  if (block && start.key !== contentState.cursor.start.key) {
    const oldBlock = contentState.getBlock(contentState.cursor.start.key)
    if (oldBlock) {
      needRender = needRender || contentState.codeBlockUpdate(oldBlock)
    }
  }

  if (start.key !== contentState.cursor.start.key || end.key !== contentState.cursor.end.key) {
    needRender = true
  }

  const needMarkedUpdate =
    contentState.checkNeedRender(contentState.cursor) ||
    contentState.checkNeedRender({ start, end })

  if (needRender) {
    contentState.cursor = {
      start,
      end,
      isEdit: false
    }
    return contentState.partialRender()
  } else if (needMarkedUpdate) {
    requestAnimationFrame(() => {
      const cursor = selection.getCursorRange()
      if (!cursor.start || !cursor.end) return
      contentState.cursor = cursor
      return contentState.partialRender()
    })
  } else {
    contentState.cursor = {
      start,
      end,
      isEdit: false
    }
  }
}

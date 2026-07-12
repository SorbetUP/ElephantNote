export default function finalizeInput(
  contentState,
  { block, paragraph, start, end, needRender, needRenderAll }
) {
  const rect = paragraph.getBoundingClientRect()
  const checkQuickInsert = contentState.checkQuickInsert(block)
  const reference = contentState.getPositionReference()
  reference.getBoundingClientRect = function() {
    const { x, y, left, top, height, bottom } = rect
    return Object.assign({}, {
      left,
      x,
      top,
      y,
      bottom,
      height,
      width: 0,
      right: left
    })
  }
  contentState.muya.eventCenter.dispatch(
    'muya-quick-insert',
    reference,
    block,
    !!checkQuickInsert
  )

  contentState.cursor = { start, end, isEdit: true }
  if (block && block.type === 'span' && block.functionType === 'codeContent') {
    if (contentState.renderCodeBlockTimer) clearTimeout(contentState.renderCodeBlockTimer)
    if (needRender) {
      contentState.partialRender()
    } else {
      contentState.renderCodeBlockTimer = setTimeout(() => {
        contentState.partialRender()
      }, 300)
    }
    return
  }

  const checkMarkedUpdate = /atxLine|paragraphContent|cellContent/.test(block.functionType)
    ? contentState.checkNeedRender()
    : false
  let inlineUpdatedBlock = null
  if (/atxLine|paragraphContent|cellContent|thematicBreakLine/.test(block.functionType)) {
    inlineUpdatedBlock = contentState.isCollapse() && contentState.checkInlineUpdate(block)
  }
  if (inlineUpdatedBlock) {
    const liBlock = contentState.getParent(inlineUpdatedBlock)
    if (liBlock && liBlock.type === 'li' && liBlock.preSibling && liBlock.nextSibling) {
      needRenderAll = true
    }
  }
  if (checkMarkedUpdate || inlineUpdatedBlock || needRender) {
    return needRenderAll ? contentState.render() : contentState.partialRender()
  }
}

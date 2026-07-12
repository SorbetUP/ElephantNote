export default function mergeBackspacePrevious(contentState, event, context) {
  const { left, preBlock } = context
  if (left !== 0 || !preBlock) return { handled: false, context }
  event.preventDefault()
  const { block, parent } = context
  const { text } = block
  const key = preBlock.key
  const offset = preBlock.text.length
  preBlock.text += text
  if (contentState.isOnlyChild(block) && block.type === 'span') {
    contentState.removeBlock(parent)
  } else if (
    block.functionType !== 'languageInput' &&
    block.functionType !== 'footnoteInput'
  ) {
    contentState.removeBlock(block)
  }

  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  let needRenderAll = false
  if (
    contentState.isCollapse() &&
    preBlock.type === 'span' &&
    preBlock.functionType === 'paragraphContent'
  ) {
    contentState.checkInlineUpdate(preBlock)
    needRenderAll = true
  }
  if (needRenderAll) contentState.render()
  else contentState.partialRender()
  return { handled: true, value: undefined }
}

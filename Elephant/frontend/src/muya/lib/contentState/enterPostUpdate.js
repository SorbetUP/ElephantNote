export default function finishEnter(contentState, context) {
  const {
    block,
    newBlock,
    getParagraphBlock
  } = context
  contentState.codeBlockUpdate(getParagraphBlock(newBlock))
  const previousParagraph = getParagraphBlock(block)
  const blockNeedFocus = contentState.codeBlockUpdate(previousParagraph)
  const tableNeedFocus = contentState.tableBlockUpdate(previousParagraph)
  const htmlNeedFocus = contentState.updateHtmlBlock(previousParagraph)
  const mathNeedFocus = contentState.updateMathBlock(previousParagraph)
  let cursorBlock

  if (blockNeedFocus) cursorBlock = block
  else if (tableNeedFocus) cursorBlock = tableNeedFocus
  else if (htmlNeedFocus) cursorBlock = htmlNeedFocus.children[0].children[0]
  else if (mathNeedFocus) cursorBlock = mathNeedFocus
  else cursorBlock = newBlock

  cursorBlock = getParagraphBlock(cursorBlock)
  const key =
    cursorBlock.type === 'p' || cursorBlock.type === 'pre'
      ? cursorBlock.children[0].key
      : cursorBlock.key
  let offset = 0
  if (htmlNeedFocus) {
    const match = /^[^\n]+\n[^\n]*/.exec(cursorBlock.text)
    offset = match && match[0] ? match[0].length : 0
  }
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }

  let needRenderAll = false
  if (contentState.isCollapse() && cursorBlock.type === 'p') {
    contentState.checkInlineUpdate(cursorBlock.children[0])
    needRenderAll = true
  }
  if (needRenderAll) contentState.render()
  else contentState.partialRender()
}

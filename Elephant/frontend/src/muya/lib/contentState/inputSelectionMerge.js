export default function mergeInputSelection(contentState, oldStart, oldEnd, start, end, text) {
  let needRender = false
  let needRenderAll = false
  if (oldStart.key === oldEnd.key) return { text, needRender, needRenderAll }

  const startBlock = contentState.getBlock(oldStart.key)
  const startOutmostBlock = contentState.findOutMostBlock(startBlock)
  const endBlock = contentState.getBlock(oldEnd.key)
  const endOutmostBlock = contentState.findOutMostBlock(endBlock)
  if (startBlock.functionType === 'languageInput') {
    if (startOutmostBlock === endOutmostBlock && !endBlock.nextSibling) {
      contentState.removeBlocks(startBlock, endBlock, false)
      endBlock.text = ''
    } else if (startOutmostBlock !== endOutmostBlock) {
      const preBlock = contentState.getParent(startBlock)
      const pBlock = contentState.createBlock('p')
      contentState.removeBlocks(startBlock, endBlock)
      startBlock.functionType = 'paragraphContent'
      contentState.appendChild(pBlock, startBlock)
      contentState.insertBefore(pBlock, preBlock)
      contentState.removeBlock(preBlock)
    } else {
      contentState.removeBlocks(startBlock, endBlock)
    }
  } else if (
    startBlock.functionType === 'paragraphContent' &&
    start.key === end.key &&
    oldStart.key === start.key &&
    oldEnd.key !== end.key
  ) {
    const matchBreak = /(?<=.)\n./.exec(endBlock.text)
    if (matchBreak && matchBreak.index > 0) {
      const lineOffset = matchBreak.index
      if (oldEnd.offset <= lineOffset) text += endBlock.text.substring(lineOffset)
    }
    contentState.removeBlocks(startBlock, endBlock)
  } else {
    contentState.removeBlocks(startBlock, endBlock)
  }

  if (contentState.blocks.length === 1) needRenderAll = true
  needRender = true
  return { text, needRender, needRenderAll }
}

import { handled } from './backspaceResults'

export const handleTableHeaderBackspace = (
  contentState,
  event,
  start,
  end,
  startBlock,
  endBlock,
  startOutmostBlock,
  endOutmostBlock,
  maybeLastRow
) => {
  const maybeCell = contentState.getParent(startBlock)
  if (!/th/.test(maybeCell.type) || start.offset !== 0 || maybeCell.preSibling) return null

  const removesTable = (end.offset === endBlock.text.length &&
    startOutmostBlock === endOutmostBlock &&
    !endBlock.nextSibling &&
    !maybeLastRow.nextSibling) || startOutmostBlock !== endOutmostBlock
  if (!removesTable) return null

  event.preventDefault()
  const figureBlock = contentState.getBlock(contentState.closest(startBlock, 'figure'))
  const paragraph = contentState.createBlockP(endBlock.text.substring(end.offset))
  contentState.insertBefore(paragraph, figureBlock)
  const cursorBlock = paragraph.children[0]
  if (startOutmostBlock !== endOutmostBlock) contentState.removeBlocks(figureBlock, endBlock)
  contentState.removeBlock(figureBlock)
  const { key } = cursorBlock
  const offset = 0
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  return handled(contentState.render())
}

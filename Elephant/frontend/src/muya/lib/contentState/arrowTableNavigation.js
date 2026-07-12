import { EVENT_KEYS } from '../config'
import { adjustArrowOffset } from './arrowOffset'

const selectActiveBlock = (contentState, event, activeBlock) => {
  event.preventDefault()
  event.stopPropagation()
  let offset = activeBlock.type === 'p'
    ? 0
    : event.key === EVENT_KEYS.ArrowUp ? activeBlock.text.length : 0
  offset = adjustArrowOffset(offset, activeBlock, event)
  const key = activeBlock.type === 'p' ? activeBlock.children[0].key : activeBlock.key
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: false
  }
  return contentState.partialRender()
}

export const navigateTableRows = (contentState, event, block) => {
  if (block.functionType !== 'cellContent') return { handled: false }
  let activeBlock
  const cellInNextRow = contentState.findNextRowCell(block)
  const cellInPrevRow = contentState.findPrevRowCell(block)
  if (event.key === EVENT_KEYS.ArrowUp) {
    activeBlock = cellInPrevRow ||
      contentState.findPreBlockInLocation(contentState.getTableBlock())
  }
  if (event.key === EVENT_KEYS.ArrowDown) {
    activeBlock = cellInNextRow ||
      contentState.findNextBlockInLocation(contentState.getTableBlock())
  }
  return activeBlock
    ? { handled: true, value: selectActiveBlock(contentState, event, activeBlock) }
    : { handled: false }
}

import { EVENT_KEYS } from '../config'
import { findNearestParagraph } from '../selection/dom'
import selection from '../selection'
import { adjustArrowOffset } from './arrowOffset'
import { docArrowHandler } from './arrowImageNavigation'
import { handleMathArrowRight } from './arrowMathNavigation'
import { navigateTableRows } from './arrowTableRowHandler'

export { docArrowHandler }

export function arrowHandler(event) {
  const node = selection.getSelectionStart()
  const paragraph = findNearestParagraph(node)
  const block = this.getBlock(paragraph.id)
  const preBlock = this.findPreBlockInLocation(block)
  const nextBlock = this.findNextBlockInLocation(block)
  const { start, end } = selection.getCursorRange()
  const { topOffset, bottomOffset } = selection.getCursorYOffset(paragraph)
  if (!start || !end) return

  const mathNavigation = handleMathArrowRight(event, node, start, end)
  if (mathNavigation.handled) return mathNavigation.value
  if ((start.key === end.key && start.offset !== end.offset) || start.key !== end.key || event.shiftKey) return
  if ((event.key === EVENT_KEYS.ArrowUp && topOffset > 0) ||
      (event.key === EVENT_KEYS.ArrowDown && bottomOffset > 0)) {
    if (!/pre/.test(block.type) || block.functionType !== 'cellContent') return
  }

  const tableNavigation = navigateTableRows(this, event, block)
  if (tableNavigation.handled) return tableNavigation.value

  if (event.key === EVENT_KEYS.ArrowUp ||
      (event.key === EVENT_KEYS.ArrowLeft && start.offset === 0)) {
    event.preventDefault()
    event.stopPropagation()
    if (!preBlock) return
    const key = preBlock.key
    const offset = preBlock.text.length
    this.cursor = {
      start: { key, offset }, end: { key, offset }, isEdit: false
    }
    return this.partialRender()
  }
  if (event.key !== EVENT_KEYS.ArrowDown &&
      !(event.key === EVENT_KEYS.ArrowRight && start.offset === block.text.length)) return

  event.preventDefault()
  event.stopPropagation()
  let key
  let newBlock
  if (nextBlock) key = nextBlock.key
  else {
    newBlock = this.createBlockP()
    this.insertAfter(newBlock, this.blocks[this.blocks.length - 1])
    key = newBlock.children[0].key
  }
  const offset = adjustArrowOffset(0, nextBlock || newBlock, event)
  this.cursor = {
    start: { key, offset }, end: { key, offset }, isEdit: !!newBlock
  }
  return this.partialRender()
}

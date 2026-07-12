import { EVENT_KEYS, CLASS_OR_ID } from '../config'
import { findNearestParagraph } from '../selection/dom'
import selection from '../selection'

const adjustOffset = (offset, block, event) => {
  if (
    /^span$/.test(block.type) &&
    block.functionType === 'atxLine' &&
    event.key === EVENT_KEYS.ArrowDown
  ) {
    const match = /^\s{0,3}(?:#{1,6})(?:\s{1,}|$)/.exec(block.text)
    if (match) return match[0].length
  }
  return offset
}

export function docArrowHandler(event) {
  const { selectedImage } = this
  if (selectedImage) {
    const { key, token } = selectedImage
    const { start, end } = token.range
    event.preventDefault()
    event.stopPropagation()
    const block = this.getBlock(key)
    switch (event.key) {
      case EVENT_KEYS.ArrowUp:
      case EVENT_KEYS.ArrowLeft:
        this.cursor = {
          start: { key, offset: start },
          end: { key, offset: start },
          isEdit: false
        }
        break
      case EVENT_KEYS.ArrowDown:
      case EVENT_KEYS.ArrowRight:
        this.cursor = {
          start: { key, offset: end },
          end: { key, offset: end },
          isEdit: false
        }
        break
    }
    this.muya.keyboard.hideAllFloatTools()
    return this.singleRender(block)
  }
}

const handleMathArrowRight = (event, node, start, end) => {
  if (
    event.key !== EVENT_KEYS.ArrowRight ||
    !node ||
    !node.classList ||
    !node.classList.contains(CLASS_OR_ID.AG_MATH_TEXT)
  ) {
    return false
  }
  const { right } = selection.getCaretOffsets(node)
  if (right === 0 && start.key === end.key && start.offset === end.offset) {
    selection.select(node.parentNode.nextElementSibling, 0)
    return true
  }
  return false
}

const selectActiveBlock = (contentState, event, activeBlock) => {
  event.preventDefault()
  event.stopPropagation()
  let offset = activeBlock.type === 'p'
    ? 0
    : event.key === EVENT_KEYS.ArrowUp
      ? activeBlock.text.length
      : 0
  offset = adjustOffset(offset, activeBlock, event)
  const key = activeBlock.type === 'p' ? activeBlock.children[0].key : activeBlock.key
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: false
  }
  return contentState.partialRender()
}

const navigateTableRows = (contentState, event, block) => {
  if (block.functionType !== 'cellContent') return { handled: false }
  let activeBlock
  const cellInNextRow = contentState.findNextRowCell(block)
  const cellInPrevRow = contentState.findPrevRowCell(block)

  if (event.key === EVENT_KEYS.ArrowUp) {
    activeBlock = cellInPrevRow || contentState.findPreBlockInLocation(contentState.getTableBlock())
  }
  if (event.key === EVENT_KEYS.ArrowDown) {
    activeBlock = cellInNextRow || contentState.findNextBlockInLocation(contentState.getTableBlock())
  }
  if (activeBlock) {
    return { handled: true, value: selectActiveBlock(contentState, event, activeBlock) }
  }
  return { handled: false }
}

export function arrowHandler(event) {
  const node = selection.getSelectionStart()
  const paragraph = findNearestParagraph(node)
  const id = paragraph.id
  const block = this.getBlock(id)
  const preBlock = this.findPreBlockInLocation(block)
  const nextBlock = this.findNextBlockInLocation(block)
  const { start, end } = selection.getCursorRange()
  const { topOffset, bottomOffset } = selection.getCursorYOffset(paragraph)
  if (!start || !end) return

  if (handleMathArrowRight(event, node, start, end)) return

  if (
    (start.key === end.key && start.offset !== end.offset) ||
    start.key !== end.key ||
    event.shiftKey
  ) {
    return
  }

  if (
    (event.key === EVENT_KEYS.ArrowUp && topOffset > 0) ||
    (event.key === EVENT_KEYS.ArrowDown && bottomOffset > 0)
  ) {
    if (!/pre/.test(block.type) || block.functionType !== 'cellContent') return
  }

  const tableNavigation = navigateTableRows(this, event, block)
  if (tableNavigation.handled) return tableNavigation.value

  if (
    event.key === EVENT_KEYS.ArrowUp ||
    (event.key === EVENT_KEYS.ArrowLeft && start.offset === 0)
  ) {
    event.preventDefault()
    event.stopPropagation()
    if (!preBlock) return
    const key = preBlock.key
    const offset = preBlock.text.length
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: false
    }
    return this.partialRender()
  } else if (
    event.key === EVENT_KEYS.ArrowDown ||
    (event.key === EVENT_KEYS.ArrowRight && start.offset === block.text.length)
  ) {
    event.preventDefault()
    event.stopPropagation()
    let key
    let newBlock
    if (nextBlock) {
      key = nextBlock.key
    } else {
      newBlock = this.createBlockP()
      const lastBlock = this.blocks[this.blocks.length - 1]
      this.insertAfter(newBlock, lastBlock)
      key = newBlock.children[0].key
    }
    const offset = adjustOffset(0, nextBlock || newBlock, event)
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: !!newBlock
    }
    return this.partialRender()
  }
}

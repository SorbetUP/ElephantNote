import selection from '../selection'
import { findNearestParagraph } from '../selection/dom'
import handleBackspaceInitial from './backspaceInitialCases'
import handleBackspaceInline from './backspaceInlineCases'
import handleBackspaceStructured from './backspaceStructuredCases'
import handleBackspaceDegrade from './backspaceDegrade'
import mergeBackspacePrevious from './backspaceMergePrevious'

const backspaceHandler = ContentState => {
  ContentState.prototype.backspaceHandler = function(event) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) return

    const initial = handleBackspaceInitial(this, event, start, end)
    if (initial.handled) return initial.value
    const { startBlock } = initial.context
    const node = selection.getSelectionStart()
    const parentNode = node && node.nodeType === 1 ? node.parentNode : null
    const paragraph = findNearestParagraph(node)
    let block = this.getBlock(paragraph.id)
    let parent = this.getBlock(block.parent)
    const preBlock = this.findPreBlockInLocation(block)
    const { left, right } = selection.getCaretOffsets(paragraph)
    const inlineDegrade = this.checkBackspaceCase()
    let result = handleBackspaceInline(this, event, {
      start,
      end,
      startBlock,
      node,
      parentNode,
      paragraph,
      block,
      parent,
      preBlock,
      left,
      right,
      inlineDegrade
    })
    if (result.handled) return result.value

    result = handleBackspaceStructured(this, event, result.context)
    if (result.handled) return result.value
    ;({ block, parent } = result.context)

    result = handleBackspaceDegrade(this, event, result.context)
    if (result.handled) return result.value

    result = mergeBackspacePrevious(this, event, result.context)
    if (result.handled) return result.value
  }
}

export default backspaceHandler

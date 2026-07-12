import selection from '../selection'
import { getTextContent } from '../selection/dom'
import { beginRules } from '../parser/rules'
import { CLASS_OR_ID } from '../config'
import inputChecks from './inputChecks'
import mergeInputSelection from './inputSelectionMerge'
import applyInputAutoPair from './inputAutoPair'
import finalizeInput from './inputFinalize'

const inputCtrl = ContentState => {
  inputChecks(ContentState)

  ContentState.prototype.inputHandler = function(event, notEqual = false) {
    const { start, end } = selection.getCursorRange()
    if (!start || !end) return

    const { start: oldStart, end: oldEnd } = this.cursor
    const key = start.key
    const block = this.getBlock(key)
    const paragraph = document.querySelector(`#${key}`)

    if (
      oldStart.key === oldEnd.key &&
      oldStart.offset === oldEnd.offset &&
      block.text.endsWith('\n') &&
      oldStart.offset === block.text.length &&
      event.inputType === 'insertText'
    ) {
      event.preventDefault()
      block.text += event.data
      const offset = block.text.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
      this.singleRender(block)
      return this.inputHandler(event, true)
    }

    let text = getTextContent(paragraph, [
      CLASS_OR_ID.AG_MATH_RENDER,
      CLASS_OR_ID.AG_RUBY_RENDER
    ])
    const mergeResult = mergeInputSelection(
      this,
      oldStart,
      oldEnd,
      start,
      end,
      text
    )
    text = mergeResult.text
    let needRender = mergeResult.needRender
    let needRenderAll = mergeResult.needRenderAll

    if (block && (block.text !== text || notEqual)) {
      const autoPairResult = applyInputAutoPair(this, event, block, text, start, end)
      text = autoPairResult.text
      needRender = needRender || autoPairResult.needRender

      if (this.checkNotSameToken(block.functionType, block.text, text)) {
        needRender = true
      }

      if (
        block.text.endsWith('\n') &&
        start.offset === text.length &&
        (event.inputType === 'insertText' || event.type === 'compositionend')
      ) {
        block.text += event.data
        start.offset++
        end.offset++
      } else if (
        block.text.length === oldStart.offset &&
        block.text[oldStart.offset - 2] === '\n' &&
        event.inputType === 'deleteContentBackward'
      ) {
        block.text = block.text.substring(0, oldStart.offset - 1)
        start.offset = block.text.length
        end.offset = block.text.length
      } else {
        block.text = text
      }

      if (block.functionType === 'languageInput') {
        const parent = this.getParent(block)
        parent.lang = block.text
      }
      if (beginRules.reference_definition.test(text)) needRenderAll = true
    }

    return finalizeInput(this, {
      block,
      paragraph,
      start,
      end,
      needRender,
      needRenderAll
    })
  }
}

export default inputCtrl

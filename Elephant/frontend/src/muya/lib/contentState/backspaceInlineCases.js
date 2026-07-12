import selection from '../selection'
import { getImageInfo } from '../utils/getImageInfo'

const handled = value => ({ handled: true, value })
const next = context => ({ handled: false, context })

export default function handleBackspaceInline(contentState, event, context) {
  const { start, startBlock, node, parentNode, right } = context
  if (parentNode && parentNode.classList.contains('ag-inline-image')) {
    if (selection.getCaretOffsets(node).left === 0) {
      event.preventDefault()
      event.stopPropagation()
      return handled(contentState.deleteImage(getImageInfo(parentNode)))
    }
    if (selection.getCaretOffsets(node).left === 1 && right === 0) {
      event.stopPropagation()
      event.preventDefault()
      const key = startBlock.key
      const text = startBlock.text
      startBlock.text =
        text.substring(0, start.offset - 1) + text.substring(start.offset)
      const offset = start.offset - 1
      contentState.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
      return handled(contentState.singleRender(startBlock))
    }
  }

  if (node.classList.contains('ag-image-container')) {
    const imageWrapper = node.parentNode
    const imageInfo = getImageInfo(imageWrapper)
    if (start.offset === imageInfo.token.range.end) {
      event.preventDefault()
      event.stopPropagation()
      return handled(contentState.selectImage(imageInfo))
    }
  }

  if (
    startBlock.functionType === 'cellContent' &&
    /<br\/>.{1}$/.test(startBlock.text)
  ) {
    event.preventDefault()
    event.stopPropagation()
    const { text } = startBlock
    startBlock.text = text.substring(0, text.length - 1)
    const key = startBlock.key
    const offset = startBlock.text.length
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    return handled(contentState.singleRender(startBlock))
  }

  if (
    startBlock.functionType === 'cellContent' &&
    context.left === 1 &&
    right === 0
  ) {
    event.stopPropagation()
    event.preventDefault()
    startBlock.text = ''
    const { key } = startBlock
    const offset = 0
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    return handled(contentState.singleRender(startBlock))
  }
  return next(context)
}

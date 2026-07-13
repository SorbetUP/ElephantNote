import { editorCommands } from '../bridge'
import { markdownFromClipboard, TEXT_TRANSFER_TYPES } from './clipboard'

const transferTypes = (transfer) => Array.from(transfer?.types || [])

const transferHasFiles = (transfer) =>
  Boolean(transfer?.files?.length) || transferTypes(transfer).includes('Files')

const transferHasText = (transfer) => {
  const types = transferTypes(transfer)
  return TEXT_TRANSFER_TYPES.some((type) => types.includes(type))
}

const caretRangeFromPoint = (ownerDocument, x, y) => {
  if (typeof ownerDocument.caretRangeFromPoint === 'function') {
    return ownerDocument.caretRangeFromPoint(x, y)
  }
  if (typeof ownerDocument.caretPositionFromPoint !== 'function') return null
  const position = ownerDocument.caretPositionFromPoint(x, y)
  if (!position?.offsetNode) return null
  const range = ownerDocument.createRange()
  range.setStart(position.offsetNode, position.offset)
  range.collapse(true)
  return range
}

const placeDropCaret = (controller, event) => {
  const ownerDocument = controller.container.ownerDocument
  const range = caretRangeFromPoint(ownerDocument, event.clientX || 0, event.clientY || 0)
  if (!range || !controller.container.contains(range.startContainer)) return
  const selection = ownerDocument.defaultView?.getSelection?.()
  if (!selection) return
  selection.removeAllRanges()
  selection.addRange(range)
}

export const handleTextDragOver = (controller, event) => {
  const transfer = event.dataTransfer
  if (!transfer || transferHasFiles(transfer) || !transferHasText(transfer)) return false
  event.preventDefault()
  event.stopPropagation?.()
  try {
    transfer.dropEffect = 'copy'
  } catch {
    // Some DataTransfer implementations expose a read-only dropEffect.
  }
  return true
}

export const handleTextDrop = (controller, event) => {
  const transfer = event.dataTransfer
  if (!transfer || transferHasFiles(transfer) || !transferHasText(transfer)) return false
  placeDropCaret(controller, event)
  const selection = controller.readSelection()
  if (!selection) return false
  const markdown = markdownFromClipboard(event, controller.container.ownerDocument)
  if (markdown === null) return false
  event.preventDefault()
  event.stopPropagation?.()
  controller.schedule(async () => {
    await controller.bridge.setSelection(selection)
    await controller.bridge.dispatch(editorCommands.pasteMarkdown(markdown))
  })
  return true
}

import { editorCommands } from '../bridge'
import { htmlToMarkdown } from './clipboard'

const MARKDOWN_TYPES = [
  'application/x-elephant-markdown',
  'application/x-muya-markdown',
  'application/x-markdown',
  'text/markdown'
]

const selectedHtml = (ownerDocument) => {
  const selection = ownerDocument.defaultView?.getSelection?.()
  if (!selection?.rangeCount) return ''
  const wrapper = ownerDocument.createElement('div')
  for (let index = 0; index < selection.rangeCount; index += 1) {
    wrapper.appendChild(selection.getRangeAt(index).cloneContents())
  }
  return wrapper.innerHTML
}

export const clipboardSelection = (controller) => {
  const ownerDocument = controller.container.ownerDocument
  const selection = ownerDocument.defaultView?.getSelection?.()
  if (!selection || selection.isCollapsed) return null
  const plain = selection.toString()
  const html = selectedHtml(ownerDocument)
  return {
    plain,
    html,
    markdown: htmlToMarkdown(ownerDocument, html) || plain
  }
}

export const writeClipboardSelection = (event, payload) => {
  const clipboard = event.clipboardData
  if (!clipboard?.setData || !payload) return false
  for (const type of MARKDOWN_TYPES) clipboard.setData(type, payload.markdown)
  clipboard.setData('text/plain', payload.plain)
  if (payload.html) clipboard.setData('text/html', payload.html)
  event.preventDefault()
  event.stopPropagation?.()
  return true
}

export const handleCopy = (controller, event) =>
  writeClipboardSelection(event, clipboardSelection(controller))

export const handleCut = (controller, event) => {
  const selection = controller.readSelection()
  if (!selection) return false
  const payload = clipboardSelection(controller)
  if (!writeClipboardSelection(event, payload)) return false
  controller.schedule(async () => {
    await controller.bridge.setSelection(selection)
    await controller.bridge.dispatch(editorCommands.deleteBackward())
  })
  return true
}

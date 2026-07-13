import { htmlToMarkdown } from './clipboardBlocks'
import { normalizedText } from './clipboardInline'

export { htmlToMarkdown }

const MARKDOWN_CLIPBOARD_TYPES = Object.freeze([
  'application/x-elephant-markdown',
  'application/x-muya-markdown',
  'application/x-markdown',
  'text/markdown',
  'text/x-markdown'
])

const firstClipboardValue = (clipboard, types) => {
  for (const type of types) {
    const value = clipboard.getData(type)
    if (value) return value
  }
  return ''
}

export const markdownFromClipboard = (event, ownerDocument) => {
  const clipboard = event?.clipboardData
  if (!clipboard?.getData) return null

  const nativeMarkdown = firstClipboardValue(clipboard, MARKDOWN_CLIPBOARD_TYPES)
  if (nativeMarkdown) return normalizedText(nativeMarkdown)

  const plain = clipboard.getData('text/plain') || ''
  const html = clipboard.getData('text/html') || ''
  const markdown = htmlToMarkdown(ownerDocument, html)
  return normalizedText(markdown || plain)
}

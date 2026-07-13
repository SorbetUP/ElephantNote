import { htmlToMarkdown } from './clipboardBlocks'
import { normalizedText } from './clipboardInline'

export { htmlToMarkdown }

export const markdownFromClipboard = (event, ownerDocument) => {
  const clipboard = event?.clipboardData
  if (!clipboard?.getData) return null
  const plain = clipboard.getData('text/plain') || ''
  const html = clipboard.getData('text/html') || ''
  const markdown = htmlToMarkdown(ownerDocument, html)
  return normalizedText(markdown || plain)
}

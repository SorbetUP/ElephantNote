import { getSanitizeHtml } from '../utils/exportHtml'
import ExportMarkdown from '../utils/exportMarkdown'

export default function copyHandler(event, type, copyInfo = null) {
  if (this.selectedTableCells) return
  event.preventDefault()

  const { selectedImage } = this
  if (selectedImage) {
    const { token } = selectedImage
    if (token.raw.length > 0) {
      event.clipboardData.setData('text/html', token.raw)
      event.clipboardData.setData('text/plain', token.raw)
    }
    return
  }

  const { html, text } = this.getClipBoardData()
  switch (type) {
    case 'normal':
      if (text.length > 0) {
        event.clipboardData.setData('text/html', '')
        event.clipboardData.setData('text/plain', text)
      }
      break
    case 'copyAsRich':
      if (text.length > 0) {
        event.clipboardData.setData('text/html', html)
        event.clipboardData.setData('text/plain', text)
      }
      break
    case 'copyAsHtml':
      if (text.length > 0) {
        event.clipboardData.setData('text/html', '')
        event.clipboardData.setData(
          'text/plain',
          getSanitizeHtml(text, {
            superSubScript: this.muya.options.superSubScript,
            footnote: this.muya.options.footnote,
            isGitlabCompatibilityEnabled: this.muya.options.isGitlabCompatibilityEnabled
          })
        )
      }
      break
    case 'copyBlock': {
      const block = typeof copyInfo === 'string' ? this.getBlock(copyInfo) : copyInfo
      if (!block) return
      const anchor = this.getAnchor(block)
      const { isGitlabCompatibilityEnabled, listIndentation } = this
      const markdown = new ExportMarkdown(
        [anchor],
        listIndentation,
        isGitlabCompatibilityEnabled
      ).generate()
      if (markdown.length > 0) {
        event.clipboardData.setData('text/html', '')
        event.clipboardData.setData('text/plain', markdown)
      }
      break
    }
    case 'copyCodeContent': {
      const codeContent = copyInfo
      if (typeof codeContent !== 'string') return
      if (codeContent.length > 0) {
        event.clipboardData.setData('text/html', '')
        event.clipboardData.setData('text/plain', codeContent)
      }
      break
    }
  }
}

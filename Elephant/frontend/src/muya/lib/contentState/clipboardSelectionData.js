import selection from '../selection'
import marked from '../parser/marked'
import {
  normalizeClipboardBlocks,
  normalizeClipboardImages,
  normalizeClipboardInlines,
  removeClipboardChrome,
  restoreTaskCheckboxes
} from './clipboardDomCleanup'
import {
  normalizeClipboardCodeFences,
  normalizeClipboardContainers,
  normalizeClipboardHtmlBlocks,
  normalizeClipboardLineBreaks,
  normalizeClipboardTightLists
} from './clipboardBlockCleanup'

export default function getClipBoardData() {
  const { start, end } = selection.getCursorRange()
  if (!start || !end) return { html: '', text: '' }

  if (start.key === end.key) {
    const startBlock = this.getBlock(start.key)
    const { type, text, functionType } = startBlock
    if (type === 'span' && functionType === 'codeContent') {
      const selectedText = text.substring(start.offset, end.offset)
      return {
        html: marked(selectedText, this.muya.options),
        text: selectedText
      }
    }
  }

  const html = selection.getSelectionHtml()
  const virtualDoc = new DOMParser().parseFromString(html, 'text/html')
  const wrapper = virtualDoc.createElement('div')
  wrapper.innerHTML = html
  removeClipboardChrome(wrapper)
  restoreTaskCheckboxes(wrapper)
  normalizeClipboardImages(wrapper)
  normalizeClipboardBlocks(wrapper)
  normalizeClipboardInlines(wrapper)
  normalizeClipboardCodeFences(this, wrapper)
  normalizeClipboardTightLists(wrapper)
  normalizeClipboardHtmlBlocks(wrapper)
  normalizeClipboardLineBreaks(wrapper)
  normalizeClipboardContainers(wrapper)

  let htmlData = wrapper.innerHTML
  const textData = this.htmlToMarkdown(htmlData)
  htmlData = marked(textData)
  return { html: htmlData, text: textData }
}

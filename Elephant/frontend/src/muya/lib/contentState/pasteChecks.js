import {
  PARAGRAPH_TYPES,
  PREVIEW_DOMPURIFY_CONFIG,
  URL_REG
} from '../config'
import { sanitize } from '../utils'

export const LIST_REG = /ul|ol/
export const LINE_BREAKS_REG = /\n/

const pasteChecks = ContentState => {
  ContentState.prototype.checkPasteType = function(start, fragment) {
    const fragmentType = fragment.type
    const parent = this.getParent(start)
    if (fragmentType === 'p') return 'MERGE'
    if (/^h\d/.test(fragmentType)) return start.text ? 'MERGE' : 'NEWLINE'
    if (LIST_REG.test(fragmentType)) {
      const listItem = this.getParent(parent)
      const list = listItem && listItem.type === 'li'
        ? this.getParent(listItem)
        : null
      if (
        list &&
        list.listType === fragment.listType &&
        listItem.bulletMarkerOrDelimiter ===
          fragment.children[0].bulletMarkerOrDelimiter
      ) {
        return 'MERGE'
      }
      return 'NEWLINE'
    }
    return 'NEWLINE'
  }

  ContentState.prototype.checkCopyType = function(html, rawText) {
    let type = 'normal'
    if (!html && rawText) {
      type = 'onlyMarkdown'
      const match = /^<([a-zA-Z\d-]+)(?=\s|>).*?>[\s\S]+?<\/([a-zA-Z\d-]+)>$/.exec(
        rawText.trim()
      )
      if (match && match[1]) {
        const tag = match[1]
        if (tag === 'table' && match.length === 3 && match[2] === 'table') {
          const table = document.createElement('table')
          table.innerHTML = sanitize(
            rawText,
            PREVIEW_DOMPURIFY_CONFIG,
            false
          )
          if (table.childElementCount === 1) return 'htmlToMd'
        }
        type = PARAGRAPH_TYPES.find(item => item === tag)
          ? 'copyAsHtml'
          : type
      }
    }
    return type
  }

  ContentState.prototype.isFirefoxPastedUrl = function(text, html) {
    return URL_REG.test(text) && !/\s/.test(text) && !html
  }
}

export default pasteChecks

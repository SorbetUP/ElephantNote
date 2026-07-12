import {
  PREVIEW_DOMPURIFY_CONFIG,
  URL_REG
} from '../config'
import { sanitize } from '../utils'
import pasteSpecialBlocks from './pasteSpecialBlocks'
import pasteFragments from './pasteFragments'

const pasteHandler = ContentState => {
  ContentState.prototype.docPasteHandler = async function(event) {
    const file = await this.pasteImage(event)
    if (file) return event.preventDefault()

    if (this.selectedTableCells) {
      const { start } = this.cursor
      const startBlock = this.getBlock(start.key)
      const selected = this.selectedTableCells
      if (
        startBlock &&
        startBlock.functionType === 'cellContent' &&
        selected.row === 1 &&
        selected.column === 1
      ) {
        this.pasteHandler(event)
        return event.preventDefault()
      }
    }
  }

  ContentState.prototype.pasteHandler = async function(
    event,
    type = 'normal',
    rawText,
    rawHtml
  ) {
    event.preventDefault()
    event.stopPropagation()
    const text = (
      rawText || event.clipboardData.getData('text/plain')
    ).replace(/\r/g, '')
    let html = (
      rawHtml || event.clipboardData.getData('text/html')
    ).replace(/\r/g, '')

    if (URL_REG.test(text) && !/\s/.test(text) && !html) {
      html = `<a href="${text}">${text}</a>`
    }
    html = await this.standardizeHTML(html)
    let copyType = this.checkCopyType(html, text)
    const { start, end } = this.cursor
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    const parent = this.getParent(startBlock)

    if (copyType === 'htmlToMd') {
      html = sanitize(text, PREVIEW_DOMPURIFY_CONFIG, false)
      copyType = 'normal'
    }
    if (start.key !== end.key) {
      this.cutHandler()
      return this.pasteHandler(event, type, rawText, rawHtml)
    }
    if (!html) {
      const file = await this.pasteImage(event)
      if (file) return
    }

    const special = pasteSpecialBlocks({
      contentState: this,
      copyType,
      type,
      text,
      start,
      end,
      startBlock,
      parent
    })
    if (special.handled) return special.value

    const stateFragments =
      type === 'pasteAsPlainText' || copyType === 'onlyMarkdown'
        ? this.markdownToState(text)
        : this.html2State(html)
    if (stateFragments.length <= 0) return

    return pasteFragments(
      this,
      stateFragments,
      start,
      end,
      startBlock,
      endBlock,
      parent
    )
  }
}

export default pasteHandler

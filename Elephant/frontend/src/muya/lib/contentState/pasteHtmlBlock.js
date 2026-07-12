import { LINE_BREAKS_REG } from './pasteChecks'
import { appendHtml } from './pasteInlineText'

export const pasteHtmlBlock = (
  contentState,
  copyType,
  type,
  text,
  startBlock,
  start,
  parent
) => {
  if (copyType !== 'copyAsHtml') return { handled: false }
  switch (type) {
    case 'normal': {
      const htmlBlock = contentState.createBlockP(text.trim())
      contentState.insertAfter(htmlBlock, parent)
      contentState.removeBlock(parent)
      contentState.insertHtmlBlock(htmlBlock)
      break
    }
    case 'pasteAsPlainText': {
      const lines = text.trim().split(LINE_BREAKS_REG)
      let htmlBlock = null
      if (!startBlock.text || lines.length > 1) {
        htmlBlock = contentState.createBlockP(
          (startBlock.text ? lines.slice(1) : lines).join('\n')
        )
      }
      if (htmlBlock) {
        contentState.insertAfter(htmlBlock, parent)
        contentState.insertHtmlBlock(htmlBlock)
      }
      if (startBlock.text) appendHtml(contentState, startBlock, start, lines[0])
      else contentState.removeBlock(parent)
      break
    }
  }
  return { handled: true, value: contentState.partialRender() }
}

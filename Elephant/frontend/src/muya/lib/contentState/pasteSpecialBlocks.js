import { pasteCodeContent } from './pasteCodeContent'
import { pasteHtmlBlock } from './pasteHtmlBlock'
import { pasteLanguageInput } from './pasteLanguageInput'
import { pasteTableCell } from './pasteTableCell'

export default function pasteSpecialBlocks(context) {
  const { contentState, copyType, type, text, start, end, startBlock, parent } = context
  if (startBlock.type === 'span' && startBlock.functionType === 'languageInput') {
    pasteLanguageInput(contentState, startBlock, start, end, text)
    return { handled: true, value: undefined }
  }
  if (startBlock.type === 'span' && startBlock.functionType === 'codeContent') {
    return {
      handled: true,
      value: pasteCodeContent(contentState, startBlock, start, end, text)
    }
  }
  if (startBlock.functionType === 'cellContent') {
    return {
      handled: true,
      value: pasteTableCell(contentState, startBlock, start, end, text)
    }
  }
  return pasteHtmlBlock(contentState, copyType, type, text, startBlock, start, parent)
}

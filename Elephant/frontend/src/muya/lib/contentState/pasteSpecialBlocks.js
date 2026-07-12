import { LINE_BREAKS_REG } from './pasteChecks'

const appendHtml = (contentState, startBlock, start, text) => {
  startBlock.text =
    startBlock.text.substring(0, start.offset) +
    text +
    startBlock.text.substring(start.offset)
  const { key } = start
  const offset = start.offset + text.length
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
}

const pasteLanguageInput = (contentState, startBlock, start, end, text) => {
  let language = text.trim().match(/^.*$/m)[0] || ''
  const oldLength = startBlock.text.length
  let offset = 0
  if (start.offset !== 0 || end.offset !== oldLength) {
    const preText = startBlock.text.substring(0, start.offset)
    const postText = startBlock.text.substring(end.offset)
    language = preText + language + postText
    offset = preText.length + language.length
  } else {
    offset = language.length
  }
  startBlock.text = language
  const key = startBlock.key
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  contentState.muya.eventCenter.dispatch('muya-code-picker', {
    reference: null
  })
  contentState.updateCodeLanguage(startBlock, language)
}

const pasteCodeContent = (contentState, startBlock, start, end, text) => {
  const cleanedText = text.replace(/\r\n/g, '\n')
  const preText = startBlock.text.substring(0, start.offset)
  const postText = startBlock.text.substring(end.offset)
  startBlock.text = preText + cleanedText + postText
  const key = startBlock.key
  const offset = start.offset + cleanedText.length
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  return contentState.partialRender()
}

const pasteTableCell = (contentState, startBlock, start, end, text) => {
  let oneCellSelected = false
  if (contentState.selectedTableCells) {
    const selected = contentState.selectedTableCells
    if (selected.row === 1 && selected.column === 1) {
      oneCellSelected = true
    } else {
      return contentState.partialRender()
    }
  }
  const key = startBlock.key
  const pendingText = text.trim().replace(/\n/g, '<br/>')
  let offset = pendingText.length
  if (oneCellSelected) {
    startBlock.text = pendingText
    contentState.selectedTableCells = null
  } else {
    offset += start.offset
    startBlock.text =
      startBlock.text.substring(0, start.offset) +
      pendingText +
      startBlock.text.substring(end.offset)
  }
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  return contentState.partialRender()
}

const pasteHtmlBlock = (
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
      if (startBlock.text) {
        appendHtml(contentState, startBlock, start, lines[0])
      } else {
        contentState.removeBlock(parent)
      }
      break
    }
  }
  return { handled: true, value: contentState.partialRender() }
}

export default function pasteSpecialBlocks(context) {
  const {
    contentState,
    copyType,
    type,
    text,
    start,
    end,
    startBlock,
    parent
  } = context
  if (
    startBlock.type === 'span' &&
    startBlock.functionType === 'languageInput'
  ) {
    pasteLanguageInput(contentState, startBlock, start, end, text)
    return { handled: true, value: undefined }
  }
  if (
    startBlock.type === 'span' &&
    startBlock.functionType === 'codeContent'
  ) {
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
  return pasteHtmlBlock(
    contentState,
    copyType,
    type,
    text,
    startBlock,
    start,
    parent
  )
}

const FOOTNOTE_REG = /^\[\^([^\[\]\s]+?)(?<!\\)\]:$/ // eslint-disable-line no-useless-escape

const checkAutoIndent = (text, offset) => {
  const pair = text.substring(offset - 1, offset + 1)
  return /^(\{\}|\[\]|\(\)|><)$/.test(pair)
}

const getCodeblockIndentSpace = text => {
  const match = /\n([ \t]*).*$/.exec(text)
  return match ? match[1] : ''
}

const getIndentSpace = text => {
  const match = /^(\s*)\S/.exec(text)
  return match ? match[1] : ''
}

const handled = value => ({ handled: true, value })
const next = context => ({ handled: false, context })

export default function handleEnterInitial(contentState, event, start, end) {
  let block = contentState.getBlock(start.key)
  const { text } = block
  const endBlock = contentState.getBlock(end.key)
  const parent = contentState.getParent(block)
  event.preventDefault()

  if (block.functionType === 'languageInput') {
    contentState.updateCodeLanguage(block, block.text.trim())
    return handled(undefined)
  }
  if (start.key !== end.key) {
    const key = start.key
    const offset = start.offset
    block.text =
      block.text.substring(0, start.offset) +
      endBlock.text.substring(end.offset)
    contentState.removeBlocks(block, endBlock)
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    contentState.partialRender()
    return handled(contentState.enterHandler(event))
  }
  if (start.offset !== end.offset) {
    const key = start.key
    const offset = start.offset
    block.text =
      block.text.substring(0, start.offset) +
      block.text.substring(end.offset)
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    contentState.partialRender()
    return handled(contentState.enterHandler(event))
  }

  if (
    block.type === 'span' &&
    block.functionType === 'paragraphContent' &&
    !contentState.getParent(block).parent &&
    start.offset === text.length &&
    FOOTNOTE_REG.test(text)
  ) {
    event.preventDefault()
    event.stopPropagation()
    block.text += ' '
    const key = block.key
    const offset = block.text.length
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    return handled(
      contentState.updateFootnote(contentState.getParent(block), block)
    )
  }

  if (
    event.shiftKey &&
    block.type === 'span' &&
    block.functionType === 'paragraphContent'
  ) {
    let { offset } = start
    const indent = getIndentSpace(text)
    block.text =
      text.substring(0, offset) + '\n' + indent + text.substring(offset)
    offset += 1 + indent.length
    contentState.cursor = {
      start: { key: block.key, offset },
      end: { key: block.key, offset },
      isEdit: true
    }
    return handled(contentState.partialRender())
  }
  if (block.type === 'span' && block.functionType === 'codeContent') {
    const autoIndent = checkAutoIndent(text, start.offset)
    const indent = getCodeblockIndentSpace(
      text.substring(1, start.offset)
    )
    block.text =
      text.substring(0, start.offset) +
      '\n' +
      (autoIndent
        ? indent + ' '.repeat(contentState.tabSize) + '\n'
        : '') +
      indent +
      text.substring(start.offset)
    let offset = start.offset + 1 + indent.length
    if (autoIndent) offset += contentState.tabSize
    contentState.cursor = {
      start: { key: block.key, offset },
      end: { key: block.key, offset },
      isEdit: true
    }
    return handled(contentState.partialRender())
  }

  if (event.shiftKey && block.functionType === 'cellContent') {
    const brTag = '<br/>'
    block.text =
      text.substring(0, start.offset) + brTag + text.substring(start.offset)
    const offset = start.offset + brTag.length
    contentState.cursor = {
      start: { key: block.key, offset },
      end: { key: block.key, offset },
      isEdit: true
    }
    return handled(contentState.partialRender([block]))
  }
  return next({ block, text, parent })
}

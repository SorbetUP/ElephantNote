import { tokenizer, generator } from '../parser/'

const handled = value => ({ handled: true, value })
const next = context => ({ handled: false, context })

export default function handleBackspaceInitial(contentState, event, start, end) {
  if (contentState.selectedImage) {
    event.preventDefault()
    return handled(contentState.deleteImage(contentState.selectedImage))
  }
  if (contentState.isSelectAll()) {
    event.preventDefault()
    contentState.blocks = [contentState.createBlockP()]
    contentState.init()
    contentState.render()
    contentState.muya.dispatchSelectionChange()
    contentState.muya.dispatchSelectionFormats()
    return handled(contentState.muya.dispatchChange())
  }

  const startBlock = contentState.getBlock(start.key)
  const endBlock = contentState.getBlock(end.key)
  const maybeLastRow = contentState.getParent(endBlock)
  const startOutmostBlock = contentState.findOutMostBlock(startBlock)
  const endOutmostBlock = contentState.findOutMostBlock(endBlock)
  if (
    start.key === end.key &&
    startBlock.type === 'span' &&
    startBlock.functionType === 'atxLine' &&
    ((start.offset === 0 && end.offset === startBlock.text.length) ||
      (start.offset === end.offset && start.offset === 1 && startBlock.text === '#'))
  ) {
    event.preventDefault()
    startBlock.text = ''
    contentState.cursor = {
      start: { key: start.key, offset: 0 },
      end: { key: end.key, offset: 0 },
      isEdit: true
    }
    contentState.updateToParagraph(contentState.getParent(startBlock), startBlock)
    return handled(contentState.partialRender())
  }

  const tokens = tokenizer(startBlock.text, {
    options: contentState.muya.options
  })
  let needRender = false
  let preToken = null
  for (const token of tokens) {
    if (token.range.end === start.offset && token.type === 'inline_math') {
      needRender = true
      token.raw = token.raw.substr(0, token.raw.length - 1)
      break
    }
    if (
      token.range.start + 1 === start.offset &&
      preToken &&
      preToken.type === 'html_tag' &&
      preToken.tag === 'ruby'
    ) {
      needRender = true
      token.raw = token.raw.substr(1)
      break
    }
    preToken = token
  }
  if (needRender) {
    startBlock.text = generator(tokens)
    event.preventDefault()
    start.offset--
    end.offset--
    contentState.cursor = { start, end, isEdit: true }
    return handled(contentState.partialRender())
  }

  const maybeCell = contentState.getParent(startBlock)
  if (/th/.test(maybeCell.type) && start.offset === 0 && !maybeCell.preSibling) {
    if (
      (end.offset === endBlock.text.length &&
        startOutmostBlock === endOutmostBlock &&
        !endBlock.nextSibling &&
        !maybeLastRow.nextSibling) ||
      startOutmostBlock !== endOutmostBlock
    ) {
      event.preventDefault()
      const figureBlock = contentState.getBlock(
        contentState.closest(startBlock, 'figure')
      )
      const paragraph = contentState.createBlockP(
        endBlock.text.substring(end.offset)
      )
      contentState.insertBefore(paragraph, figureBlock)
      const cursorBlock = paragraph.children[0]
      if (startOutmostBlock !== endOutmostBlock) {
        contentState.removeBlocks(figureBlock, endBlock)
      }
      contentState.removeBlock(figureBlock)
      const { key } = cursorBlock
      const offset = 0
      contentState.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: true
      }
      return handled(contentState.render())
    }
  }

  if (
    startBlock.functionType === 'cellContent' &&
    contentState.cursor.start.offset === 0 &&
    contentState.cursor.end.offset !== 0 &&
    contentState.cursor.end.offset === startBlock.text.length
  ) {
    event.preventDefault()
    event.stopPropagation()
    startBlock.text = ''
    const { key } = startBlock
    const offset = 0
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    return handled(contentState.singleRender(startBlock))
  }

  if (
    startBlock.functionType === 'codeContent' &&
    startBlock.key === endBlock.key &&
    !(contentState.cursor.start.offset === 0 && contentState.cursor.end.offset === 0)
  ) {
    event.preventDefault()
    event.stopPropagation()
    const { key } = startBlock
    let offset
    const startOffset = contentState.cursor.start.offset
    const endOffset = contentState.cursor.end.offset
    if (
      startOffset === endOffset &&
      (/\n.$/.test(startBlock.text) || startBlock.text === '\n') &&
      startBlock.text.length === startOffset
    ) {
      startBlock.text = /\n.$/.test(startBlock.text)
        ? startBlock.text.slice(0, -1)
        : ''
      offset = startBlock.text.length
    } else {
      const regexUnindent = new RegExp(
        `\n.*(${String.fromCharCode(32).repeat(contentState.tabSize)})$`
      )
      const shouldUnindent = regexUnindent.test(
        startBlock.text.substring(0, startOffset)
      )
      const backspaceSize = shouldUnindent ? contentState.tabSize : 1
      offset = startOffset === endOffset ? startOffset - backspaceSize : startOffset
      startBlock.text =
        startBlock.text.substring(0, offset) +
        startBlock.text.substring(endOffset)
    }
    contentState.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    return handled(contentState.singleRender(startBlock))
  }

  if (start.key !== end.key || start.offset !== end.offset) {
    return handled(undefined)
  }
  return next({ startBlock })
}

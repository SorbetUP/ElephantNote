import { handled } from './backspaceResults'

export const handleCodeContentBackspace = (contentState, event, startBlock, endBlock) => {
  const cursor = contentState.cursor
  if (startBlock.functionType !== 'codeContent' ||
      startBlock.key !== endBlock.key ||
      (cursor.start.offset === 0 && cursor.end.offset === 0)) return null

  event.preventDefault()
  event.stopPropagation()
  const { key } = startBlock
  const startOffset = cursor.start.offset
  const endOffset = cursor.end.offset
  let offset
  if (startOffset === endOffset &&
      (/\n.$/.test(startBlock.text) || startBlock.text === '\n') &&
      startBlock.text.length === startOffset) {
    startBlock.text = /\n.$/.test(startBlock.text)
      ? startBlock.text.slice(0, -1)
      : ''
    offset = startBlock.text.length
  } else {
    const spaces = String.fromCharCode(32).repeat(contentState.tabSize)
    const regexUnindent = new RegExp(`\n.*(${spaces})$`)
    const shouldUnindent = regexUnindent.test(
      startBlock.text.substring(0, startOffset)
    )
    const backspaceSize = shouldUnindent ? contentState.tabSize : 1
    offset = startOffset === endOffset ? startOffset - backspaceSize : startOffset
    startBlock.text = startBlock.text.substring(0, offset) +
      startBlock.text.substring(endOffset)
  }
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  return handled(contentState.singleRender(startBlock))
}

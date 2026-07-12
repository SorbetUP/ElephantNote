import { handled } from './backspaceResults'

export const handleCellContentBackspace = (contentState, event, startBlock) => {
  const cursor = contentState.cursor
  if (startBlock.functionType !== 'cellContent' ||
      cursor.start.offset !== 0 ||
      cursor.end.offset === 0 ||
      cursor.end.offset !== startBlock.text.length) return null

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

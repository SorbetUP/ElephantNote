import { handled } from './backspaceResults'

export const handleAtxBackspace = (contentState, event, start, end, startBlock) => {
  const isAtxSelection = start.key === end.key &&
    startBlock.type === 'span' &&
    startBlock.functionType === 'atxLine' &&
    ((start.offset === 0 && end.offset === startBlock.text.length) ||
      (start.offset === end.offset && start.offset === 1 && startBlock.text === '#'))
  if (!isAtxSelection) return null

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

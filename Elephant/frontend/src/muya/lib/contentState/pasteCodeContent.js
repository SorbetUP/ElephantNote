export const pasteCodeContent = (contentState, startBlock, start, end, text) => {
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

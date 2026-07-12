export const appendHtml = (contentState, startBlock, start, text) => {
  startBlock.text = startBlock.text.substring(0, start.offset) +
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

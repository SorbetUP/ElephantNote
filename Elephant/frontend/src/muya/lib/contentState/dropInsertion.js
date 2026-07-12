export const insertDroppedImageBlock = (contentState, text, dropAnchor) => {
  const imageBlock = contentState.createBlockP(text)
  const { anchor, position } = dropAnchor
  if (position === 'up') contentState.insertBefore(imageBlock, anchor)
  else contentState.insertAfter(imageBlock, anchor)

  const key = imageBlock.children[0].key
  const offset = 0
  contentState.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: true
  }
  contentState.render()
  return imageBlock
}

export function handleContainerBlockClick(figureEle) {
  const { id } = figureEle
  const mathBlock = this.getBlock(id)
  const preBlock = mathBlock.children[0]
  const firstLine = preBlock.children[0].children[0]
  const { key } = firstLine
  const offset = 0
  this.cursor = {
    start: { key, offset },
    end: { key, offset },
    isEdit: false
  }
  this.partialRender()
}

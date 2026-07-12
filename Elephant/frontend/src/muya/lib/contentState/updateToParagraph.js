export function updateToParagraph(block, line) {
  if (/^h\d$/.test(block.type) && block.headingStyle === 'setext') {
    return null
  }
  if (block.type !== 'p') {
    const newBlock = this.createBlockP(line.text)
    this.insertBefore(newBlock, block)
    this.removeBlock(block)
    const { start, end } = this.cursor
    const key = newBlock.children[0].key
    this.cursor = {
      start: { key, offset: start.offset },
      end: { key, offset: end.offset },
      isEdit: true
    }
    return block
  }
  return null
}

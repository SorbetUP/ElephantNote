const enterCodeBlock = ContentState => {
  ContentState.prototype.enterInCodeBlock = function(block, event) {
    const { start, end } = this.cursor
    const { key, offset } = start
    const { text } = block
    const preText = text.substring(0, offset)
    const postText = text.substring(end.offset)
    const nextLine = postText.split('\n')[0]
    const indentMatch = /^\s*/.exec(nextLine)
    const indent = indentMatch ? indentMatch[0] : ''
    block.text = `${preText}\n${indent}${postText}`
    this.cursor = {
      start: { key, offset: offset + indent.length + 1 },
      end: { key, offset: offset + indent.length + 1 },
      isEdit: true
    }
    this.partialRender()
  }
}

export default enterCodeBlock

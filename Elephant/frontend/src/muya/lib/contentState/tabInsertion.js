const tabInsertion = ContentState => {
  ContentState.prototype.insertTab = function(event) {
    const tabSize = this.tabSize
    const tabCharacter = String.fromCharCode(32).repeat(tabSize)
    const { start, end } = this.cursor
    const startBlock = this.getBlock(start.key)
    const endBlock = this.getBlock(end.key)
    if (start.key === end.key && start.offset === end.offset) {
      startBlock.text =
        startBlock.text.substring(0, start.offset) +
        tabCharacter +
        endBlock.text.substring(end.offset)
      const key = start.key
      const offset = start.offset + tabCharacter.length
      this.cursor = {
        start: { key, offset },
        end: { key, offset },
        isEdit: false
      }
      return this.partialRender()
    }

    if (
      start.key === end.key &&
      start.offset !== end.offset &&
      startBlock.type === 'span' &&
      startBlock.functionType === 'codeContent'
    ) {
      let nowLength = 0
      const oldText = startBlock.text
      const lines = oldText.split('\n')
      let dealLine
      let startTabSize = null
      if (event.shiftKey) {
        dealLine = line => {
          let index = 0
          for (; index < line.length && index < tabSize; index++) {
            if (
              line.charAt(index) !== String.fromCharCode(160) &&
              line.charAt(index) !== String.fromCharCode(32)
            ) {
              break
            }
          }
          if (!startTabSize) startTabSize = -1 * index
          return line.substr(index)
        }
      } else {
        startTabSize = tabSize
        dealLine = line => tabCharacter + line
      }

      let isDealLine = false
      for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        nowLength += lines[lineNumber].length
        if (start.offset <= nowLength && !isDealLine) isDealLine = true
        if (isDealLine) lines[lineNumber] = dealLine(lines[lineNumber])
        if (end.offset <= nowLength) break
        nowLength += 1
      }
      startBlock.text = lines.join('\n')
      const startKey = start.key
      const startOffset = start.offset + startTabSize
      const endKey = end.key
      const endOffset = startBlock.text.length - (oldText.length - end.offset)
      this.cursor = {
        start: { key: startKey, offset: startOffset },
        end: { key: endKey, offset: endOffset },
        isEdit: false
      }
      return this.partialRender()
    }
  }
}

export default tabInsertion

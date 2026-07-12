const updateThematic = ContentState => {
  ContentState.prototype.updateThematicBreak = function(block, marker, line) {
    if (block.type === 'hr') return null
    const lines = line.text.split('\n')
    const preParagraphLines = []
    let thematicLine = ''
    const postParagraphLines = []
    let thematicLineHasPushed = false
    for (const currentLine of lines) {
      /* eslint-disable no-useless-escape */
      if (
        / {0,3}(?:\* *\* *\*|- *- *-|_ *_ *_)[ \*\-\_]*$/.test(currentLine) &&
        !thematicLineHasPushed
      ) {
        /* eslint-enable no-useless-escape */
        thematicLine = currentLine
        thematicLineHasPushed = true
      } else if (!thematicLineHasPushed) {
        preParagraphLines.push(currentLine)
      } else {
        postParagraphLines.push(currentLine)
      }
    }

    const thematicBlock = this.createBlock('hr')
    const thematicLineBlock = this.createBlock('span', {
      text: thematicLine,
      functionType: 'thematicBreakLine'
    })
    this.appendChild(thematicBlock, thematicLineBlock)
    this.insertBefore(thematicBlock, block)
    if (preParagraphLines.length) {
      this.insertBefore(
        this.createBlockP(preParagraphLines.join('\n')),
        thematicBlock
      )
    }
    if (postParagraphLines.length) {
      this.insertAfter(
        this.createBlockP(postParagraphLines.join('\n')),
        thematicBlock
      )
    }
    this.removeBlock(block)

    const { start, end } = this.cursor
    const key = thematicBlock.children[0].key
    const preParagraphLength = preParagraphLines.reduce(
      (total, item) => total + item.length + 1,
      0
    )
    this.cursor = {
      start: { key, offset: start.offset - preParagraphLength },
      end: { key, offset: end.offset - preParagraphLength },
      isEdit: true
    }
    return thematicBlock
  }
}

export default updateThematic

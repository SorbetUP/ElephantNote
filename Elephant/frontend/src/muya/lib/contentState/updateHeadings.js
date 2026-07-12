const updateHeadings = ContentState => {
  ContentState.prototype.updateAtxHeader = function(block, header, line) {
    const newType = `h${header.length}`
    const headingStyle = 'atx'
    if (block.type === newType && block.headingStyle === headingStyle) return null

    const lines = line.text.split('\n')
    const preParagraphLines = []
    let atxLine = ''
    const postParagraphLines = []
    let foundAtxLine = false
    for (const currentLine of lines) {
      if (/^ {0,3}#{1,6}(?=\s{1,}|$)/.test(currentLine) && !foundAtxLine) {
        atxLine = currentLine
        foundAtxLine = true
      } else if (!foundAtxLine) {
        preParagraphLines.push(currentLine)
      } else {
        postParagraphLines.push(currentLine)
      }
    }

    const atxBlock = this.createBlock(newType, { headingStyle })
    const atxLineBlock = this.createBlock('span', {
      text: atxLine,
      functionType: 'atxLine'
    })
    this.appendChild(atxBlock, atxLineBlock)
    this.insertBefore(atxBlock, block)
    if (preParagraphLines.length) {
      this.insertBefore(
        this.createBlockP(preParagraphLines.join('\n')),
        atxBlock
      )
    }
    if (postParagraphLines.length) {
      this.insertAfter(
        this.createBlockP(postParagraphLines.join('\n')),
        atxBlock
      )
    }
    this.removeBlock(block)

    const { start, end } = this.cursor
    const key = atxBlock.children[0].key
    this.cursor = {
      start: {
        key,
        offset: start.offset <= atxBlock.children[0].text.length
          ? start.offset
          : header.length + 1
      },
      end: {
        key,
        offset: end.offset <= atxBlock.children[0].text.length
          ? end.offset
          : atxBlock.children[0].text.length
      },
      isEdit: true
    }
    return atxBlock
  }

  ContentState.prototype.updateSetextHeader = function(block, marker, line) {
    const newType = /=/.test(marker) ? 'h1' : 'h2'
    const headingStyle = 'setext'
    if (block.type === newType && block.headingStyle === headingStyle) return null

    const lines = line.text.split('\n')
    const setextLines = []
    const postParagraphLines = []
    let foundSetextLine = false
    for (const currentLine of lines) {
      if (
        /^ {0,3}(?:={3,}|-{3,})(?= {1,}|$)/.test(currentLine) &&
        !foundSetextLine
      ) {
        foundSetextLine = true
      } else if (!foundSetextLine) {
        setextLines.push(currentLine)
      } else {
        postParagraphLines.push(currentLine)
      }
    }

    const setextBlock = this.createBlock(newType, {
      headingStyle,
      marker
    })
    const setextLineBlock = this.createBlock('span', {
      text: setextLines.join('\n'),
      functionType: 'paragraphContent'
    })
    this.appendChild(setextBlock, setextLineBlock)
    this.insertBefore(setextBlock, block)
    if (postParagraphLines.length) {
      this.insertAfter(
        this.createBlockP(postParagraphLines.join('\n')),
        setextBlock
      )
    }
    this.removeBlock(block)

    const key = setextBlock.children[0].key
    const offset = setextBlock.children[0].text.length
    this.cursor = {
      start: { key, offset },
      end: { key, offset },
      isEdit: true
    }
    return setextBlock
  }
}

export default updateHeadings

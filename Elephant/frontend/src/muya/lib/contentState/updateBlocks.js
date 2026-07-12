const updateBlocks = ContentState => {
  ContentState.prototype.updateBlockQuote = function(block, line) {
    const lines = line.text.split('\n')
    const preParagraphLines = []
    const quoteLines = []
    let foundQuote = false
    for (const currentLine of lines) {
      if (/^ {0,3}>/.test(currentLine) && !foundQuote) {
        foundQuote = true
        quoteLines.push(currentLine.trimStart().substring(1).trimStart())
      } else if (!foundQuote) {
        preParagraphLines.push(currentLine)
      } else {
        quoteLines.push(currentLine)
      }
    }

    let quoteParagraphBlock
    if (/^h\d/.test(block.type)) {
      quoteParagraphBlock = this.createBlock(block.type, {
        headingStyle: block.headingStyle
      })
      if (block.headingStyle === 'setext') {
        quoteParagraphBlock.marker = block.marker
      }
      const headerContent = this.createBlock('span', {
        text: quoteLines.join('\n'),
        functionType: block.headingStyle === 'setext'
          ? 'paragraphContent'
          : 'atxLine'
      })
      this.appendChild(quoteParagraphBlock, headerContent)
    } else {
      quoteParagraphBlock = this.createBlockP(quoteLines.join('\n'))
    }

    const quoteBlock = this.createBlock('blockquote')
    this.appendChild(quoteBlock, quoteParagraphBlock)
    this.insertBefore(quoteBlock, block)
    if (preParagraphLines.length) {
      this.insertBefore(
        this.createBlockP(preParagraphLines.join('\n')),
        quoteBlock
      )
    }
    this.removeBlock(block)

    const key = quoteParagraphBlock.children[0].key
    const { start, end } = this.cursor
    this.cursor = {
      start: { key, offset: Math.max(0, start.offset - 1) },
      end: { key, offset: Math.max(0, end.offset - 1) },
      isEdit: true
    }
    return quoteBlock
  }

  ContentState.prototype.updateIndentCode = function(block, line) {
    const lang = ''
    const codeBlock = this.createBlock('code', { lang })
    const inputBlock = this.createBlock('span', {
      functionType: 'languageInput'
    })
    const preBlock = this.createBlock('pre', {
      functionType: 'indentcode',
      lang
    })
    const text = line ? line.text : block.text
    const codeLines = []
    const paragraphLines = []
    let canBeCodeLine = true
    for (const currentLine of text.split('\n')) {
      if (/^ {4,}/.test(currentLine) && canBeCodeLine) {
        codeLines.push(currentLine.replace(/^ {4}/, ''))
      } else {
        canBeCodeLine = false
        paragraphLines.push(currentLine)
      }
    }

    const codeContent = this.createBlock('span', {
      text: codeLines.join('\n'),
      functionType: 'codeContent',
      lang
    })
    this.appendChild(codeBlock, codeContent)
    this.appendChild(preBlock, inputBlock)
    this.appendChild(preBlock, codeBlock)
    this.insertBefore(preBlock, block)

    if (paragraphLines.length > 0 && line) {
      const newLine = this.createBlock('span', {
        text: paragraphLines.join('\n')
      })
      this.insertBefore(newLine, line)
      this.removeBlock(line)
    } else {
      this.removeBlock(block)
    }

    const key = codeBlock.children[0].key
    const { start, end } = this.cursor
    this.cursor = {
      start: { key, offset: start.offset - 4 },
      end: { key, offset: end.offset - 4 },
      isEdit: true
    }
    return preBlock
  }

  ContentState.prototype.updateToParagraph = function(block, line) {
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
}

export default updateBlocks

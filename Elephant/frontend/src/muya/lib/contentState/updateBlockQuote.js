export function updateBlockQuote(block, line) {
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

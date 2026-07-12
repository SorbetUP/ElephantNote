export function updateIndentCode(block, line) {
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

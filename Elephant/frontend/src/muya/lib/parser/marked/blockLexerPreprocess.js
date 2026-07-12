export const lexMarkdown = (lexer, src, checkCursorSignature = false) => {
  src = src.replace(/\r\n|\r/g, '\n').replace(/\t/g, '    ')
  lexer.checkFrontmatter = true
  lexer.footnoteOrder = 0
  lexer.token(src, true, null, checkCursorSignature)

  const { tokens } = lexer
  const withoutFootnotes = []
  const footnoteTokens = []
  let isInFootnote = false
  for (const token of tokens) {
    const { type } = token
    if (type === 'footnote_start') {
      isInFootnote = true
      footnoteTokens.push(token)
    } else if (type === 'footnote_end') {
      isInFootnote = false
      footnoteTokens.push(token)
    } else if (isInFootnote) {
      footnoteTokens.push(token)
    } else {
      withoutFootnotes.push(token)
    }
  }

  const result = [...withoutFootnotes, ...footnoteTokens]
  result.links = tokens.links
  result.footnotes = tokens.footnotes
  return result
}

export const indentCodeCompensation = (raw, text) => {
  const matchIndentToCode = raw.match(/^(\s+)(?:```)/)
  if (matchIndentToCode === null) return text

  const indentToCode = matchIndentToCode[1]
  return text
    .split('\n')
    .map(node => {
      const matchIndentInNode = node.match(/^\s+/)
      if (matchIndentInNode === null) return node
      const [indentInNode] = matchIndentInNode
      return indentInNode.length >= indentToCode.length
        ? node.slice(indentToCode.length)
        : node
    })
    .join('\n')
}

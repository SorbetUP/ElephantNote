const CHOP_TEXT_REG = /(\*{1,3})([^*]+)(\1)/g

export const getCursorPositionWithinMarkedText = (markedText, cursorOffset) => {
  const chunks = []
  let match
  let result = { type: 'OUT' }

  do {
    match = CHOP_TEXT_REG.exec(markedText)
    if (match) {
      chunks.push({
        index: match.index + match[1].length,
        leftSymbol: match[1],
        rightSymbol: match[3],
        lastIndex: CHOP_TEXT_REG.lastIndex - match[3].length
      })
    }
  } while (match)

  chunks.forEach(chunk => {
    const { index, leftSymbol, rightSymbol, lastIndex } = chunk
    if (cursorOffset > index && cursorOffset < lastIndex) {
      result = { type: 'IN', info: leftSymbol }
    } else if (cursorOffset === index) {
      result = { type: 'LEFT', info: leftSymbol.length }
    } else if (cursorOffset === lastIndex) {
      result = { type: 'RIGHT', info: rightSymbol.length }
    }
  })
  return result
}

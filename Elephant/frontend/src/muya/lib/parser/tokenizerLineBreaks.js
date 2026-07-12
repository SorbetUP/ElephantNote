import { pushPending } from './tokenizerShared'

const consumeLineBreak = (state, ruleName, type) => {
  const match = state.rules[ruleName].exec(state.src)
  if (!match) return false
  const length = match[0].length
  pushPending(state)
  state.tokens.push({
    type,
    raw: match[0],
    ...(type === 'soft_line_break'
      ? { lineBreak: match[1] }
      : { spaces: match[1], lineBreak: match[2] }),
    isAtEnd: match.input.length === match[0].length,
    parent: state.tokens,
    range: { start: state.pos, end: state.pos + length }
  })
  state.src = state.src.substring(length)
  state.pos += length
  return true
}

export const consumeSoftLineBreak = state => consumeLineBreak(state, 'soft_line_break', 'soft_line_break')
export const consumeHardLineBreak = state => consumeLineBreak(state, 'hard_line_break', 'hard_line_break')

export const consumeTailHeader = state => {
  const match = state.rules.tail_header.exec(state.src)
  if (!match || !state.top) return false
  pushPending(state)
  state.tokens.push({
    type: 'tail_header', raw: match[1], marker: match[1], parent: state.tokens,
    range: { start: state.pos, end: state.pos + match[1].length }
  })
  state.src = state.src.substring(match[1].length)
  state.pos += match[1].length
  return true
}

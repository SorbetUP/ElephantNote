import { pushPending } from './tokenizerShared'

export const consumeBacklash = state => {
  const match = state.rules.backlash.exec(state.src)
  if (!match) return false
  pushPending(state)
  state.tokens.push({
    type: 'backlash',
    raw: match[1],
    marker: match[1],
    parent: state.tokens,
    content: '',
    range: {
      start: state.pos,
      end: state.pos + match[1].length
    }
  })
  state.pending += state.pending + match[2]
  state.pendingStartPos = state.pos + match[1].length
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

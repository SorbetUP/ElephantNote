import { isLengthEven } from '../utils'
import { pushPending } from './tokenizerShared'

export const consumeReferenceLink = (state, recurse) => {
  const match = state.rules.reference_link.exec(state.src)
  if (
    !match ||
    !state.labels.has(match[3] || match[1]) ||
    !isLengthEven(match[2]) ||
    !isLengthEven(match[4])
  ) {
    return false
  }
  pushPending(state)
  state.tokens.push({
    type: 'reference_link',
    raw: match[0],
    isFullLink: !!match[3],
    parent: state.tokens,
    anchor: match[1],
    backlash: {
      first: match[2],
      second: match[4] || ''
    },
    label: match[3] || match[1],
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    },
    children: recurse(
      match[1],
      undefined,
      state.rules,
      state.pos + 1,
      false,
      state.labels,
      state.options
    )
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

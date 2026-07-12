import { isLengthEven } from '../utils'
import { pushPending } from './tokenizerShared'

export const consumeReferenceImage = state => {
  const match = state.rules.reference_image.exec(state.src)
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
    type: 'reference_image',
    raw: match[0],
    isFullLink: !!match[3],
    parent: state.tokens,
    alt: match[1],
    backlash: {
      first: match[2],
      second: match[4] || ''
    },
    label: match[3] || match[1],
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

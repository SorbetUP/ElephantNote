import { isLengthEven } from '../utils'
import { parseSrcAndTitle } from './utils'
import { correctUrl, pushPending } from './tokenizerShared'

export const consumeImage = state => {
  const match = state.rules.image.exec(state.src)
  correctUrl(match)
  if (!match || !isLengthEven(match[3]) || !isLengthEven(match[5])) return false
  const { src, title } = parseSrcAndTitle(match[4])
  pushPending(state)
  state.tokens.push({
    type: 'image',
    raw: match[0],
    marker: match[1],
    srcAndTitle: match[4],
    attrs: {
      src: src + encodeURI(match[5]),
      title,
      alt: match[2] + encodeURI(match[3])
    },
    src,
    title,
    parent: state.tokens,
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    },
    alt: match[2],
    backlash: {
      first: match[3],
      second: match[5]
    }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

import { isLengthEven } from '../utils'
import { parseSrcAndTitle } from './utils'
import { correctUrl, pushPending } from './tokenizerShared'

export const consumeLink = (state, recurse) => {
  const match = state.rules.link.exec(state.src)
  correctUrl(match)
  if (!match || !isLengthEven(match[3]) || !isLengthEven(match[5])) return false
  const { src: href, title } = parseSrcAndTitle(match[4])
  pushPending(state)
  state.tokens.push({
    type: 'link',
    raw: match[0],
    marker: match[1],
    hrefAndTitle: match[4],
    href,
    title,
    parent: state.tokens,
    anchor: match[2],
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    },
    children: recurse(
      match[2],
      undefined,
      state.rules,
      state.pos + match[1].length,
      false,
      state.labels,
      state.options
    ),
    backlash: {
      first: match[3],
      second: match[5]
    }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

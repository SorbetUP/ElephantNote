import { isLengthEven } from '../utils'
import { lowerPriority } from './utils'
import { pushPending, VALIDATE_RULES } from './tokenizerShared'

export const consumeInlineChunk = (state, recurse) => {
  for (const rule of ['inline_code', 'del', 'emoji', 'inline_math']) {
    const match = state.rules[rule].exec(state.src)
    if (match && isLengthEven(match[3])) {
      if (rule === 'emoji' && !lowerPriority(state.src, match[0].length, VALIDATE_RULES)) {
        break
      }
      pushPending(state)
      const range = {
        start: state.pos,
        end: state.pos + match[0].length
      }
      const marker = match[1]
      if (rule === 'inline_code' || rule === 'emoji' || rule === 'inline_math') {
        state.tokens.push({
          type: rule,
          raw: match[0],
          range,
          marker,
          parent: state.tokens,
          content: match[2],
          backlash: match[3]
        })
      } else {
        state.tokens.push({
          type: rule,
          raw: match[0],
          range,
          marker,
          parent: state.tokens,
          children: recurse(
            match[2],
            undefined,
            state.rules,
            state.pos + match[1].length,
            false,
            state.labels,
            state.options
          ),
          backlash: match[3]
        })
      }
      state.src = state.src.substring(match[0].length)
      state.pos += match[0].length
      return true
    }
  }
  return false
}

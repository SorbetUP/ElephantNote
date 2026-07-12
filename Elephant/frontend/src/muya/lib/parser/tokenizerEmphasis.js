import { isLengthEven } from '../utils'
import { validateEmphasize } from './utils'
import { pushPending, VALIDATE_RULES } from './tokenizerShared'

export const consumeEmphasis = (state, recurse) => {
  for (const rule of ['strong', 'em']) {
    const match = state.rules[rule].exec(state.src)
    if (match && isLengthEven(match[3])) {
      const isValid = validateEmphasize(
        state.src,
        match[0].length,
        match[1],
        state.pending,
        VALIDATE_RULES
      )
      if (isValid) {
        pushPending(state)
        state.tokens.push({
          type: rule,
          raw: match[0],
          range: {
            start: state.pos,
            end: state.pos + match[0].length
          },
          marker: match[1],
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
        state.src = state.src.substring(match[0].length)
        state.pos += match[0].length
        return true
      }
      break
    }
  }
  return false
}

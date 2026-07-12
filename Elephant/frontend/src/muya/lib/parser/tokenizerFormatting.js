import { isLengthEven } from '../utils'
import { lowerPriority, validateEmphasize } from './utils'
import { pushPending, VALIDATE_RULES } from './tokenizerShared'

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

export const consumeSuperSubScript = state => {
  if (!state.options.superSubScript) return false
  const match = state.rules.superscript.exec(state.src) || state.rules.subscript.exec(state.src)
  if (!match) return false
  pushPending(state)
  state.tokens.push({
    type: 'super_sub_script',
    raw: match[0],
    marker: match[1],
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    },
    parent: state.tokens,
    content: match[2]
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

export const consumeFootnoteIdentifier = state => {
  if (state.pos === 0 || !state.options.footnote) return false
  const match = state.rules.footnote_identifier.exec(state.src)
  if (!match) return false
  pushPending(state)
  state.tokens.push({
    type: 'footnote_identifier',
    raw: match[0],
    marker: match[1],
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    },
    parent: state.tokens,
    content: match[2]
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

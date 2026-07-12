import { pushPending } from './tokenizerShared'

export const consumeSuperSubScript = state => {
  if (!state.options.superSubScript) return false
  const match = state.rules.superscript.exec(state.src) ||
    state.rules.subscript.exec(state.src)
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

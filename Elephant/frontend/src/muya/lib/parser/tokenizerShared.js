import { inlineRules } from './rules'
import { findClosingBracket } from './marked/utils'

export const DISALLOWED_HTML_TAG = /(?:title|textarea|style|xmp|iframe|noembed|noframes|script|plaintext)/i

export const VALIDATE_RULES = Object.assign({}, inlineRules)
delete VALIDATE_RULES.em
delete VALIDATE_RULES.strong
delete VALIDATE_RULES.tail_header
delete VALIDATE_RULES.backlash

export const correctUrl = token => {
  if (token && typeof token[4] === 'string') {
    const lastParenIndex = findClosingBracket(token[4], '()')
    if (lastParenIndex > -1) {
      const length = token[0].length - (token[4].length - lastParenIndex)
      token[0] = token[0].substring(0, length)
      const originSrc = token[4].substring(0, lastParenIndex)
      const match = /(\\+)$/.exec(originSrc)
      if (match) {
        token[4] = originSrc.substring(0, originSrc.length - match[1].length)
        token[5] = match[1]
      } else {
        token[4] = originSrc
        token[5] = ''
      }
    }
  }
}

export const matchHtmlTag = (src, disableHtml) => {
  const match = inlineRules.html_tag.exec(src)
  if (!match) return null
  if (disableHtml && (!match[3] || !/^img$/i.test(match[3]))) return null
  return match
}

export const createTokenizerState = (src, pos, top, labels, options, rules) => ({
  originSrc: src,
  src,
  tokens: [],
  pending: '',
  pendingStartPos: pos,
  pos,
  top,
  labels,
  options,
  rules
})

export const pushPending = state => {
  if (state.pending) {
    state.tokens.push({
      type: 'text',
      raw: state.pending,
      content: state.pending,
      range: {
        start: state.pendingStartPos,
        end: state.pos
      }
    })
  }
  state.pendingStartPos = state.pos
  state.pending = ''
}

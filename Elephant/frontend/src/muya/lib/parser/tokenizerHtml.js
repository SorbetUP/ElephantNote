import { getAttributes } from './utils'
import { DISALLOWED_HTML_TAG, matchHtmlTag, pushPending } from './tokenizerShared'

export const consumeHtmlEscape = state => {
  const match = state.rules.html_escape.exec(state.src)
  if (!match) return false
  const length = match[0].length
  pushPending(state)
  state.tokens.push({
    type: 'html_escape',
    raw: match[0],
    escapeCharacter: match[1],
    parent: state.tokens,
    range: { start: state.pos, end: state.pos + length }
  })
  state.src = state.src.substring(length)
  state.pos += length
  return true
}

export const consumeHtmlTag = (state, recurse) => {
  const match = matchHtmlTag(state.src, state.options.disableHtml)
  let attrs
  if (match && match[1] && !match[3]) {
    const length = match[0].length
    pushPending(state)
    state.tokens.push({
      type: 'html_tag',
      raw: match[0],
      tag: '<!---->',
      openTag: match[1],
      parent: state.tokens,
      attrs: {},
      range: { start: state.pos, end: state.pos + length }
    })
    state.src = state.src.substring(length)
    state.pos += length
    return true
  }
  if (!match || DISALLOWED_HTML_TAG.test(match[3]) || !(attrs = getAttributes(match[0]))) {
    return false
  }

  const length = match[0].length
  pushPending(state)
  state.tokens.push({
    type: 'html_tag',
    raw: match[0],
    tag: match[3],
    openTag: match[2],
    closeTag: match[5],
    parent: state.tokens,
    attrs,
    content: match[4],
    children: match[4]
      ? recurse(match[4], undefined, state.rules, state.pos + match[2].length, false, state.labels, state.options)
      : '',
    range: { start: state.pos, end: state.pos + length }
  })
  state.src = state.src.substring(length)
  state.pos += length
  return true
}

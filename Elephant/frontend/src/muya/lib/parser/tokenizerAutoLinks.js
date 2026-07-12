import { pushPending } from './tokenizerShared'

export const consumeAutoLinkExtension = state => {
  const match = state.rules.auto_link_extension.exec(state.src)
  if (!match || !state.top || (state.pos !== 0 && !/[* _~(]{1}/.test(state.originSrc[state.pos - 1]))) {
    return false
  }
  pushPending(state)
  state.tokens.push({
    type: 'auto_link_extension',
    raw: match[0],
    www: match[1],
    url: match[2],
    email: match[3],
    linkType: match[1] ? 'www' : match[2] ? 'url' : 'email',
    parent: state.tokens,
    range: { start: state.pos, end: state.pos + match[0].length }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

export const consumeAutoLink = state => {
  const match = state.rules.auto_link.exec(state.src)
  if (!match) return false
  pushPending(state)
  state.tokens.push({
    type: 'auto_link',
    raw: match[0],
    href: match[1],
    email: match[2],
    isLink: !!match[1],
    marker: '<',
    parent: state.tokens,
    range: { start: state.pos, end: state.pos + match[0].length }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
  return true
}

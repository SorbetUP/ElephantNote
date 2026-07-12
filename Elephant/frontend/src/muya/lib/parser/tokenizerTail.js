import { getAttributes } from './utils'
import {
  DISALLOWED_HTML_TAG,
  matchHtmlTag,
  pushPending
} from './tokenizerShared'

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
    range: {
      start: state.pos,
      end: state.pos + length
    }
  })
  state.src = state.src.substring(length)
  state.pos += length
  return true
}

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
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    }
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
    range: {
      start: state.pos,
      end: state.pos + match[0].length
    }
  })
  state.src = state.src.substring(match[0].length)
  state.pos += match[0].length
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
      range: {
        start: state.pos,
        end: state.pos + length
      }
    })
    state.src = state.src.substring(length)
    state.pos += length
    return true
  }
  if (
    match &&
    !DISALLOWED_HTML_TAG.test(match[3]) &&
    (attrs = getAttributes(match[0]))
  ) {
    const tag = match[3]
    const html = match[0]
    const length = match[0].length
    pushPending(state)
    state.tokens.push({
      type: 'html_tag',
      raw: html,
      tag,
      openTag: match[2],
      closeTag: match[5],
      parent: state.tokens,
      attrs,
      content: match[4],
      children: match[4]
        ? recurse(
          match[4],
          undefined,
          state.rules,
          state.pos + match[2].length,
          false,
          state.labels,
          state.options
        )
        : '',
      range: {
        start: state.pos,
        end: state.pos + length
      }
    })
    state.src = state.src.substring(length)
    state.pos += length
    return true
  }
  return false
}

const consumeLineBreak = (state, ruleName, type) => {
  const match = state.rules[ruleName].exec(state.src)
  if (!match) return false
  const length = match[0].length
  pushPending(state)
  state.tokens.push({
    type,
    raw: match[0],
    ...(type === 'soft_line_break'
      ? { lineBreak: match[1] }
      : { spaces: match[1], lineBreak: match[2] }),
    isAtEnd: match.input.length === match[0].length,
    parent: state.tokens,
    range: {
      start: state.pos,
      end: state.pos + length
    }
  })
  state.src = state.src.substring(length)
  state.pos += length
  return true
}

export const consumeSoftLineBreak = state => {
  return consumeLineBreak(state, 'soft_line_break', 'soft_line_break')
}

export const consumeHardLineBreak = state => {
  return consumeLineBreak(state, 'hard_line_break', 'hard_line_break')
}

export const consumeTailHeader = state => {
  const match = state.rules.tail_header.exec(state.src)
  if (!match || !state.top) return false
  pushPending(state)
  state.tokens.push({
    type: 'tail_header',
    raw: match[1],
    marker: match[1],
    parent: state.tokens,
    range: {
      start: state.pos,
      end: state.pos + match[1].length
    }
  })
  state.src = state.src.substring(match[1].length)
  state.pos += match[1].length
  return true
}

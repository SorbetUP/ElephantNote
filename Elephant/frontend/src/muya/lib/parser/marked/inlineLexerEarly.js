import { escape, findClosingBracket, getUniqueId, rtrim } from './utils'
import { lowerPriority } from '../utils'

export const consumeEscapeFootnoteTag = (lexer, state, options) => {
  let cap = lexer.rules.escape.exec(state.src)
  if (cap) {
    state.src = state.src.substring(cap[0].length)
    state.lastChar = cap[0].charAt(cap[0].length - 1)
    state.out += escape(cap[1])
    return true
  }

  if (options.footnote) {
    cap = lexer.rules.footnoteIdentifier.exec(state.src)
    if (cap) {
      state.src = state.src.substring(cap[0].length)
      state.lastChar = cap[0].charAt(cap[0].length - 1)
      const identifier = cap[1]
      const footnoteInfo = lexer.footnotes[identifier] || {}
      if (footnoteInfo.footnoteIdentifierId === undefined) {
        footnoteInfo.footnoteIdentifierId = getUniqueId()
      }
      state.out += lexer.renderer.footnoteIdentifier(identifier, footnoteInfo)
    }
  }

  cap = lexer.rules.tag.exec(state.src)
  if (!cap) return false
  if (!lexer.inLink && /^<a /i.test(cap[0])) {
    lexer.inLink = true
  } else if (lexer.inLink && /^<\/a>/i.test(cap[0])) {
    lexer.inLink = false
  }
  if (!lexer.inRawBlock && /^<(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
    lexer.inRawBlock = true
  } else if (lexer.inRawBlock && /^<\/(pre|code|kbd|script)(\s|>)/i.test(cap[0])) {
    lexer.inRawBlock = false
  }
  state.src = state.src.substring(cap[0].length)
  state.lastChar = cap[0].charAt(cap[0].length - 1)
  state.out += lexer.renderer.html(
    lexer.options.sanitize
      ? lexer.options.sanitizer
        ? lexer.options.sanitizer(cap[0])
        : escape(cap[0])
      : cap[0]
  )
  return true
}

export const consumeLink = (lexer, state) => {
  const cap = lexer.rules.link.exec(state.src)
  if (!cap || !lowerPriority(state.src, cap[0].length, lexer.highPriorityLinkRules)) {
    return { consumed: false }
  }

  const trimmedUrl = cap[2].trim()
  if (!lexer.options.pedantic && trimmedUrl.startsWith('<')) {
    if (!trimmedUrl.endsWith('>')) return { consumed: true, returnValue: undefined }
    const rtrimSlash = rtrim(trimmedUrl.slice(0, -1), '\\')
    if ((trimmedUrl.length - rtrimSlash.length) % 2 === 0) {
      return { consumed: true, returnValue: undefined }
    }
  } else {
    const lastParenIndex = findClosingBracket(cap[2], '()')
    if (lastParenIndex > -1) {
      const start = cap[0].indexOf('!') === 0 ? 5 : 4
      const linkLen = start + cap[1].length + lastParenIndex
      cap[2] = cap[2].substring(0, lastParenIndex)
      cap[0] = cap[0].substring(0, linkLen).trim()
      cap[3] = ''
    }
  }

  state.src = state.src.substring(cap[0].length)
  state.lastChar = cap[0].charAt(cap[0].length - 1)
  let href = cap[2]
  let title
  if (lexer.options.pedantic) {
    const link = /^([^'"]*[^\s])\s+(['"])(.*)\2/.exec(href)
    if (link) {
      href = link[1]
      title = link[3]
    }
  } else {
    title = cap[3] ? cap[3].slice(1, -1) : ''
  }
  href = href.trim()
  if (href.startsWith('<')) {
    if (lexer.options.pedantic && !trimmedUrl.endsWith('>')) href = href.slice(1)
    else href = href.slice(1, -1)
  }
  lexer.inLink = true
  state.out += lexer.outputLink(cap, {
    href: lexer.escapes(href),
    title: lexer.escapes(title)
  })
  lexer.inLink = false
  return { consumed: true, restart: true }
}

export const consumeReferenceLink = (lexer, state) => {
  const cap = lexer.rules.reflink.exec(state.src) || lexer.rules.nolink.exec(state.src)
  if (!cap) return false
  state.src = state.src.substring(cap[0].length)
  state.lastChar = cap[0].charAt(cap[0].length - 1)
  const key = (cap[2] || cap[1]).replace(/\s+/g, ' ').toLowerCase()
  const link = lexer.links[key]
  if (!link || !link.href) {
    state.out += cap[0].charAt(0)
    state.src = cap[0].substring(1) + state.src
    return true
  }
  lexer.inLink = true
  state.out += lexer.outputLink(cap, link)
  lexer.inLink = false
  return true
}

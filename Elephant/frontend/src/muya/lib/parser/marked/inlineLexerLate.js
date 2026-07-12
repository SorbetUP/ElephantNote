import { escape } from './utils'

export const consumeCodeBreakDelete = (lexer, state) => {
  let cap = lexer.rules.code.exec(state.src)
  if (cap) {
    state.src = state.src.substring(cap[0].length)
    state.lastChar = cap[0].charAt(cap[0].length - 1)
    let text = cap[2].replace(/\n/g, ' ')
    const hasNonSpaceChars = /[^ ]/.test(text)
    const hasSpaceCharsOnBothEnds = text.startsWith(' ') && text.endsWith(' ')
    if (hasNonSpaceChars && hasSpaceCharsOnBothEnds) {
      text = text.substring(1, text.length - 1)
    }
    state.out += lexer.renderer.codespan(escape(text, true))
    return true
  }

  cap = lexer.rules.br.exec(state.src)
  if (cap) {
    state.src = state.src.substring(cap[0].length)
    state.lastChar = cap[0].charAt(cap[0].length - 1)
    state.out += lexer.renderer.br()
    return true
  }

  cap = lexer.rules.del.exec(state.src)
  if (cap) {
    state.src = state.src.substring(cap[0].length)
    state.lastChar = cap[0].charAt(cap[0].length - 1)
    state.out += lexer.renderer.del(lexer.output(cap[2]))
    return true
  }
  return false
}

export const consumeAutolink = (lexer, state) => {
  const cap = lexer.rules.autolink.exec(state.src)
  if (!cap) return false
  state.src = state.src.substring(cap[0].length)
  state.lastChar = cap[0].charAt(cap[0].length - 1)
  let text
  let href
  if (cap[2] === '@') {
    text = escape(lexer.mangle(cap[1]))
    href = 'mailto:' + text
  } else {
    text = escape(cap[1])
    href = text
  }
  state.out += lexer.renderer.link(href, null, text)
  return true
}

export const consumeUrl = (lexer, state) => {
  const cap = lexer.rules.url.exec(state.src)
  if (lexer.inLink || !cap) return false
  let text
  let href
  if (cap[2] === '@') {
    text = escape(cap[0])
    href = 'mailto:' + text
  } else {
    let previous
    do {
      previous = cap[0]
      cap[0] = lexer.rules._backpedal.exec(cap[0])[0]
    } while (previous !== cap[0])
    text = escape(cap[0])
    href = cap[1] === 'www.' ? 'http://' + text : text
  }
  state.src = state.src.substring(cap[0].length)
  state.lastChar = cap[0].charAt(cap[0].length - 1)
  state.out += lexer.renderer.link(href, null, text)
  return true
}

export const consumeText = (lexer, state) => {
  const cap = lexer.rules.text.exec(state.src)
  if (!cap) return false
  state.src = state.src.substring(cap[0].length)
  state.lastChar = cap[0].charAt(cap[0].length - 1)
  if (lexer.inRawBlock) {
    state.out += lexer.renderer.text(
      lexer.options.sanitize
        ? lexer.options.sanitizer
          ? lexer.options.sanitizer(cap[0])
          : escape(cap[0])
        : cap[0]
    )
  } else {
    state.out += lexer.renderer.text(escape(lexer.smartypants(cap[0])))
  }
  return true
}

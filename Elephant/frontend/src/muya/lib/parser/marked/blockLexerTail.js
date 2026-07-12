export const consumeHtmlBlock = (lexer, state) => {
  const match = lexer.rules.html.exec(state.src)
  if (!match) return false
  state.src = state.src.substring(match[0].length)
  lexer.tokens.push({
    type: lexer.options.sanitize ? 'paragraph' : 'html',
    pre:
      !lexer.options.sanitizer &&
      (match[1] === 'pre' || match[1] === 'script' || match[1] === 'style'),
    text:
      state.cursorAnchorFocus +
      (lexer.options.sanitize
        ? lexer.options.sanitizer
          ? lexer.options.sanitizer(match[0])
          : escape(match[0])
        : match[0])
  })
  return true
}

export const consumeDefinition = (lexer, state) => {
  let match = lexer.rules.def.exec(state.src)
  if (!state.top || !match) return false
  let text = ''
  do {
    state.src = state.src.substring(match[0].length)
    if (match[3]) match[3] = match[3].substring(1, match[3].length - 1)
    const tag = match[1].toLowerCase().replace(/\s+/g, ' ')
    if (!lexer.tokens.links[tag]) {
      lexer.tokens.links[tag] = {
        href: match[2],
        title: match[3]
      }
    }
    text += match[0]
    if (match[0].endsWith('\n\n')) break
    match = lexer.rules.def.exec(state.src)
  } while (match)

  if (lexer.options.disableInline) {
    lexer.tokens.push({
      type: 'paragraph',
      text: state.cursorAnchorFocus + text.replace(/\n*$/, '')
    })
  }
  return true
}

export const consumeSetextHeading = (lexer, state) => {
  const match = lexer.rules.lheading.exec(state.src)
  if (!match) return false
  const precededToken = lexer.tokens[lexer.tokens.length - 1]
  const chops = match[0].trim().split(/\n/)
  const marker = chops[chops.length - 1]
  state.src = state.src.substring(match[0].length)
  if (precededToken && precededToken.type === 'paragraph') {
    lexer.tokens.pop()
    lexer.tokens.push({
      type: 'heading',
      headingStyle: 'setext',
      depth: match[2].charAt(0) === '=' ? 1 : 2,
      text: state.cursorAnchorFocus + (precededToken.text + '\n' + match[1]),
      marker
    })
  } else {
    lexer.tokens.push({
      type: 'heading',
      headingStyle: 'setext',
      depth: match[2].charAt(0) === '=' ? 1 : 2,
      text: state.cursorAnchorFocus + match[1],
      marker
    })
  }
  return true
}

export const consumeParagraph = (lexer, state) => {
  const match = lexer.rules.paragraph.exec(state.src)
  if (!state.top || !match) return false
  state.src = state.src.substring(match[0].length)
  if (/^\[toc\]\n?$/i.test(match[1])) {
    lexer.tokens.push({ type: 'toc', text: '[TOC]' })
    return true
  }
  lexer.tokens.push({
    type: 'paragraph',
    text:
      state.cursorAnchorFocus +
      (match[1].charAt(match[1].length - 1) === '\n'
        ? match[1].slice(0, -1)
        : match[1])
  })
  return true
}

export const consumeText = (lexer, state) => {
  const match = lexer.rules.text.exec(state.src)
  if (!match) return false
  state.src = state.src.substring(match[0].length)
  lexer.tokens.push({
    type: 'text',
    text: state.cursorAnchorFocus + match[0]
  })
  return true
}

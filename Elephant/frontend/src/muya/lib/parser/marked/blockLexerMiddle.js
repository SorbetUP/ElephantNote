import { rtrim } from './utils'

export const consumeHeading = (lexer, state) => {
  const match = lexer.rules.heading.exec(state.src)
  if (!match) return false
  state.src = state.src.substring(match[0].length)
  let text = state.cursorAnchorFocus + (match[2] ? match[2].trim() : '')
  if (text.endsWith('#')) {
    const trimmed = rtrim(text, '#')
    if (lexer.options.pedantic) {
      text = trimmed.trim()
    } else if (!trimmed || trimmed.endsWith(' ')) {
      text = trimmed.trim()
    }
  }
  lexer.tokens.push({
    type: 'heading',
    headingStyle: 'atx',
    depth: match[1].length,
    text
  })
  return true
}

export const consumeHorizontalRule = (lexer, state) => {
  const match = lexer.rules.hr.exec(state.src)
  if (!match) return false
  const marker = state.cursorAnchorFocus + match[0].replace(/\n*$/, '')
  state.src = state.src.substring(match[0].length)
  lexer.tokens.push({ type: 'hr', marker })
  return true
}

export const consumeBlockquote = (lexer, state) => {
  let match = lexer.rules.blockquote.exec(state.src)
  if (!match) return false
  state.src = state.src.substring(match[0].length)
  lexer.tokens.push({ type: 'blockquote_start' })
  match = match[0].replace(/^ *> ?/gm, '')
  lexer.token(match, state.top, null, state.checkCursorSignature)
  lexer.tokens.push({ type: 'blockquote_end' })
  return true
}

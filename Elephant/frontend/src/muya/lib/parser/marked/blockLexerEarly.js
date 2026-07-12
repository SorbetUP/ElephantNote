import { getUniqueId, rtrim } from './utils'
import { indentCodeCompensation } from './blockLexerPreprocess'

export const consumeNewline = (lexer, state) => {
  const match = lexer.rules.newline.exec(state.src)
  if (!match) return false
  state.src = state.src.substring(match[0].length)
  if (match[0].length > 1) lexer.tokens.push({ type: 'space' })
  return true
}

export const consumeIndentedCode = (lexer, state) => {
  let match = lexer.rules.code.exec(state.src)
  if (!match) return false
  const lastToken = lexer.tokens[lexer.tokens.length - 1]
  state.src = state.src.substring(match[0].length)
  if (lastToken && lastToken.type === 'paragraph') {
    lastToken.text += `\n${match[0].trimRight()}`
  } else {
    match = match[0].replace(/^ {4}/gm, '')
    lexer.tokens.push({
      type: 'code',
      codeBlockStyle: 'indented',
      text:
        state.cursorAnchorFocus +
        (!lexer.options.pedantic ? rtrim(match, '\n') : match)
    })
  }
  return true
}

export const consumeMath = (lexer, state) => {
  if (!lexer.options.math) return false
  let match = lexer.rules.multiplemath.exec(state.src)
  if (match) {
    state.src = state.src.substring(match[0].length)
    lexer.tokens.push({
      type: 'multiplemath',
      text: state.cursorAnchorFocus + match[1],
      mathStyle: ''
    })
    return true
  }
  if (lexer.options.isGitlabCompatibilityEnabled) {
    match = lexer.rules.multiplemathGitlab.exec(state.src)
    if (match) {
      state.src = state.src.substring(match[0].length)
      lexer.tokens.push({
        type: 'multiplemath',
        text: state.cursorAnchorFocus + (match[2] || ''),
        mathStyle: 'gitlab'
      })
      return true
    }
  }
  return false
}

export const consumeFootnote = (lexer, state) => {
  if (!lexer.options.footnote) return false
  let match = lexer.rules.footnote.exec(state.src)
  if (!state.top || !match) return false
  state.src = state.src.substring(match[0].length)
  const identifier = match[1]
  lexer.tokens.push({ type: 'footnote_start', identifier })
  lexer.tokens.footnotes[identifier] = {
    order: ++lexer.footnoteOrder,
    identifier,
    footnoteId: getUniqueId()
  }

  /* eslint-disable no-useless-escape */
  match = match[0].replace(/^\[\^[^\^\[\]\s]+?(?<!\\)\]:\s*/gm, '')
  match = match.replace(/\n {4}(?=[^\s])/g, '\n')
  /* eslint-enable no-useless-escape */
  lexer.token(match, state.top)
  lexer.tokens.push({ type: 'footnote_end' })
  return true
}

export const consumeFence = (lexer, state) => {
  const match = lexer.rules.fences.exec(state.src)
  if (!match) return false
  state.src = state.src.substring(match[0].length)
  const raw = match[0]
  const text =
    state.cursorAnchorFocus + indentCodeCompensation(raw, match[3] || '')
  lexer.tokens.push({
    type: 'code',
    codeBlockStyle: 'fenced',
    lang: match[2] ? match[2].trim() : match[2],
    text
  })
  return true
}

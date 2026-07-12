import { validateEmphasize } from '../utils'

export const consumeMathEmojiScript = (lexer, state, options) => {
  let cap
  if (options.math) {
    cap = lexer.rules.math.exec(state.src)
    if (cap) {
      state.src = state.src.substring(cap[0].length)
      state.lastChar = cap[0].charAt(cap[0].length - 1)
      state.out += lexer.renderer.inlineMath(cap[1])
    }
  }

  if (options.emoji) {
    cap = lexer.rules.emoji.exec(state.src)
    if (cap) {
      state.src = state.src.substring(cap[0].length)
      state.lastChar = cap[0].charAt(cap[0].length - 1)
      state.out += lexer.renderer.emoji(cap[0], cap[2])
    }
  }

  if (options.superSubScript) {
    cap = lexer.rules.superscript.exec(state.src) || lexer.rules.subscript.exec(state.src)
    if (cap) {
      state.src = state.src.substring(cap[0].length)
      state.lastChar = cap[0].charAt(cap[0].length - 1)
      state.out += lexer.renderer.script(cap[2], cap[1])
    }
  }
}

export const consumeEmphasis = (lexer, state) => {
  let cap = lexer.rules.strong.exec(state.src)
  if (cap) {
    const marker = cap[0].match(/^(?:_{1,2}|\*{1,2})/)[0]
    const isValid = validateEmphasize(
      state.src,
      cap[0].length,
      marker,
      state.lastChar,
      lexer.highPriorityEmpRules
    )
    if (isValid) {
      state.src = state.src.substring(cap[0].length)
      state.lastChar = cap[0].charAt(cap[0].length - 1)
      state.out += lexer.renderer.strong(
        lexer.output(cap[4] || cap[3] || cap[2] || cap[1])
      )
      return true
    }
  }

  cap = lexer.rules.em.exec(state.src)
  if (cap) {
    const marker = cap[0].match(/^(?:_{1,2}|\*{1,2})/)[0]
    const isValid = validateEmphasize(
      state.src,
      cap[0].length,
      marker,
      state.lastChar,
      lexer.highPriorityEmpRules
    )
    if (isValid) {
      state.src = state.src.substring(cap[0].length)
      state.lastChar = cap[0].charAt(cap[0].length - 1)
      state.out += lexer.renderer.em(
        lexer.output(cap[6] || cap[5] || cap[4] || cap[3] || cap[2] || cap[1])
      )
      return true
    }
  }
  return false
}

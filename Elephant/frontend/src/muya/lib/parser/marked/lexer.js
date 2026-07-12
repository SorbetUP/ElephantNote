import { normal, gfm, pedantic } from './blockRules'
import options from './options'
import { lexMarkdown } from './blockLexerPreprocess'
import tokenizeBlocks from './blockLexerToken'

function Lexer(opts) {
  this.tokens = []
  this.tokens.links = Object.create(null)
  this.tokens.footnotes = Object.create(null)
  this.footnoteOrder = 0
  this.options = Object.assign({}, options, opts)
  this.rules = normal

  if (this.options.pedantic) {
    this.rules = pedantic
  } else if (this.options.gfm) {
    this.rules = gfm
  }
}

Lexer.prototype.lex = function(src, checkCursorSignature = false) {
  return lexMarkdown(this, src, checkCursorSignature)
}

Lexer.prototype.token = function(
  src,
  top,
  prevListIsOrdered = null,
  checkCursorSignature = false
) {
  return tokenizeBlocks(
    this,
    src,
    top,
    prevListIsOrdered,
    checkCursorSignature
  )
}

export default Lexer

import Renderer from './renderer'
import InlineLexer from './inlineLexer'
import Slugger from './slugger'
import TextRenderer from './textRenderer'
import defaultOptions from './options'
import { renderCurrentToken } from './tokenRenderer'

function Parser(options) {
  this.tokens = []
  this.token = null
  this.footnotes = null
  this.footnoteIdentifier = ''
  this.options = options || defaultOptions
  this.options.renderer = this.options.renderer || new Renderer()
  this.renderer = this.options.renderer
  this.renderer.options = this.options
  this.slugger = new Slugger()
}

Parser.prototype.parse = function(src) {
  this.inline = new InlineLexer(src.links, src.footnotes, this.options)
  this.inlineText = new InlineLexer(
    src.links,
    src.footnotes,
    Object.assign({}, this.options, { renderer: new TextRenderer() })
  )
  this.tokens = src.reverse()
  this.footnotes = src.footnotes

  let output = ''
  while (this.next()) output += this.tok()
  return output
}

Parser.prototype.next = function() {
  this.token = this.tokens.pop()
  return this.token
}

Parser.prototype.peek = function() {
  return this.tokens[this.tokens.length - 1] || 0
}

Parser.prototype.parseText = function() {
  let body = this.token.text
  while (this.peek().type === 'text') body += `\n${this.next().text}`
  return this.inline.output(body)
}

Parser.prototype.tok = function() {
  return renderCurrentToken(this)
}

export default Parser

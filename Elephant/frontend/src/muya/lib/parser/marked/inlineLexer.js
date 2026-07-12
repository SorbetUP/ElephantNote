import Renderer from './renderer'
import { normal, breaks, gfm, pedantic } from './inlineRules'
import defaultOptions from './options'
import outputInline from './inlineLexerOutput'
import { installInlineLexerMethods } from './inlineLexerMethods'

function InlineLexer(links, footnotes, options) {
  this.options = options || defaultOptions
  this.links = links
  this.footnotes = footnotes
  this.rules = normal
  this.renderer = this.options.renderer || new Renderer()
  this.renderer.options = this.options

  if (!this.links) throw new Error('Tokens array requires a `links` property.')
  if (this.options.pedantic) {
    this.rules = pedantic
  } else if (this.options.gfm) {
    this.rules = this.options.breaks ? breaks : gfm
  }

  this.highPriorityEmpRules = {}
  this.highPriorityLinkRules = {}
  for (const key of Object.keys(this.rules)) {
    if (/^(?:autolink|link|code|tag)$/.test(key) && this.rules[key] instanceof RegExp) {
      this.highPriorityEmpRules[key] = this.rules[key]
    }
  }
  for (const key of Object.keys(this.rules)) {
    if (/^(?:autolink|code|tag)$/.test(key) && this.rules[key] instanceof RegExp) {
      this.highPriorityLinkRules[key] = this.rules[key]
    }
  }
}

InlineLexer.prototype.output = outputInline
installInlineLexerMethods(InlineLexer)

export default InlineLexer

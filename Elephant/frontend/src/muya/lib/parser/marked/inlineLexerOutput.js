import { escape } from './utils'
import {
  consumeEscapeFootnoteTag,
  consumeLink,
  consumeReferenceLink
} from './inlineLexerEarly'
import {
  consumeEmphasis,
  consumeMathEmojiScript
} from './inlineLexerFormatting'
import {
  consumeAutolink,
  consumeCodeBreakDelete,
  consumeText,
  consumeUrl
} from './inlineLexerLate'

export default function outputInline(src) {
  const options = this.options
  if (options.disableInline) return escape(src)

  const state = { src, out: '', lastChar: '' }
  while (state.src) {
    if (consumeEscapeFootnoteTag(this, state, options)) continue

    const linkResult = consumeLink(this, state)
    if (linkResult.consumed) {
      if (Object.prototype.hasOwnProperty.call(linkResult, 'returnValue')) {
        return linkResult.returnValue
      }
      if (linkResult.restart) continue
    }

    if (consumeReferenceLink(this, state)) continue
    consumeMathEmojiScript(this, state, options)
    if (consumeEmphasis(this, state)) continue
    if (consumeCodeBreakDelete(this, state)) continue
    if (consumeAutolink(this, state)) continue
    if (consumeUrl(this, state)) continue
    if (consumeText(this, state)) continue

    if (state.src) {
      throw new Error('Infinite loop on byte: ' + state.src.charCodeAt(0))
    }
  }
  return state.out
}

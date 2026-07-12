import { beginRules, inlineRules, inlineExtensionRules } from './rules'
import { union } from '../utils'
import consumeTokenizerBegin from './tokenizerBegin'
import {
  consumeBacklash,
  consumeEmphasis,
  consumeFootnoteIdentifier,
  consumeInlineChunk,
  consumeSuperSubScript
} from './tokenizerFormatting'
import {
  consumeImage,
  consumeLink,
  consumeReferenceImage,
  consumeReferenceLink
} from './tokenizerLinks'
import {
  consumeAutoLink,
  consumeAutoLinkExtension,
  consumeHardLineBreak,
  consumeHtmlEscape,
  consumeHtmlTag,
  consumeSoftLineBreak,
  consumeTailHeader
} from './tokenizerTail'
import {
  createTokenizerState,
  pushPending
} from './tokenizerShared'

const tokenizerFac = (
  src,
  beginRulesArg,
  rules,
  pos = 0,
  top,
  labels,
  options
) => {
  const state = createTokenizerState(src, pos, top, labels, options, rules)
  consumeTokenizerBegin(state, beginRulesArg)

  while (state.src.length) {
    if (consumeBacklash(state)) continue
    if (consumeEmphasis(state, tokenizerFac)) continue
    if (consumeInlineChunk(state, tokenizerFac)) continue
    if (consumeSuperSubScript(state)) continue
    if (consumeFootnoteIdentifier(state)) continue
    if (consumeImage(state)) continue
    if (consumeLink(state, tokenizerFac)) continue
    if (consumeReferenceLink(state, tokenizerFac)) continue
    if (consumeReferenceImage(state)) continue
    if (consumeHtmlEscape(state)) continue
    if (consumeAutoLinkExtension(state)) continue
    if (consumeAutoLink(state)) continue
    if (consumeHtmlTag(state, tokenizerFac)) continue
    if (consumeSoftLineBreak(state)) continue
    if (consumeHardLineBreak(state)) continue
    if (consumeTailHeader(state)) continue

    if (!state.pending) state.pendingStartPos = state.pos
    state.pending += state.src[0]
    state.src = state.src.substring(1)
    state.pos++
  }

  pushPending(state)
  return state.tokens
}

export const tokenizer = (
  src,
  {
    highlights = [],
    hasBeginRules = true,
    labels = new Map(),
    options = {}
  } = {}
) => {
  const rules = Object.assign({}, inlineRules, inlineExtensionRules)
  const tokens = tokenizerFac(
    src,
    hasBeginRules ? beginRules : null,
    rules,
    0,
    true,
    labels,
    options
  )

  const postTokenizer = items => {
    for (const token of items) {
      for (const light of highlights) {
        const highlight = union(token.range, light)
        if (highlight) {
          if (token.highlights && Array.isArray(token.highlights)) {
            token.highlights.push(highlight)
          } else {
            token.highlights = [highlight]
          }
        }
      }
      if (token.children && Array.isArray(token.children)) {
        postTokenizer(token.children)
      }
    }
  }
  if (highlights.length) postTokenizer(tokens)
  return tokens
}

export const generator = tokens => {
  let result = ''
  for (const token of tokens) result += token.raw
  return result
}

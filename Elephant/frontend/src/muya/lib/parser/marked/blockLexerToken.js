import consumeFrontmatter from './blockLexerFrontmatter'
import {
  consumeFence,
  consumeFootnote,
  consumeIndentedCode,
  consumeMath,
  consumeNewline
} from './blockLexerEarly'
import {
  consumeBlockquote,
  consumeHeading,
  consumeHorizontalRule
} from './blockLexerMiddle'
import {
  consumeNoPipeTable,
  consumePipeTable
} from './blockLexerTables'
import consumeList from './blockLexerList'
import {
  consumeDefinition,
  consumeHtmlBlock,
  consumeParagraph,
  consumeSetextHeading,
  consumeText
} from './blockLexerTail'
import {
  createBlockLexerState,
  prepareCursorSignature
} from './blockLexerState'

export default function tokenizeBlocks(
  lexer,
  src,
  top,
  prevListIsOrdered = null,
  checkCursorSignature = false
) {
  const state = createBlockLexerState(
    src,
    top,
    prevListIsOrdered,
    checkCursorSignature
  )
  consumeFrontmatter(lexer, state)

  while (state.src) {
    prepareCursorSignature(state)
    consumeNewline(lexer, state)
    if (consumeIndentedCode(lexer, state)) continue
    if (consumeMath(lexer, state)) continue
    if (consumeFootnote(lexer, state)) continue
    if (consumeFence(lexer, state)) continue
    if (consumeHeading(lexer, state)) continue
    if (consumeNoPipeTable(lexer, state)) continue
    if (consumeHorizontalRule(lexer, state)) continue
    if (consumeBlockquote(lexer, state)) continue
    if (consumeList(lexer, state)) continue
    if (consumeHtmlBlock(lexer, state)) continue
    if (consumeDefinition(lexer, state)) continue
    if (consumePipeTable(lexer, state)) continue
    if (consumeSetextHeading(lexer, state)) continue
    if (consumeParagraph(lexer, state)) continue
    if (consumeText(lexer, state)) continue

    if (state.src) {
      throw new Error('Infinite loop on byte: ' + state.src.charCodeAt(0))
    }
  }
}

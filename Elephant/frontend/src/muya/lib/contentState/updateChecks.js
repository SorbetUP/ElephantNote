import { tokenizer } from '../parser/'
import { conflict } from '../utils'

export const INLINE_UPDATE_FRAGMENTS = [
  '(?:^|\n) {0,3}([*+-] {1,4})',
  '(?:^|\n)(\\[[x ]{1}\\] {1,4})',
  '(?:^|\n) {0,3}(\\d{1,9}(?:\\.|\\)) {1,4})',
  '(?:^|\n) {0,3}(#{1,6})(?=\\s{1,}|$)',
  '^(?:[\\s\\S]+?)\\n {0,3}(\\={3,}|\\-{3,})(?= {1,}|$)',
  '(?:^|\n) {0,3}(>).+',
  '^( {4,})',
  '^(\\[\\^[^\\^\\[\\]\\s]+?(?<!\\\\)\\]: )',
  '(?:^|\n) {0,3}((?:\\* *\\* *\\*|- *- *-|_ *_ *_)[ \\*\\-\\_]*)$'
]

export const INLINE_UPDATE_REG = new RegExp(
  INLINE_UPDATE_FRAGMENTS.join('|'),
  'i'
)

const updateChecks = ContentState => {
  ContentState.prototype.checkSameMarkerOrDelimiter = function(
    list,
    markerOrDelimiter
  ) {
    if (!/ol|ul/.test(list.type)) return false
    return list.children[0].bulletMarkerOrDelimiter === markerOrDelimiter
  }

  ContentState.prototype.checkNeedRender = function(cursor = this.cursor) {
    const { labels } = this.stateRender
    const { start: cursorStart, end: cursorEnd, anchor, focus } = cursor
    const startBlock = this.getBlock(cursorStart ? cursorStart.key : anchor.key)
    const endBlock = this.getBlock(cursorEnd ? cursorEnd.key : focus.key)
    const startOffset = cursorStart ? cursorStart.offset : anchor.offset
    const endOffset = cursorEnd ? cursorEnd.offset : focus.offset
    const noNeedToken = /text|hard_line_break|soft_line_break/

    const conflicts = (block, offset) => {
      for (const token of tokenizer(block.text, {
        labels,
        options: this.muya.options
      })) {
        if (noNeedToken.test(token.type)) continue
        const { start, end } = token.range
        const textLength = block.text.length
        if (
          conflict(
            [Math.max(0, start - 1), Math.min(textLength, end + 1)],
            [offset, offset]
          )
        ) {
          return true
        }
      }
      return false
    }
    return conflicts(startBlock, startOffset) || conflicts(endBlock, endOffset)
  }

  ContentState.prototype.checkInlineUpdate = function(block) {
    if (/figure/.test(block.type)) return false
    if (/cellContent|codeContent|languageInput|footnoteInput/.test(block.functionType)) {
      return false
    }

    let line = null
    const { text } = block
    if (block.type === 'span') {
      line = block
      block = this.getParent(block)
    }
    const listItem = this.getParent(block)
    const [
      match,
      bullet,
      tasklist,
      order,
      atxHeader,
      setextHeader,
      blockquote,
      indentCode,
      footnote,
      hr
    ] = text.match(INLINE_UPDATE_REG) || []

    switch (true) {
      case !!hr && new Set(hr.split('').filter(item => /\S/.test(item))).size === 1:
        return this.updateThematicBreak(block, hr, line)
      case !!bullet && !listItem:
        return this.updateList(block, 'bullet', bullet, line)
      case !!tasklist && listItem && listItem.listItemType === 'bullet':
        return this.updateTaskListItem(block, 'tasklist', tasklist)
      case !!order && !listItem:
        return this.updateList(block, 'order', order, line)
      case !!atxHeader:
        return this.updateAtxHeader(block, atxHeader, line)
      case !!setextHeader:
        return this.updateSetextHeader(block, setextHeader, line)
      case !!blockquote:
        return this.updateBlockQuote(block, line)
      case !!indentCode:
        return this.updateIndentCode(block, line)
      case !!footnote && block.type === 'p' && !block.parent && this.muya.options.footnote:
        return this.updateFootnote(block, line)
      case !match:
      default:
        return this.updateToParagraph(block, line)
    }
  }
}

export default updateChecks
